/* Client-side slot type inference tests — varinfer must mirror the server
   validator's second pass (server/botrun.ts checkVarTypes): Set values plus the
   v3 Look (number) / Scan (direction) slot bindings, with copy-edge fixpoint.
   The client is deliberately lenient (reports types, never throws). */

import { describe, expect, it } from "vitest";

import type { Card, SimpleCard, VarSlot } from "#/lib/workshop/types";

import { dirVarsOf, inferSlotTypes, numVarsOf, usedSlotsOf } from "../varinfer";

const look = (slot: VarSlot): SimpleCard => ({ t: "look", at: "here", slot });
const scan = (slot: VarSlot): SimpleCard => ({ t: "scan", slot });

describe("inferSlotTypes", () => {
    it("types Look bindings as numbers and Scan bindings as directions", () => {
        const t = inferSlotTypes([look("A"), scan("D")]);
        expect(t.A).toBe("num");
        expect(t.D).toBe("dir");
        expect(t.B).toBeNull();
        expect(t.C).toBeNull();
        expect(numVarsOf(t)).toEqual(["A"]);
        expect(dirVarsOf(t)).toEqual(["D"]);
    });

    it("types Set values (number / direction / randomDir)", () => {
        const t = inferSlotTypes([
            { t: "set", slot: "A", v: { k: "num", v: 1 } },
            { t: "set", slot: "B", v: { k: "dir", d: "N" } },
            { t: "set", slot: "C", v: { k: "randomDir" } },
        ]);
        expect(t).toEqual({
            A: "num",
            B: "dir",
            C: "dir",
            D: null,
            E: null,
            F: null,
            G: null,
            H: null,
            I: null,
            J: null,
            K: null,
            L: null,
            M: null,
            N: null,
            O: null,
            P: null,
        });
    });

    it("resolves var-copy chains to a fixpoint (B = A inherits Scan-A direction)", () => {
        const t = inferSlotTypes([
            scan("A"),
            { t: "set", slot: "B", v: { k: "var", slot: "A" } },
            { t: "set", slot: "C", v: { k: "var", slot: "B" } },
        ]);
        expect(t.A).toBe("dir");
        expect(t.B).toBe("dir");
        expect(t.C).toBe("dir");
    });

    it("sees writes inside If branches", () => {
        const t = inferSlotTypes([
            {
                t: "if",
                a: { k: "best" },
                cmp: "<",
                b: { k: "num", v: 1 },
                then: [look("B")],
                else: [scan("C")],
            },
        ]);
        expect(t.B).toBe("num");
        expect(t.C).toBe("dir");
    });

    it("is lenient on conflicting writes (reports dir, never throws)", () => {
        // the server validator rejects this program; the client just badges it.
        const t = inferSlotTypes([look("A"), scan("A")]);
        expect(t.A).toBe("dir");
    });
});

describe("usedSlotsOf", () => {
    it("includes Look/Scan bindings, Look-at vars, Move vars, Set sources, and If comparands", () => {
        const loop: Card[] = [
            look("A"),
            { t: "set", slot: "D", v: { k: "randomDir" } },
            { t: "look", at: { k: "var", slot: "D" }, slot: "B" },
            {
                t: "if",
                a: { k: "var", slot: "B" },
                cmp: "<",
                b: { k: "var", slot: "A" },
                then: [{ t: "move", dir: { k: "var", slot: "D" } }],
                else: [],
            },
        ];
        expect(usedSlotsOf(loop)).toEqual(["A", "B", "D"]);
    });

    it("returns slots in fixed A–P order and ignores untouched slots", () => {
        expect(usedSlotsOf([scan("C")])).toEqual(["C"]);
        expect(usedSlotsOf([{ t: "jump" }, { t: "lr", f: 0.95 }])).toEqual([]);
    });
});
