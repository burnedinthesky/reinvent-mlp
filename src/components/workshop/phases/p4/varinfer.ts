/* Client-side variable type inference for the P4 editor. Mirrors the server
   validator's second pass (server/botrun.ts checkVarTypes) but is lenient: it
   never throws, it just reports each slot's inferred type ('num' | 'dir' | null)
   so the UI can filter variable chips in popovers and badge the legend. */

import { slotRecord, VAR_SLOTS } from "#/lib/workshop/blocks";
import type { Card, SetValue, SimpleCard, VarSlot } from "#/lib/workshop/types";

export type SlotType = "num" | "dir" | null;

/** infer each slot's type from every write in a loop — Set values plus the v3
    Look (number) / Scan (direction) slot bindings (copy edges to fixpoint). */
export function inferSlotTypes(loop: Card[]): Record<VarSlot, SlotType> {
    const setNum = slotRecord(() => false);
    const setDir = slotRecord(() => false);
    const copyEdges: [VarSlot, VarSlot][] = [];

    const noteSet = (slot: VarSlot, v: SetValue) => {
        if (v.k === "dir" || v.k === "randomDir") setDir[slot] = true;
        else if (v.k === "var") copyEdges.push([slot, v.slot]);
        else setNum[slot] = true;
    };
    const noteSimple = (c: SimpleCard) => {
        if (c.t === "set") noteSet(c.slot, c.v);
        else if (c.t === "look")
            setNum[c.slot] = true; // reading lands in the slot
        else if (c.t === "scan") setDir[c.slot] = true; // direction lands in the slot
    };
    for (const card of loop) {
        if (card.t === "if") {
            for (const c of card.then) noteSimple(c);
            for (const c of card.else) noteSimple(c);
        } else {
            noteSimple(card);
        }
    }
    for (let pass = 0; pass < VAR_SLOTS.length + 1; pass++) {
        for (const [dst, src] of copyEdges) {
            if (setNum[src]) setNum[dst] = true;
            if (setDir[src]) setDir[dst] = true;
        }
    }
    const out = {} as Record<VarSlot, SlotType>;
    for (const slot of VAR_SLOTS) {
        out[slot] = setDir[slot] ? "dir" : setNum[slot] ? "num" : null;
    }
    return out;
}

/** slots inferred to hold numbers (offered in numeric popovers). */
export const numVarsOf = (t: Record<VarSlot, SlotType>): VarSlot[] =>
    VAR_SLOTS.filter((s) => t[s] === "num");

/** slots inferred to hold directions (offered in compass popovers). */
export const dirVarsOf = (t: Record<VarSlot, SlotType>): VarSlot[] =>
    VAR_SLOTS.filter((s) => t[s] === "dir");

/** slots the program references at all (Set target, Set-from-var, Look/Scan
    bindings, read in Look/Move/If) — the watch panel shows exactly these. */
export function usedSlotsOf(loop: Card[]): VarSlot[] {
    const used = new Set<VarSlot>();
    const noteSimple = (c: SimpleCard) => {
        if (c.t === "set") {
            used.add(c.slot);
            if (c.v.k === "var") used.add(c.v.slot);
        } else if (c.t === "look") {
            used.add(c.slot);
            if (typeof c.at === "object" && c.at.k === "var")
                used.add(c.at.slot);
        } else if (c.t === "scan") {
            used.add(c.slot);
        } else if (c.t === "move" && c.dir.k === "var") {
            used.add(c.dir.slot);
        }
    };
    for (const card of loop) {
        if (card.t === "if") {
            if (card.a.k === "var") used.add(card.a.slot);
            if (card.b.k === "var") used.add(card.b.slot);
            for (const c of card.then) noteSimple(c);
            for (const c of card.else) noteSimple(c);
        } else {
            noteSimple(card);
        }
    }
    return VAR_SLOTS.filter((s) => used.has(s));
}
