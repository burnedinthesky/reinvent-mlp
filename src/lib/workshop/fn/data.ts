/* State + data server functions: GET /state and the getBundle convenience
   (§3.2/§3.3). Labels are gated server-side by reveal flags; hidden labels
   never ship. */

import { createServerFn } from "@tanstack/react-start";
import type { DataBundle } from "../data-service";
import { gatedBundle } from "../server/gate";
import { getServerState } from "../server/state";
import {
    getTerrainStatus,
    requireActiveStore,
    requireStages,
} from "../server/store";
import { requireStudent } from "../server/identity";
import { countByPhase, grantsForStudent } from "../server/persist";
import { PHASE_CAPS } from "../constants";
import type { PhaseCaps, ServerState, StageId, TerrainGrid } from "../types";

export const getStateFn = createServerFn({ method: "GET" }).handler(
    async (): Promise<ServerState> => {
        // compose the P4 background-build status onto /state so the student overlay
        // (P4Bots) can show progress + re-probe on completion. `getServerState`
        // itself stays store-free (no import cycle); the field is optional.
        const state = await getServerState();
        const t = getTerrainStatus();
        return { ...state, terrain: { state: t.state, progress: t.progress } };
    }
);

export const getBundleFn = createServerFn({ method: "GET" }).handler(
    async (): Promise<DataBundle> => {
        const [store, state] = await Promise.all([
            requireActiveStore(),
            getServerState(),
        ]);
        // real/CSV labels are blind in P1 and appear from P2 onward — no operator flip.
        // In self-select the student roams every phase, so ship the fully-revealed
        // bundle (real + synthetic labels, force reveal100 + showReal) and let the
        // client re-gate locally by its own phase + reveal toggles.
        if (state.selfSelect)
            return gatedBundle(
                store,
                { ...state.reveals, reveal100: true },
                true
            );
        return gatedBundle(store, state.reveals, state.phase !== "P1");
    }
);

/** The calling student's effective per-phase attempt caps (base cap + any
    operator-granted bonus). The student's phase UIs gate the submit button on
    `cap - attempt`, so this lets a granted bonus re-open a capped-out phase
    within one /state poll. Only the scored room phases (P1–P5) carry a cap. */
export const getLimitsFn = createServerFn({ method: "GET" })
    .validator((d: { token: string }) => d)
    .handler(async ({ data }): Promise<PhaseCaps> => {
        const me = await requireStudent(data.token);
        const bonuses = await grantsForStudent(me.id);
        const caps: PhaseCaps = {};
        for (const [phase, base] of Object.entries(PHASE_CAPS)) {
            if (phase === "API") continue; // uni-tier channel, not a room phase
            caps[phase as keyof PhaseCaps] = base + (bonuses.get(phase) ?? 0);
        }
        return caps;
    });

/** Ship a stage's loss grid for the P4 terrain render (p4-redesign-spec §6.3).
    The Bowl is public (derivable from the revealed training data anyway); the
    scored stages ship only to a student who has already made ≥1 P4 submission —
    reload recovery for the revealed-terrain state, never an early peek. */
export const getTerrainFn = createServerFn({ method: "POST" })
    .validator((d: { token: string; stage: StageId }) => d)
    .handler(async ({ data }): Promise<TerrainGrid> => {
        const me = await requireStudent(data.token);
        if (data.stage === "bowl") {
            // the Bowl is derivable from the revealed training data — it needs only the
            // light store, never the background-built scored terrains.
            const l = (await requireActiveStore()).land;
            return {
                gn: l.GN,
                grid: Array.from(l.grid),
                min: l.gMin,
                max: l.gMax,
                bStar: l.bStar,
            };
        }
        const used = await countByPhase(me.id, "P4");
        if (used < 1)
            throw new Error("terrain locked — submit an expedition first");
        // fail-fast throws 'terrain building' until the background carve is done.
        const { stages } = await requireStages();
        const st = stages[data.stage];
        // bStar (loss-min b) recovered from the grid argmin, matching lossgrid.
        let am = 0;
        let mn = Infinity;
        for (let k = 0; k < st.grid.length; k++) {
            if (st.grid[k] < mn) {
                mn = st.grid[k];
                am = k;
            }
        }
        const bStar = -4 + (8 * Math.floor(am / st.GN)) / (st.GN - 1);
        return {
            gn: st.GN,
            grid: Array.from(st.grid),
            min: st.gMin,
            max: st.gMax,
            bStar,
        };
    });
