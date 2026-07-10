/* Phase-submission server functions (§3.3). Every handler: authenticate token →
   check the phase/deadline gate → enforce the server-side attempt cap by DB
   count → score against the active store → persist the raw payload → return
   the typed result. Caps, the gate, and the gradient lock live here, never on
   the client. */

import { createServerFn } from "@tanstack/react-start";
import {
    BOT_CAP,
    CIRCLE_CAP,
    GUESS_CAP,
    LINE_CAP,
    P2_LINE_FLAG,
    P3_PLANE_FLAG,
    P5_CAP,
    SANDBOX_CAP,
} from "../constants";
import {
    scoreGuess,
    scoreLabels,
    scoreLine,
    scoreP5Net,
    scoreStage,
} from "../server/scoring";
import { runProgram, validateProgram } from "../server/botrun";
import { bowlStage } from "../terrain";
import { createRng } from "../rng";
import { requireGate } from "../server/guard";
import { requireActiveStore, requireStages } from "../server/store";
import { requireStudent } from "../server/identity";
import {
    attemptBonus,
    countByPhase,
    recordSubmission,
} from "../server/persist";
import type {
    CirclesResult,
    ClassLabel,
    GuessResult,
    LabelsSubmission,
    LineResult,
    P5NetResult,
    P5NetSubmission,
    StageRunResult,
    StageSubmitResult,
} from "../types";

function capError(cap: number): never {
    throw new Error(`attempt limit reached (${cap})`);
}

export const submitGuessFn = createServerFn({ method: "POST" })
    .validator(
        (d: { token: string; labels: Partial<Record<string, ClassLabel>> }) => d
    )
    .handler(async ({ data }): Promise<GuessResult> => {
        const me = await requireStudent(data.token);
        await requireGate({ phase: "P1" });
        const used = await countByPhase(me.id, "P1");
        const cap = GUESS_CAP + (await attemptBonus(me.id, "P1"));
        if (used >= cap) capError(cap);
        const store = await requireActiveStore();
        const acc = scoreGuess(store, data.labels);
        await recordSubmission({
            studentId: me.id,
            phase: "P1",
            payload: data.labels,
            score: acc,
        });
        return { acc, attempt: used + 1 };
    });

export const submitP2LabelsFn = createServerFn({ method: "POST" })
    .validator((d: { token: string; sub: LabelsSubmission }) => d)
    .handler(async ({ data }): Promise<CirclesResult> => {
        const me = await requireStudent(data.token);
        await requireGate({ phase: "P2" });
        const used = await countByPhase(me.id, "P2");
        const cap = CIRCLE_CAP + (await attemptBonus(me.id, "P2"));
        if (used >= cap) capError(cap);
        const store = await requireActiveStore();
        const { acc_full, acc_visible, loss_full, loss_visible } = scoreLabels(
            store,
            data.sub
        );
        await recordSubmission({
            studentId: me.id,
            phase: "P2",
            payload: data.sub,
            score: acc_full,
            score2: acc_visible,
            // tag line-mode submissions so the board can split lasso vs. line once the
            // p2_line_mode reveal is on; the line payload is the mode signal.
            flag: data.sub.line ? P2_LINE_FLAG : undefined,
        });
        return {
            acc_full,
            acc_visible,
            loss_full,
            loss_visible,
            attempt: used + 1,
        };
    });

export const submitP3LineFn = createServerFn({ method: "POST" })
    .validator(
        (d: { token: string; w: number; b: number; plane?: boolean }) => d
    )
    .handler(async ({ data }): Promise<LineResult> => {
        const me = await requireStudent(data.token);
        await requireGate({ phase: "P3" });
        const used = await countByPhase(me.id, "P3");
        const cap = LINE_CAP + (await attemptBonus(me.id, "P3"));
        if (used >= cap) capError(cap);
        const store = await requireActiveStore();
        const { acc_full, acc_visible, loss, wrong } = scoreLine(
            store,
            data.w,
            data.b
        );
        // P3 stays a LOSS phase — record the landscape loss so the board takes the best (lowest).
        await recordSubmission({
            studentId: me.id,
            phase: "P3",
            payload: { w: data.w, b: data.b },
            score: loss,
            // tag w+b-plane submissions so the board can split slope-only vs. plane once
            // the p3_wb_plane reveal is on. `b` alone can't tell them apart (b may be 0 in
            // plane mode), so the client sends an explicit `plane` flag.
            flag: data.plane ? P3_PLANE_FLAG : undefined,
        });
        return { acc_full, acc_visible, loss, attempt: used + 1, wrong };
    });

