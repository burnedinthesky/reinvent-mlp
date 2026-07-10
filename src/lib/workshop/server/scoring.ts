/* Stateless scoring wrappers. Each takes the active store + a raw submission and
   returns the score(s); attempt counts and budgets are enforced by the caller
   (the server-fn layer) from DB row counts. The pure classifiers / bot sim /
   landscape are reused verbatim by both the client and here; only
   the net forward pass is reimplemented here (the client NetEngine owns its own
   weights, whereas /submit/net ships flat weights we must rebuild). Server-only
   in spirit, but has no Prisma import so it stays unit-testable in isolation. */

import { lineLoss, predictZ } from "../classifiers";
import { AXIS_KEYS } from "../features";
import { zStatsOf } from "../lossgrid";
import type { Activation } from "../mlp";
import { createRng } from "../rng";
import { runProgram } from "./botrun";
import type {
    BotProgram,
    ClassLabel,
    DataPoint,
    FeatureKey,
    FogRound,
    LabelsSubmission,
    NetArch,
    P5NetSubmission,
    StageRunResult,
} from "../types";
import type { ActiveStore } from "./store";
import type { StageTerrain } from "../terrain";

const round1 = (x: number) => Math.round(x * 1000) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function scoreGuess(
    store: ActiveStore,
    labels: Partial<Record<string, ClassLabel>>
): number {
    let ok = 0;
    store.realRows.forEach((r) => {
        if (labels[r.id] === r.label) ok++;
    });
    return round1(ok / store.realRows.length);
}

/** Score a predicted-labels submission (P2, either mode). The client runs the
    active classifier (lasso majority-vote or the line) to label every point id
    and submits those; we compare to the ground truth we hold. The judged metric
    covers every point (real + synth, revealed + hidden); visible = the training
    set (real + synth, i.e. everything but the hidden test slice). */
export function scoreLabels(
    store: ActiveStore,
    sub: LabelsSubmission
): {
    acc_full: number;
    acc_visible: number;
    loss_full?: number;
    loss_visible?: number;
} {
    const { labels, line } = sub;
    const acc = (filter: (p: DataPoint) => boolean) => {
        const set = store.points.filter(filter);
        if (!set.length) return 0;
        let ok = 0;
        set.forEach((p) => {
            if (labels[p.id] === p.label) ok++;
        });
        return round1(ok / set.length);
    };
    return {
        // judged on the FULL point set — real + synthetic, revealed + hidden.
        acc_full: acc(() => true),
        // "known" = the training set the student can see: real + synthetic, not the
        // hidden test slice (matches scoreTwolines / the P2 & P5 live displays).
        acc_visible: acc((p) => !p.hidden),
        // line mode only: logistic loss on the same two sets, rounded to 3 dp.
        ...(line
            ? {
                  loss_full: round3(
                      lineLoss(
                          store.points,
                          line.x,
                          line.y,
                          line.model,
                          () => true
                      )
                  ),
                  loss_visible: round3(
                      lineLoss(
                          store.points,
                          line.x,
                          line.y,
                          line.model,
                          (p) => !p.hidden
                      )
                  ),
              }
            : {}),
    };
}

export function scoreFog(
    store: ActiveStore,
    round: FogRound,
    w: number,
    b: number
): { loss: number; bUsed: number } {
    // round-1 pins b at the loss-minimizing bStar (spec §3.3).
    const bUsed = round === "1d" ? store.land.bStar : b;
    return { loss: store.land.lossAt(w, bUsed), bUsed };
}

/** Score a P3 line submission: the student's z-scored (w, b) boundary. Predicts
    every point with predictZ (the SAME parameterization as the loss landscape),
    returns judged accuracy over the full + visible sets, the landscape loss at
    (w, b), and the ids of every misclassified point over the FULL set (so the
    client can flash them — including the hidden test slice). */
export function scoreLine(
    store: ActiveStore,
    w: number,
    b: number
): { acc_full: number; acc_visible: number; loss: number; wrong: string[] } {
    const z = store.land.zStats;
    const wrong: string[] = [];
    let okFull = 0;
    let okVis = 0;
    let nVis = 0;
    store.points.forEach((p) => {
        const ok = predictZ(p, z, w, b) === p.label;
        if (ok) okFull++;
        else wrong.push(p.id);
        if (!p.hidden) {
            nVis++;
            if (ok) okVis++;
        }
    });
    const n = store.points.length;
    return {
        acc_full: round1(n ? okFull / n : 0),
        acc_visible: round1(nVis ? okVis / nVis : 0),
        loss: round3(store.land.lossAt(w, b)),
        wrong,
    };
}

/** Run a validated program on ONE scored stage (p4-redesign-spec §6.3). The
    caller passes a per-attempt seed (`hashSeed(id) + used`) so a student's runs
    are reproducible and distinct across attempts and stages. The board value is
    the stage's true final loss (`result.trueLoss`). Pure — validation (∇ lock,
    caps) is the caller's job. */
export function scoreStage(
    terrain: StageTerrain,
    prog: BotProgram,
    seed: number
): StageRunResult {
    return runProgram(terrain, createRng(seed), prog);
}

/* ---- net (flat-weight rebuild + forward pass on the full set) ---- */

function actF(act: Activation, z: number): number {
    return act === "relu"
        ? z > 0
            ? z
            : 0
        : act === "sigmoid"
          ? 1 / (1 + Math.exp(-z))
          : Math.tanh(z);
}

