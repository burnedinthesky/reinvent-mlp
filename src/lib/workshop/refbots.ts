/* The five reference bot programs (P4 v3 language) as plain `BotProgram`
   literals — the pedagogical ladder 醉猴 > probe > scan > +decay > +jump, all
   hand-built from the 4-category primitive language (no pre-made descent card).
   Shared by the hardness harness (which runs them K seeded passes over a
   candidate terrain to certify "better ideas score better") and the interpreter
   tests. Pure data, client-safe. */

import type { BotProgram } from "./types";

const setup: BotProgram["setup"] = { start: "center", lr: 0.5 };

/** 醉猴 — the drunk-monkey house bot: one card, move in a random direction. */
export const DRUNK: BotProgram = {
    setup,
    loop: [{ t: "move", dir: { k: "randomDir" } }],
};

/** PROBE — read the current spot into A, pick a random direction, look that way
    into B, and step there only if it reads downhill (test-before-you-step). */
export const PROBE: BotProgram = {
    setup,
    loop: [
        { t: "look", at: "here", slot: "A" },
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
    ],
};

/** SCAN — greedy local search in two cards: probe all 8 directions, walk the
    lowest-reading way. */
export const SCAN: BotProgram = {
    setup,
    loop: [
        { t: "scan", slot: "D" },
        { t: "move", dir: { k: "var", slot: "D" } },
    ],
};

/** SCAN_DECAY — SCAN + a step-size (learning-rate) schedule: shrink each epoch. */
export const SCAN_DECAY: BotProgram = {
    setup,
    loop: [...SCAN.loop, { t: "lr", f: 0.95 }],
};

/** FULL — SCAN_DECAY + a real restart when it stops improving for a long time:
    jump somewhere new AND reset the step size (×4) so the bot can actually
    re-descend (a bare Jump with a fully decayed step strands the bot). Patience
    40 (a NUM_PRESETS value): restarts only pay off on trappy terrain — on the
    honest single-basin surfaces they are a net harm (see ladderOrdered's note),
    so the reference restarts rarely and recovers big when it does. */
export const FULL: BotProgram = {
    setup,
    loop: [
        ...SCAN_DECAY.loop,
        {
            t: "if",
            a: { k: "sinceBest" },
            cmp: ">",
            b: { k: "num", v: 40 },
            then: [{ t: "jump" }, { t: "lr", f: 2 }, { t: "lr", f: 2 }],
            else: [],
        },
    ],
};

/** Named reference programs, weakest → strongest (the ladder order). */
export const REFERENCE_PROGRAMS = { DRUNK, PROBE, SCAN, SCAN_DECAY, FULL };
