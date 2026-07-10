/* Server phase/reveal/deadline state — the single source of truth behind
   GET /state. Stored as key/value rows in AppState so an admin flip is durable
   across restarts and every polling client converges within one poll. The
   reveal flags are the "theater" switches (§3.2). Server-only. */

import { prisma } from "#/lib/prisma";
import { PHASES, REVEAL_KEYS } from "../constants";
import type { Phase, Reveals, ServerState } from "../types";

/** Live-workshop defaults: everything gated off; the admin flips each reveal at
    the dramatic moment. The real server starts closed — nothing is revealed
    until the operator opens it. */
const DEFAULTS: Record<string, string> = {
    phase: "P1",
    deadline: "",
    selfSelect: "0",
    reveal100: "0",
    p3_wb_plane: "0",
    p2_line_mode: "0",
    p3_show_dots: "0",
    p4_terrains: "0",
    p5_deep: "0",
    // P4 terrain re-roll counter: folded into the frozen-net base seed so the
    // operator can re-roll the Foothills/Range surfaces deterministically (§4).
    terrain_seed: "0",
};

async function readAll(): Promise<Record<string, string>> {
    const rows = await prisma.appState.findMany();
    const map: Record<string, string> = { ...DEFAULTS };
    rows.forEach((r: { key: string; value: string }) => {
        map[r.key] = r.value;
    });
    return map;
}

async function put(key: string, value: string): Promise<void> {
    await prisma.appState.upsert({
        where: { key },
        update: { value },
        create: { key, value },
    });
}

export async function getServerState(): Promise<ServerState> {
    const m = await readAll();
    const reveals = {} as Reveals;
    REVEAL_KEYS.forEach((k) => {
        reveals[k] = m[k] === "1";
    });
    return {
        phase: (PHASES.includes(m.phase as Phase) ? m.phase : "P1") as Phase,
        deadline: m.deadline ? m.deadline : null,
        reveals,
        boards: ["ACC", "LOSS"],
        selfSelect: m.selfSelect === "1",
    };
}

export async function setPhase(phase: Phase): Promise<void> {
    if (!PHASES.includes(phase)) throw new Error("invalid phase");
    await put("phase", phase);
}

export async function setDeadline(deadline: string | null): Promise<void> {
    await put("deadline", deadline ?? "");
}

export async function setSelfSelect(value: boolean): Promise<void> {
    await put("selfSelect", value ? "1" : "0");
}

export async function setReveal(
    key: keyof Reveals,
    value: boolean
): Promise<void> {
    if (!REVEAL_KEYS.includes(key)) throw new Error("invalid reveal key");
    await put(key, value ? "1" : "0");
}

export function isRevealKey(k: string): k is keyof Reveals {
    return (REVEAL_KEYS as string[]).includes(k);
}

/** Current terrain re-roll counter (§4). Re-rolling bumps this; the store folds
    it into the frozen-net base seed so the surface changes but stays deterministic
    and reload-stable. */
export async function getTerrainSeed(): Promise<number> {
    const m = await readAll();
    const n = Number(m.terrain_seed);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export async function setTerrainSeed(n: number): Promise<void> {
    await put("terrain_seed", String(Math.trunc(n)));
}