/** number of scalars a serialize()d net of these sizes must carry. */
function weightCount(sizes: number[]): number {
    let n = 0;
    for (let l = 0; l < sizes.length - 1; l++)
        n += sizes[l + 1] * sizes[l] + sizes[l + 1];
    return n;
}

/** Validate an arch + flat serialize() weights and return the forward closure
    (x0 z-scored inputs → P(owl) in [0,1]). Used by scoreP5Net (P5); the axis-limit
    / z-stats policy lives in the caller, so this stays a pure shape check.
    `maxWidth`/`maxLayers` bound the depth+width (P5 tightens the loose ≤64/any-depth
    defaults to match its UI). Throws on any mismatch (strict validation per §3.3). */
function buildForward(
    arch: NetArch,
    weights: number[],
    maxWidth = 64,
    maxLayers = Infinity
): (x0: number[]) => number {
    const sizes = arch.layers;
    if (
        !Array.isArray(sizes) ||
        sizes.length < 2 ||
        sizes[0] !== 2 ||
        sizes[sizes.length - 1] !== 1
    ) {
        throw new Error(
            "invalid arch.layers (must start at 2 inputs, end at 1 output)"
        );
    }
    if (sizes.length > maxLayers) {
        throw new Error(`too many layers (max ${maxLayers})`);
    }
    if (sizes.some((s) => !Number.isInteger(s) || s < 1 || s > maxWidth)) {
        throw new Error("invalid layer size");
    }
    if (!Array.isArray(weights) || weights.length !== weightCount(sizes)) {
        throw new Error(
            `weights length ${weights.length} != expected ${weightCount(sizes)}`
        );
    }
    if (weights.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
        throw new Error("weights must be finite numbers");
    }
    const act = arch.act as Activation;

    // slice flat weights back into W[layer][out][in] then b[layer][out].
    const L = sizes.length - 1;
    const W: number[][][] = [];
    const b: number[][] = [];
    let k = 0;
    for (let l = 0; l < L; l++) {
        const rows: number[][] = [];
        for (let o = 0; o < sizes[l + 1]; o++) {
            const row: number[] = [];
            for (let i = 0; i < sizes[l]; i++) row.push(weights[k++]);
            rows.push(row);
        }
        W.push(rows);
    }
    for (let l = 0; l < L; l++) {
        const brow: number[] = [];
        for (let o = 0; o < sizes[l + 1]; o++) brow.push(weights[k++]);
        b.push(brow);
    }

    return (x0: number[]): number => {
        let a = x0;
        for (let l = 0; l < L; l++) {
            const last = l === L - 1;
            const out: number[] = [];
            for (let o = 0; o < W[l].length; o++) {
                let z = b[l][o];
                const wr = W[l][o];
                for (let i = 0; i < wr.length; i++) z += wr[i] * a[i];
                out.push(last ? 1 / (1 + Math.exp(-z)) : actF(act, z));
            }
            a = out;
        }
        return a[0];
    };
}

/** Score a P5 "Neuron" submission on the student-chosen axes. Both stages ship a
    `{ axes, arch, weights }` payload; the server rebuilds z-stats over the chosen
    axes (non-hidden points only, mirroring `trainFrameOf` exactly — the parity
    requirement) and thresholds the forward pass at 0.5. Arch limits keep the board
    fair vs the UI: ≤2 hidden layers (layers.length ≤ 4) and hidden widths ≤ 6.
    Returns judged accuracy AND mean BCE loss over the
    full + visible sets (same clamped log form as the client's neuronBce/NetEngine,
    so the judged loss reads on the live readout's scale). */
export function scoreP5Net(
    store: ActiveStore,
    sub: P5NetSubmission
): {
    acc_full: number;
    acc_visible: number;
    loss_full: number;
    loss_visible: number;
} {
    const axes: FeatureKey[] = Array.isArray(sub.axes) ? sub.axes : [];
    const [xk, yk] = axes;
    if (!AXIS_KEYS.includes(xk) || !AXIS_KEYS.includes(yk)) {
        throw new Error("invalid axes");
    }
    const forward = buildForward(sub.arch, sub.weights, 6, 4);
    // z-stats over the CHOSEN axes, non-hidden points — identical to trainFrameOf.
    const zs = zStatsOf(
        store.points.filter((p) => !p.hidden),
        xk,
        yk
    );
    const judge = (
        filter: (p: DataPoint) => boolean
    ): { acc: number; loss: number } => {
        const set = store.points.filter(filter);
        if (!set.length) return { acc: 0, loss: 0 };
        let ok = 0;
        let loss = 0;
        set.forEach((p) => {
            const o = forward([
                (p.feats[xk] - zs.mx) / zs.sx,
                (p.feats[yk] - zs.my) / zs.sy,
            ]);
            if ((o > 0.5 ? 1 : 0) === p.label) ok++;
            loss -=
                p.label === 1 ? Math.log(o + 1e-12) : Math.log(1 - o + 1e-12);
        });
        return {
            acc: round1(ok / set.length),
            loss: round3(loss / set.length),
        };
    };
    const full = judge(() => true);
    const visible = judge((p) => !p.hidden);
    return {
        acc_full: full.acc,
        acc_visible: visible.acc,
        loss_full: full.loss,
        loss_visible: visible.loss,
    };
}
