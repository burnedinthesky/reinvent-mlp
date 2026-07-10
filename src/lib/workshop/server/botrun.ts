/* P4 "Training Loop" interpreter + validator (P4 redesign §3–4).

   runProgram(stage, rng, prog) executes a card program for a fixed 100-epoch
   training loop under batch=1 reading noise and returns a per-epoch frame log the
   client replays verbatim (never re-simulating). Deterministic: same seed +
   program + stage ⇒ identical frames.

   The card language (v3, 7 cards) is a 4-category primitive set over ABSOLUTE 8
   directions and typed A–D variables — every reading lands in a named slot (no
   hidden register):
     OBSERVE   Look 〈here | dir | dirVar〉 → 〈slot〉 — batch=1 sample without
               moving; the reading is stored in the slot (number-typed)
               Scan → 〈slot〉               — 8 probes one step away (8 independent
               batch=1 samples, fixed DIR8 order); the lowest-reading direction is
               stored in the slot (direction-typed); no move, no best update
     VARIABLES Set 〈slot〉 = 〈value〉         — store a number or a direction
     LOGIC     If 〈A〉 〈</>〉 〈B〉 {then} {else} — numeric compare, multi-card branches
     ACTIONS   Move 〈dir | dirVar | random〉  — move one step, auto-reads
               Jump                          — random teleport + auto-read
               Step ×〈f〉 (wire tag 'lr')     — scale the step size (= learning rate)

   validateProgram(raw) hand-validates untrusted RPC input in the strict
   submission-scoring style, two-pass: (1) structural — every card a known discriminant with
   enum-checked params, ≤20 loop cards, If not nested, then ≤3 / else ≤3; then
   (2) type inference over the four slots — a slot is number-typed or
   direction-typed (Look/Scan bindings count as typed writes), and reads must
   agree (a never-Set slot, a type-conflicting write, a direction var in a numeric
   context, or `randomDir` on Look all reject). v2 shapes ({k:'loss'} exprs,
   slot-less Look) reject with FRIENDLY messages so a stale open tab gets
   "rebuild it in the new editor", not a cryptic enum error.
   Nothing unvalidated is ever run.

   Pure (no Prisma), so it stays unit-testable in isolation. */

import type { Rng } from "../rng";
import type { StageTerrain } from "../terrain";
import type {
    BotProgram,
    Card,
    Dir8,
    DirParam,
    LrFactor,
    NumExpr,
    RunFrame,
    SetValue,
    Setup,
    SimpleCard,
    StageRunResult,
    VarSlot,
} from "../types";

/* ------------------------------------------------------------ preset tables */

export const DIR8: Dir8[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const VAR_SLOTS: VarSlot[] = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
];

/** build a Record keyed by every VarSlot from a per-slot fill function. */
const slotRecord = <T>(fill: (s: VarSlot) => T): Record<VarSlot, T> =>
    Object.fromEntries(VAR_SLOTS.map((s) => [s, fill(s)])) as Record<
        VarSlot,
        T
    >;
const LR_PRESETS = [0.1, 0.25, 0.5, 1.0, 2.0];
const LR_FACTORS = [0.5, 0.9, 0.95, 1, 1.1, 2];
const STARTS = ["center", "random"];

/** absolute compass angle (degrees, 0 = +w = E, CCW so N = 90° = +b). */
const DIR_ANGLE: Record<Dir8, number> = {
    E: 0,
    NE: 45,
    N: 90,
    NW: 135,
    W: 180,
    SW: 225,
    S: 270,
    SE: 315,
};

const LR_MIN = 0.01;
const LR_MAX = 2.0;
const EPS = 1e-9;

/* Runtime defaults for a slot read before its first Set in epoch 1 (§3). */
const DEFAULT_NUM = 0;
const DEFAULT_DIR: Dir8 = "N";

/* ------------------------------------------------------------ interpreter */

/** A stored variable value: a number or a direction. */
type VarVal = { n: number } | { d: Dir8 };

