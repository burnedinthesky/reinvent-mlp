/* P4 interpreter + validator tests (v3 language). Pure — no DB. Covers
   determinism, the 101-frame / truePath output, the five reference programs
   running clean, Look→slot binding, Scan semantics (8 probes, argmin direction,
   no move / no best / no loss write), the If-trace bitmask, variable-watch
   snapshots, and the strict two-pass validator (structural + type inference)
   rejects — including the FRIENDLY v2-migration messages. */

import { describe, expect, it } from "vitest";

import { buildDataset } from "../../__tests__/fixtures/dataset";
import { LossLandscape } from "../../lossgrid";
import { createRng } from "../../rng";
import { DRUNK, FULL, PROBE, REFERENCE_PROGRAMS, SCAN } from "../../refbots";
import { bowlStage } from "../../terrain";
import type { BotProgram } from "../../types";
import { runProgram, validateProgram } from "../botrun";

function bowl() {
    const ds = buildDataset();
    return bowlStage(new LossLandscape(ds.points));
}

const setup: BotProgram["setup"] = DRUNK.setup;
const REFERENCES = REFERENCE_PROGRAMS;

describe("runProgram", () => {
    it("produces 101 frames, a 101-point truePath, and a bounded true final loss", () => {
        const stage = bowl();
        const r = runProgram(stage, createRng(7), SCAN);
        expect(r.frames).toHaveLength(101);
        expect(r.truePath).toHaveLength(101);
        expect(r.stage).toBe("bowl");
        expect(r.trueLoss).toBeGreaterThanOrEqual(stage.gMin - 1e-6);
        expect(r.trueLoss).toBeLessThanOrEqual(stage.gMax + 1e-6);
        // truePath ends at the judged true loss (both are lossAt(finalPos)).
        expect(r.truePath[100]).toBeCloseTo(r.trueLoss, 10);
        // final frame position matches the reported final position.
        expect(r.frames[100].w).toBeCloseTo(r.finalPos.w, 10);
    });

    it("is deterministic: same seed + program + stage ⇒ identical frames", () => {
        const a = runProgram(bowl(), createRng(42), FULL);
        const b = runProgram(bowl(), createRng(42), FULL);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it("different seeds give different noisy runs (batch=1 noise is live)", () => {
        const a = runProgram(bowl(), createRng(1), SCAN);
        const b = runProgram(bowl(), createRng(2), SCAN);
        expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });

    it("runs all five reference programs without throwing", () => {
        const stage = bowl();
        for (const [name, prog] of Object.entries(REFERENCES)) {
            const r = runProgram(stage, createRng(3), prog);
            expect(r.frames, name).toHaveLength(101);
            expect(Number.isFinite(r.trueLoss), name).toBe(true);
        }
    });

    it("keeps the bot inside [-4, 4]² every frame", () => {
        const r = runProgram(bowl(), createRng(9), FULL);
        for (const f of r.frames) {
            expect(f.w).toBeGreaterThanOrEqual(-4);
            expect(f.w).toBeLessThanOrEqual(4);
            expect(f.b).toBeGreaterThanOrEqual(-4);
            expect(f.b).toBeLessThanOrEqual(4);
        }
    });

    it("Look here → slot stores the reading (frame vars mirror frame read)", () => {
        const prog: BotProgram = {
            setup,
            loop: [{ t: "look", at: "here", slot: "A" }],
        };
        const r = runProgram(bowl(), createRng(13), prog);
        for (let k = 1; k < r.frames.length; k++) {
            const f = r.frames[k];
            // the at-position reading lands both in the HUD read and in slot A.
            expect(typeof f.vars.A).toBe("number");
            expect(f.vars.A).toBe(f.read);
        }
    });

    it("Scan: 8 probes one step away, argmin direction in the slot, no move / no best / no loss write", () => {
        const stage = bowl();
        const prog: BotProgram = { setup, loop: [{ t: "scan", slot: "D" }] };
        const r = runProgram(stage, createRng(21), prog);
        const spawnRead = r.frames[0].read;
        const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        // probe geometry, epoch 1: one step (= lr 0.5) from center, DIR8 order.
        const angle: Record<string, number> = {
            E: 0,
            NE: 45,
            N: 90,
            NW: 135,
            W: 180,
            SW: 225,
            S: 270,
            SE: 315,
        };
        const f1 = r.frames[1];
        expect(f1.looks).toHaveLength(8);
        for (let i = 0; i < 8; i++) {
            const a = (angle[DIRS[i]] * Math.PI) / 180;
            expect(f1.looks[i].w).toBeCloseTo(Math.cos(a) * 0.5, 10);
            expect(f1.looks[i].b).toBeCloseTo(Math.sin(a) * 0.5, 10);
        }
        // the winning direction is the argmin of the 8 probe readings.
        const min = Math.min(...f1.looks.map((l) => l.v));
        expect(f1.vars.D).toBe(DIRS[f1.looks.findIndex((l) => l.v === min)]);
        for (const f of r.frames) {
            // never moves…
            expect(f.w).toBe(0);
            expect(f.b).toBe(0);
            // …and Scan probes are distant reads: best stays the spawn reading and the
            // HUD read (internal loss) is never overwritten by a probe.
            expect(f.best).toBe(spawnRead);
            expect(f.read).toBe(spawnRead);
            // sinceBest therefore just counts up.
            expect(f.sinceBest).toBe(r.frames.indexOf(f));
        }
    });

    it("records the If-trace bitmask per epoch (bit k = k-th top-level If took then)", () => {
        const prog: BotProgram = {
            setup,
            loop: [
                // always true → bit 0 set (jump each epoch keeps the run interesting).
                {
                    t: "if",
                    a: { k: "num", v: 1 },
                    cmp: "<",
                    b: { k: "num", v: 2 },
                    then: [{ t: "jump" }],
                    else: [],
                },
                // always false → bit 1 clear.
                {
                    t: "if",
                    a: { k: "num", v: 1 },
                    cmp: ">",
                    b: { k: "num", v: 2 },
                    then: [{ t: "jump" }],
                    else: [],
                },
            ],
        };
        const r = runProgram(bowl(), createRng(4), prog);
        expect(r.frames[0].ifs).toBe(0); // spawn frame traces nothing
        for (let k = 1; k < r.frames.length; k++)
            expect(r.frames[k].ifs).toBe(0b01);
    });

    it("exposes end-of-epoch variable snapshots (PROBE sets A/B numbers + D direction)", () => {
        const r = runProgram(bowl(), createRng(11), PROBE);
        const v = r.frames[100].vars;
        expect(typeof v.A).toBe("number");
        expect(typeof v.B).toBe("number");
        expect(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]).toContain(v.D);
    });
});

describe("validateProgram", () => {
    const ok = (p: unknown) => validateProgram(p);

    it("accepts every reference program", () => {
        for (const prog of Object.values(REFERENCES))
            expect(() => ok(prog)).not.toThrow();
    });

    it("accepts the two-card argmin (Scan → D · Move D)", () => {
        expect(() =>
            ok({
                setup,
                loop: [
                    { t: "scan", slot: "D" },
                    { t: "move", dir: { k: "var", slot: "D" } },
                ],
            })
        ).not.toThrow();
    });

    it("rejects an empty or oversized loop (>20 cards)", () => {
        expect(() => ok({ setup, loop: [] })).toThrow();
        const twentyOne = Array.from({ length: 21 }, () => ({ t: "jump" }));
        expect(() => ok({ setup, loop: twentyOne })).toThrow();
    });

    it("accepts a full 20-card loop", () => {
        const twenty = Array.from({ length: 20 }, () => ({ t: "jump" }));
        expect(() => ok({ setup, loop: twenty })).not.toThrow();
    });

    it("rejects v2 shapes with the friendly migration messages", () => {
        // v2 Set = loss (the removed hidden register)…
        expect(() =>
            ok({ setup, loop: [{ t: "set", slot: "A", v: { k: "loss" } }] })
        ).toThrow(/old card set/);
        // …v2 If comparand loss…
        expect(() =>
            ok({
                setup,
                loop: [
                    {
                        t: "if",
                        a: { k: "loss" },
                        cmp: "<",
                        b: { k: "num", v: 1 },
                        then: [{ t: "jump" }],
                        else: [],
                    },
                ],
            })
        ).toThrow(/old card set/);
        // …and a v2 slot-less Look.
        expect(() => ok({ setup, loop: [{ t: "look", at: "here" }] })).toThrow(
            /into a slot/
        );
    });

    it("rejects unknown card types and bad enum params", () => {
        expect(() => ok({ setup, loop: [{ t: "teleport" }] })).toThrow();
        expect(() =>
            ok({
                setup,
                loop: [
                    { t: "look", at: { k: "dir", d: "sideways" }, slot: "A" },
                ],
            })
        ).toThrow();
        expect(() => ok({ setup, loop: [{ t: "scan", slot: "Z" }] })).toThrow();
        expect(() => ok({ setup, loop: [{ t: "lr", f: 3 }] })).toThrow();
        expect(() =>
            ok({ setup, loop: [{ t: "move", dir: { k: "dir", d: "X" } }] })
        ).toThrow();
        expect(() =>
            ok({ setup: { ...setup, lr: 0.3 }, loop: [{ t: "jump" }] })
        ).toThrow();
    });

    it("rejects a nested If inside an If branch", () => {
        const nested = {
            setup,
            loop: [
                {
                    t: "if",
                    a: { k: "num", v: 1 },
                    cmp: "<",
                    b: { k: "best" },
                    then: [
                        {
                            t: "if",
                            a: { k: "num", v: 1 },
                            cmp: "<",
                            b: { k: "best" },
                            then: [{ t: "jump" }],
                            else: [],
                        },
                    ],
                    else: [],
                },
            ],
        };
        expect(() => ok(nested)).toThrow();
    });

    it("rejects branches with too many cards (>3 then / >3 else)", () => {
        const four = (key: "then" | "else") => ({
            setup,
            loop: [
                {
                    t: "if",
                    a: { k: "num", v: 1 },
                    cmp: "<",
                    b: { k: "best" },
                    then:
                        key === "then"
                            ? Array.from({ length: 4 }, () => ({ t: "jump" }))
                            : [{ t: "jump" }],
                    else:
                        key === "else"
                            ? Array.from({ length: 4 }, () => ({ t: "jump" }))
                            : [],
                },
            ],
        });
        expect(() => ok(four("then"))).toThrow();
        expect(() => ok(four("else"))).toThrow();
    });

    it("rejects randomDir on Look (Move only)", () => {
        expect(() =>
            ok({
                setup,
                loop: [{ t: "look", at: { k: "randomDir" }, slot: "A" }],
            })
        ).toThrow();
        // but randomDir on Move is fine.
        expect(() =>
            ok({ setup, loop: [{ t: "move", dir: { k: "randomDir" } }] })
        ).not.toThrow();
    });

    it("rejects reading a variable that is never written", () => {
        expect(() =>
            ok({ setup, loop: [{ t: "move", dir: { k: "var", slot: "C" } }] })
        ).toThrow();
        expect(() =>
            ok({
                setup,
                loop: [
                    {
                        t: "if",
                        a: { k: "var", slot: "C" },
                        cmp: "<",
                        b: { k: "num", v: 1 },
                        then: [{ t: "jump" }],
                        else: [],
                    },
                ],
            })
        ).toThrow();
    });

    it("rejects a type-conflicting Set (same slot set to a number and a direction)", () => {
        const clash = {
            setup,
            loop: [
                { t: "set", slot: "A", v: { k: "num", v: 1 } },
                { t: "set", slot: "A", v: { k: "dir", d: "N" } },
                { t: "move", dir: { k: "randomDir" } },
            ],
        };
        expect(() => ok(clash)).toThrow();
    });

    it("Look and Scan bindings count as typed writes (and conflict accordingly)", () => {
        // a Look-bound slot is a number: reading it as a direction rejects…
        expect(() =>
            ok({
                setup,
                loop: [
                    { t: "look", at: "here", slot: "A" },
                    { t: "move", dir: { k: "var", slot: "A" } },
                ],
            })
        ).toThrow();
        // …a Scan-bound slot is a direction: reading it as a number rejects…
        expect(() =>
            ok({
                setup,
                loop: [
                    { t: "scan", slot: "D" },
                    {
                        t: "if",
                        a: { k: "var", slot: "D" },
                        cmp: "<",
                        b: { k: "num", v: 1 },
                        then: [{ t: "jump" }],
                        else: [],
                    },
                ],
            })
        ).toThrow();
        // …and Look + Scan into the SAME slot is a num/dir write conflict.
        expect(() =>
            ok({
                setup,
                loop: [
                    { t: "look", at: "here", slot: "A" },
                    { t: "scan", slot: "A" },
                ],
            })
        ).toThrow();
    });

    it("rejects a direction variable read in a numeric context", () => {
        const misuse = {
            setup,
            loop: [
                { t: "set", slot: "A", v: { k: "dir", d: "N" } },
                {
                    t: "if",
                    a: { k: "var", slot: "A" },
                    cmp: "<",
                    b: { k: "num", v: 1 },
                    then: [{ t: "jump" }],
                    else: [],
                },
            ],
        };
        expect(() => ok(misuse)).toThrow();
    });

    it("rejects a number variable read as a direction", () => {
        const misuse = {
            setup,
            loop: [
                { t: "set", slot: "A", v: { k: "num", v: 1 } },
                { t: "move", dir: { k: "var", slot: "A" } },
            ],
        };
        expect(() => ok(misuse)).toThrow();
    });

    it("resolves var-copy typing to a fixpoint (Set B = A inherits A's direction type)", () => {
        // A is a direction (via Scan), B copies A, Move reads B — all consistent.
        const chain = {
            setup,
            loop: [
                { t: "scan", slot: "A" },
                { t: "set", slot: "B", v: { k: "var", slot: "A" } },
                { t: "move", dir: { k: "var", slot: "B" } },
            ],
        };
        expect(() => ok(chain)).not.toThrow();
        // …but reading B as a number must still be rejected.
        const bad = {
            setup,
            loop: [
                { t: "scan", slot: "A" },
                { t: "set", slot: "B", v: { k: "var", slot: "A" } },
                {
                    t: "if",
                    a: { k: "var", slot: "B" },
                    cmp: "<",
                    b: { k: "num", v: 1 },
                    then: [{ t: "jump" }],
                    else: [],
                },
            ],
        };
        expect(() => ok(bad)).toThrow();
    });

    it("validated PROBE actually steers a run", () => {
        const prog = validateProgram(PROBE);
        const r = runProgram(bowl(), createRng(5), prog);
        expect(r.frames).toHaveLength(101);
    });
});
