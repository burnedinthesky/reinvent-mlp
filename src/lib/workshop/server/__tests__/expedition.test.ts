/* Scored-submission-level tests (p4-redesign-spec §6.3). Pure — no DB. Exercises
   scoreStage + validateProgram directly, the way scoring/botrun are unit tested:
   each submission targets ONE stage, seed determinism, and the ∇-lock rejection.
   Builds the two scored terrains locally (trimmed candidate count so the suite
   stays fast — terrain quality is covered in terrain.test.ts). */

import { describe, expect, it } from "vitest";

import { buildDataset } from "../../__tests__/fixtures/dataset";
import { LossLandscape } from "../../lossgrid";
import { FULL, SCAN } from "../../refbots";
import { buildScoredStage } from "../../terrain";
import type { StageId } from "../../types";
import type { StageTerrain } from "../../terrain";
import { validateProgram } from "../botrun";
import { scoreStage } from "../scoring";

/** The scored stages now live outside ActiveStore (built in the background by the
    store); build them locally and pass them straight to scoreStage. Trimmed
    candidate count keeps the suite fast — terrain quality lives in terrain.test.ts. */
function seedStages(): Record<
    Extract<StageId, "mlp_a" | "mlp_b">,
    StageTerrain
> {
    const ds = buildDataset();
    const land = new LossLandscape(ds.points);
    const a = buildScoredStage(land, ds.points, {
        H: 2,
        id: "mlp_a",
        baseSeed: 1,
        maxCandidates: 3,
        ladderK: 4,
    });
    const b = buildScoredStage(land, ds.points, {
        H: 3,
        id: "mlp_b",
        baseSeed: 2,
        maxCandidates: 3,
        ladderK: 4,
    });
    return { mlp_a: a.stage, mlp_b: b.stage };
}

describe("scoreStage", () => {
    const stages = seedStages();

    it("runs one chosen stage and returns a finite true final loss tagged by stage", () => {
        const a = scoreStage(stages.mlp_a, SCAN, 12345);
        const b = scoreStage(stages.mlp_b, SCAN, 12345);
        expect(a.stage).toBe("mlp_a");
        expect(b.stage).toBe("mlp_b");
        for (const r of [a, b]) {
            expect(r.frames).toHaveLength(101);
            expect(Number.isFinite(r.trueLoss)).toBe(true);
        }
    });

    it("is deterministic: same terrain + seed ⇒ identical result", () => {
        const a = scoreStage(stages.mlp_b, FULL, 777);
        const b = scoreStage(stages.mlp_b, FULL, 777);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it("different per-attempt seeds give different noisy runs", () => {
        const a = scoreStage(stages.mlp_a, SCAN, 777);
        const b = scoreStage(stages.mlp_a, SCAN, 778);
        expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });
});

describe("validateProgram (submission gate)", () => {
    it("accepts the reference programs and rejects malformed input", () => {
        expect(() => validateProgram(SCAN)).not.toThrow();
        expect(() => validateProgram(FULL)).not.toThrow();
        // an unknown card type is rejected before it can ever run.
        expect(() =>
            validateProgram({ setup: SCAN.setup, loop: [{ t: "slope" }] })
        ).toThrow();
    });
});