interface Bot {
    w: number;
    b: number;
    lr: number;
    loss: number; // most recent reading of any kind
    best: number; // lowest at-position reading
    sinceBest: number;
    vars: Record<VarSlot, VarVal>;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** pick a random direction from rng (used by Move random / Set = random dir). */
const randDir = (rng: Rng): Dir8 => DIR8[Math.floor(rng() * 8) % 8];

export function runProgram(
    stage: StageTerrain,
    rng: Rng,
    prog: BotProgram
): StageRunResult {
    const { setup, loop } = prog;

    const spawn = () => {
        if (setup.start === "center") return { w: 0, b: 0 };
        return { w: -4 + 8 * rng(), b: -4 + 8 * rng() };
    };
    const start = spawn();

    const bot: Bot = {
        w: stage.clampG(start.w),
        b: stage.clampG(start.b),
        lr: setup.lr,
        loss: 0,
        best: 0,
        sinceBest: 0,
        // slots start unset; reads before the first Set fall back to the defaults.
        vars: slotRecord((): VarVal => ({ n: DEFAULT_NUM })),
    };
    // spawn reading (batch=1) — an at-position read, so it folds into best.
    bot.loss = stage.sample(bot.w, bot.b, rng);
    bot.best = bot.loss;

    /** snapshot every slot as a plain number|Dir8 for the frame log. */
    const snapVars = (): Record<VarSlot, number | Dir8> =>
        slotRecord((s) => {
            const v = bot.vars[s];
            return "n" in v ? v.n : v.d;
        });

    const frames: RunFrame[] = [
        {
            w: bot.w,
            b: bot.b,
            read: bot.loss,
            best: bot.best,
            sinceBest: bot.sinceBest,
            lr: bot.lr,
            looks: [],
            jumped: false,
            vars: snapVars(),
            ifs: 0,
        },
    ];

    // per-epoch scratch, reset each loop pass.
    let looks: { w: number; b: number; v: number }[] = [];
    let jumped = false;

    /** take a fresh reading at the current spot and fold it into loss/best. */
    const settle = () => {
        bot.loss = stage.sample(bot.w, bot.b, rng);
        if (bot.loss < bot.best - EPS) bot.best = bot.loss;
    };

    const moveAlong = (angle: number) => {
        bot.w = stage.clampG(bot.w + Math.cos(rad(angle)) * bot.lr);
        bot.b = stage.clampG(bot.b + Math.sin(rad(angle)) * bot.lr);
        settle();
    };

    /** resolve a numeric expression to a number (direction vars never reach here —
      the validator guarantees numeric contexts only hold number-typed reads). */
    const numVal = (e: NumExpr): number => {
        switch (e.k) {
            case "best":
                return bot.best;
            case "sinceBest":
                return bot.sinceBest;
            case "num":
                return e.v;
            case "var": {
                const v = bot.vars[e.slot];
                return "n" in v ? v.n : DEFAULT_NUM;
            }
        }
    };

    /** resolve a Set value to a stored variable value. */
    const setVal = (v: SetValue): VarVal => {
        switch (v.k) {
            case "dir":
                return { d: v.d };
            case "randomDir":
                return { d: randDir(rng) };
            default:
                return { n: numVal(v) };
        }
    };

    /** resolve a direction argument to a concrete Dir8. */
    const dirVal = (p: DirParam): Dir8 => {
        switch (p.k) {
            case "dir":
                return p.d;
            case "randomDir":
                return randDir(rng);
            case "var": {
                const v = bot.vars[p.slot];
                return "d" in v ? v.d : DEFAULT_DIR;
            }
        }
    };

    const exec = (card: SimpleCard) => {
        switch (card.t) {
            case "look": {
                if (card.at === "here") {
                    settle(); // at-position read → folds into best
                    bot.vars[card.slot] = { n: bot.loss }; // the reading lands in the slot
                } else {
                    // card.at is a dir literal or a var (never randomDir — validator gate).
                    const d = dirVal(card.at);
                    const angle = DIR_ANGLE[d];
                    const pw = stage.clampG(
                        bot.w + Math.cos(rad(angle)) * bot.lr
                    );
                    const pb = stage.clampG(
                        bot.b + Math.sin(rad(angle)) * bot.lr
                    );
                    const v = stage.sample(pw, pb, rng);
                    bot.loss = v; // distant read: internal telemetry only (never best)
                    bot.vars[card.slot] = { n: v }; // the reading lands in the slot
                    looks.push({ w: pw, b: pb, v });
                }
                break;
            }
            case "scan": {
                // 8 probes one step away, fixed DIR8 order — 8 independent batch=1
                // samples, each pushed into `looks` (radar pings). Strict-< argmin with
                // first-lowest tie-break; the winning direction lands in the slot.
                // No move, no `best` update, and `bot.loss` is untouched (the HUD
                // reading stays the last real reading).
                let bestV = Infinity;
                let bestD: Dir8 = DIR8[0];
                for (const d of DIR8) {
                    const angle = DIR_ANGLE[d];
                    const pw = stage.clampG(
                        bot.w + Math.cos(rad(angle)) * bot.lr
                    );
                    const pb = stage.clampG(
                        bot.b + Math.sin(rad(angle)) * bot.lr
                    );
                    const v = stage.sample(pw, pb, rng);
                    looks.push({ w: pw, b: pb, v });
                    if (v < bestV) {
                        bestV = v;
                        bestD = d;
                    }
                }
                bot.vars[card.slot] = { d: bestD };
                break;
            }
            case "set": {
                bot.vars[card.slot] = setVal(card.v);
                break;
            }
            case "move": {
                moveAlong(DIR_ANGLE[dirVal(card.dir)]);
                break;
            }
            case "jump": {
                bot.w = stage.clampG(-4 + 8 * rng());
                bot.b = stage.clampG(-4 + 8 * rng());
                jumped = true;
                settle();
                // a restart earns fresh patience: without this, an unbeatable lucky
                // `best` makes any `If sinceBest > n {Jump}` program jump EVERY epoch
                // once the threshold trips (the end-of-epoch counter re-increments to 1).
                bot.sinceBest = -1;
                break;
            }
            case "lr": {
                bot.lr = Math.max(LR_MIN, Math.min(LR_MAX, bot.lr * card.f));
                break;
            }
        }
    };

    /** run one top-level card; returns the If truth (for the trace bitmask) or
      null for simple cards. */
    const runCard = (card: Card): boolean | null => {
        if (card.t === "if") {
            const truth =
                card.cmp === "<"
                    ? numVal(card.a) < numVal(card.b)
                    : numVal(card.a) > numVal(card.b);
            const branch = truth ? card.then : card.else;
            for (const c of branch) exec(c);
            return truth;
        }
        exec(card);
        return null;
    };

    const truePath: number[] = [stage.lossAt(bot.w, bot.b)];

    for (let i = 0; i < 100; i++) {
        looks = [];
        jumped = false;
        // If-trace bitmask: bit k set ⇔ the k-th TOP-LEVEL If took `then` this epoch.
        let ifs = 0;
        let ifIdx = 0;
        const bestBefore = bot.best;
        for (const card of loop) {
            const truth = runCard(card);
            if (card.t === "if") {
                if (truth) ifs |= 1 << ifIdx;
                ifIdx++;
            }
        }
        // sinceBest increments once per epoch when best didn't improve (§4).
        if (bot.best < bestBefore - EPS) bot.sinceBest = 0;
        else bot.sinceBest++;
        frames.push({
            w: bot.w,
            b: bot.b,
            read: bot.loss,
            best: bot.best,
            sinceBest: bot.sinceBest,
            lr: bot.lr,
            looks,
            jumped,
            vars: snapVars(),
            ifs,
        });
        truePath.push(stage.lossAt(bot.w, bot.b));
    }

    const finalPos = { w: bot.w, b: bot.b };
    return {
        stage: stage.id,
        frames,
        finalPos,
        trueLoss: stage.lossAt(finalPos.w, finalPos.b),
        truePath,
    };
}

/* ------------------------------------------------------------ validation */

function bad(msg: string): never {
    throw new Error(`invalid program: ${msg}`);
}

function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

const isDir = (v: unknown): v is Dir8 => DIR8.includes(v as Dir8);
const isSlot = (v: unknown): v is VarSlot => VAR_SLOTS.includes(v as VarSlot);

/** Structural validation of a numeric expression. */
function validNumExpr(v: unknown): NumExpr {
    if (!isObj(v)) bad("num expr must be an object");
    switch (v.k) {
        case "loss":
            // v2 shape — the hidden loss register was removed in the v3 language.
            return bad(
                "this program uses the old card set (loss register) — rebuild it in the new editor"
            );
        case "best":
        case "sinceBest":
            return { k: v.k };
        case "num":
            if (typeof v.v !== "number" || !Number.isFinite(v.v))
                bad("num expr needs a finite v");
            return { k: "num", v: v.v };
        case "var":
            if (!isSlot(v.slot)) bad("bad var slot");
            return { k: "var", slot: v.slot };
        default:
            return bad(`unknown num expr kind ${String(v.k)}`);
    }
}

/** Structural validation of a Set value (number expr, direction, or random dir). */
function validSetValue(v: unknown): SetValue {
    if (!isObj(v)) bad("set value must be an object");
    if (v.k === "dir") {
        if (!isDir(v.d)) bad("bad set direction");
        return { k: "dir", d: v.d };
    }
    if (v.k === "randomDir") return { k: "randomDir" };
    return validNumExpr(v);
}

/** Structural validation of a direction argument. `allowRandom` is Move-only. */
function validDirParam(v: unknown, allowRandom: boolean): DirParam {
    if (!isObj(v)) bad("direction must be an object");
    switch (v.k) {
        case "dir":
            if (!isDir(v.d)) bad("bad direction");
            return { k: "dir", d: v.d };
        case "var":
            if (!isSlot(v.slot)) bad("bad direction var slot");
            return { k: "var", slot: v.slot };
        case "randomDir":
            if (!allowRandom) bad("random direction is only valid on Move");
            return { k: "randomDir" };
        default:
            return bad(`unknown direction kind ${String(v.k)}`);
    }
}

/** Structural validation of a simple (non-If) card. */
function validSimpleCard(v: unknown): SimpleCard {
    if (!isObj(v)) bad("card must be an object");
    switch (v.t) {
        case "look": {
            // v3: every Look binds its reading into a chosen slot. A slot-less Look is
            // the v2 shape — reject with the friendly migration message.
            if (!isSlot(v.slot))
                bad("Look now stores its reading into a slot — pick A–D");
            const slot = v.slot;
            if (v.at === "here") return { t: "look", at: "here", slot };
            if (!isObj(v.at)) bad("bad look target");
            if (v.at.k === "dir") {
                if (!isDir(v.at.d)) bad("bad look direction");
                return { t: "look", at: { k: "dir", d: v.at.d }, slot };
            }
            if (v.at.k === "var") {
                if (!isSlot(v.at.slot)) bad("bad look var slot");
                return { t: "look", at: { k: "var", slot: v.at.slot }, slot };
            }
            return bad("random direction is not valid on Look");
        }
        case "scan":
            if (!isSlot(v.slot)) bad("bad scan slot");
            return { t: "scan", slot: v.slot };
        case "set":
            if (!isSlot(v.slot)) bad("bad set slot");
            return { t: "set", slot: v.slot, v: validSetValue(v.v) };
        case "move":
            return { t: "move", dir: validDirParam(v.dir, true) };
        case "jump":
            return { t: "jump" };
        case "lr":
            if (!LR_FACTORS.includes(v.f as number)) bad("bad LR factor");
            return { t: "lr", f: v.f as LrFactor };
        default:
            return bad(`unknown card type ${String(v.t)}`);
    }
}

/** Structural validation of any card (top-level allows If; branches don't). */
function validCard(v: unknown, allowIf: boolean): Card {
    if (isObj(v) && v.t === "if") {
        if (!allowIf) bad("If cannot be nested inside an If branch");
        const a = validNumExpr(v.a);
        const b = validNumExpr(v.b);
        if (v.cmp !== "<" && v.cmp !== ">") bad("bad comparator");
        if (!Array.isArray(v.then)) bad("If then must be an array");
        if (!Array.isArray(v.else)) bad("If else must be an array");
        if (v.then.length < 1 || v.then.length > 3)
            bad("If then must hold 1..3 cards");
        if (v.else.length > 3) bad("If else must hold 0..3 cards");
        const then = v.then.map(validSimpleCard);
        const els = v.else.map(validSimpleCard);
        return { t: "if", a, cmp: v.cmp, b, then, else: els };
    }
    return validSimpleCard(v);
}

/* ---- second pass: variable type inference over the four slots (§3) ---- */

type SlotType = "num" | "dir";

/** Walk every card, collecting per-slot write types (Set values + Look/Scan
    bindings) and read contexts, then resolve var-copies to a fixpoint and reject
    conflicts / unset reads / a direction var used numerically. Throws on any
    violation. */
function checkVarTypes(loop: Card[]): void {
    // direct type each write imposes on its slot: 'num' | 'dir', or a copied slot.
    const setNum = slotRecord(() => false);
    const setDir = slotRecord(() => false);
    const setAny = slotRecord(() => false);
    // slot ← copied-from-slot edges (Set X = var Y): X inherits Y's type.
    const copyEdges: [VarSlot, VarSlot][] = [];
    // reads that demand a numeric slot / a direction slot.
    const numReads = new Set<VarSlot>();
    const dirReads = new Set<VarSlot>();

    const noteNumExpr = (e: NumExpr) => {
        if (e.k === "var") numReads.add(e.slot);
    };
    const noteSet = (slot: VarSlot, v: SetValue) => {
        setAny[slot] = true;
        if (v.k === "dir" || v.k === "randomDir") setDir[slot] = true;
        else if (v.k === "var") copyEdges.push([slot, v.slot]);
        else {
            setNum[slot] = true;
            noteNumExpr(v);
        }
    };
    const noteSimple = (c: SimpleCard) => {
        switch (c.t) {
            case "look":
                if (typeof c.at === "object" && c.at.k === "var")
                    dirReads.add(c.at.slot);
                // the binding writes a number into the slot.
                setAny[c.slot] = true;
                setNum[c.slot] = true;
                break;
            case "scan":
                // the binding writes a direction into the slot.
                setAny[c.slot] = true;
                setDir[c.slot] = true;
                break;
            case "set":
                noteSet(c.slot, c.v);
                break;
            case "move":
                if (c.dir.k === "var") dirReads.add(c.dir.slot);
                break;
            case "jump":
            case "lr":
                break;
        }
    };

    for (const card of loop) {
        if (card.t === "if") {
            noteNumExpr(card.a);
            noteNumExpr(card.b);
            for (const c of card.then) noteSimple(c);
            for (const c of card.else) noteSimple(c);
        } else {
            noteSimple(card);
        }
    }

    // resolve copy edges to a fixpoint so a slot Set only from another var inherits
    // that var's number/direction typing.
    for (let pass = 0; pass < VAR_SLOTS.length + 1; pass++) {
        for (const [dst, src] of copyEdges) {
            if (setNum[src]) setNum[dst] = true;
            if (setDir[src]) setDir[dst] = true;
        }
    }

    for (const slot of VAR_SLOTS) {
        if (setNum[slot] && setDir[slot])
            bad(`slot ${slot} is written with both a number and a direction`);
    }
    const typeOf = (slot: VarSlot): SlotType | null =>
        setDir[slot] ? "dir" : setNum[slot] ? "num" : null;

    for (const slot of numReads) {
        if (!setAny[slot]) bad(`slot ${slot} is read before it is ever Set`);
        if (typeOf(slot) === "dir")
            bad(`slot ${slot} holds a direction but is read as a number`);
    }
    for (const slot of dirReads) {
        if (!setAny[slot]) bad(`slot ${slot} is read before it is ever Set`);
        if (typeOf(slot) === "num")
            bad(`slot ${slot} holds a number but is read as a direction`);
    }
}

/** Validate untrusted program input; throws on anything malformed. Two-pass:
    structural (shape/enums/nesting/caps) then variable type inference. */
export function validateProgram(raw: unknown): BotProgram {
    if (!isObj(raw)) bad("program must be an object");
    const setup = raw.setup;
    if (!isObj(setup)) bad("missing setup");
    if (!STARTS.includes(setup.start as string)) bad("bad setup.start");
    if (!LR_PRESETS.includes(setup.lr as number)) bad("bad setup.lr");
    const okSetup: Setup = {
        start: setup.start as Setup["start"],
        lr: setup.lr as Setup["lr"],
    };

    const loop = raw.loop;
    if (!Array.isArray(loop)) bad("loop must be an array");
    if (loop.length < 1 || loop.length > 20) bad("loop must hold 1..20 cards");
    const cards = loop.map((c) => validCard(c, true));

    checkVarTypes(cards);

    return { setup: okSetup, loop: cards };
}