/** P5 "Neuron" submission (stage 1 single neuron OR stage 2 trained MLP). One
    unified `{ axes, arch, weights }` payload scored on the ACC board with a shared
    10-attempt pool across both stages. A deep architecture (a hidden layer, i.e.
    layers.length > 2) is rejected while the `p5_deep` reveal is off — mirroring the
    P4 gradient lock, so a hand-poked deep payload can't jump the operator's gate.
    Pre-redesign P5 submissions remain historical JSON (never re-read; see the P4
    migration note below). */
export const submitP5NetFn = createServerFn({ method: "POST" })
    .validator((d: { token: string; sub: P5NetSubmission }) => d)
    .handler(async ({ data }): Promise<P5NetResult> => {
        const me = await requireStudent(data.token);
        const state = await requireGate({ phase: "P5" });
        const used = await countByPhase(me.id, "P5");
        const cap = P5_CAP + (await attemptBonus(me.id, "P5"));
        if (used >= cap) capError(cap);
        // deep nets are locked behind the p5_deep reveal; in self-select mode the
        // student drives that reveal client-side, so the gate opens for them too.
        if (
            data.sub.arch.layers.length > 2 &&
            !state.reveals.p5_deep &&
            !state.selfSelect
        ) {
            throw new Error("deep networks are locked");
        }
        const store = await requireActiveStore();
        const { acc_full, acc_visible, loss_full, loss_visible } = scoreP5Net(
            store,
            data.sub
        );
        await recordSubmission({
            studentId: me.id,
            phase: "P5",
            payload: data.sub,
            score: acc_full,
            score2: acc_visible,
        });
        return {
            acc_full,
            acc_visible,
            loss_full,
            loss_visible,
            attempt: used + 1,
        };
    });

/** Scored submission (p4-redesign-spec §6.3). Validates the program and runs it
    on ONE chosen stage (Foothill = mlp_a or Range = hard mlp_b) with a
    deterministic per-attempt seed, records one P4 submission tagged by `flag`
    (the stage) and scored by that stage's true final loss, and returns the
    stage's result + grid (client caches it so revealed terrain survives a
    reload). Foothill and Range draw from one shared BOT_CAP budget (counted
    across both by `countByPhase('P4')`). Revealing terrain after a scored run is
    safe — the card language has no absolute-move card.

    Migration note: this replaces the old BotConfig hill-climber submission. Old
    P4 payloads remain historical JSON; there is no migration — they are never
    re-read, only the numeric score matters to the board. */
export const submitBotFn = createServerFn({ method: "POST" })
    .validator((d: { token: string; prog: unknown; stage: string }) => d)
    .handler(async ({ data }): Promise<StageSubmitResult> => {
        const me = await requireStudent(data.token);
        // raw RPC input — narrow the stage to a scored surface before indexing.
        const stage = data.stage;
        if (stage !== "mlp_a" && stage !== "mlp_b")
            throw new Error("invalid stage");
        const used = await countByPhase(me.id, "P4");
        const cap = BOT_CAP + (await attemptBonus(me.id, "P4"));
        if (used >= cap) capError(cap);
        const [, { stages }] = await Promise.all([
            requireGate({ phase: "P4" }),
            // fail-fast throws 'terrain building' if the background carve isn't done.
            requireStages(),
        ]);
        const prog = validateProgram(data.prog);
        const result = scoreStage(stages[stage], prog, hashSeed(me.id) + used);
        await recordSubmission({
            studentId: me.id,
            phase: "P4",
            flag: stage,
            payload: {
                prog,
                stage,
                finalPos: result.finalPos,
                trueLoss: result.trueLoss,
            },
            score: result.trueLoss,
        });
        const st = stages[stage];
        return {
            stage,
            result,
            loss: result.trueLoss,
            grid: {
                stage,
                gn: st.GN,
                grid: Array.from(st.grid),
                min: st.gMin,
                max: st.gMax,
            },
        };
    });

/** Sandbox test runs on the Bowl (p4-redesign-spec §6.3). Validates + runs the
    program, never records a submission or touches the board. Sandbox seeds live
    in a disjoint band (`hashSeed + 1000 + n`) so they can't collide with scored
    seeds. The per-student counter is in-memory — losing it on restart just
    resets the soft cap, which is harmless. */
const sandboxRuns = new Map<string, number>();

export const botSandboxFn = createServerFn({ method: "POST" })
    .validator((d: { token: string; prog: unknown }) => d)
    .handler(async ({ data }): Promise<StageRunResult> => {
        const me = await requireStudent(data.token);
        const [store] = await Promise.all([
            requireActiveStore(),
            requireGate({ phase: "P4" }),
        ]);
        const prog = validateProgram(data.prog);
        const n = (sandboxRuns.get(me.id) ?? 0) + 1;
        if (n > SANDBOX_CAP) capError(SANDBOX_CAP);
        sandboxRuns.set(me.id, n);
        const seed = hashSeed(me.id) + 1000 + n;
        return runProgram(bowlStage(store.land), createRng(seed), prog);
    });

function hashSeed(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
