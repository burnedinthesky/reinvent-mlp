/* Server-side dataset + loss-landscape cache. Loads the active Dataset row from
   SQLite, rebuilds the LossLandscape, and memoizes both keyed by the active
   dataset id so scoring never rebuilds the 201×201 grid per request. Returns null
   until a real dataset has been imported — there is no built-in fallback, so the
   student app and scoring are inert until the operator loads the survey.
   Server-only: imports Prisma.

   The two data-derived scored MLP terrains (Foothills / Range) cost ~19 s of
   blocking CPU per dataset. They are NOT built inline here anymore: the light
   store (JSON.parse + LossLandscape, ~100 ms) is loaded synchronously, then a
   single-flight BACKGROUND build (buildScoredStageAsync, which yields to the
   event loop between candidates) fills a module-level `terrainEntry`. Handlers
   that need the scored stages call `requireStages()`, which fail-fast throws
   'terrain building' until the entry is ready — the student overlay + admin
   panel poll `getTerrainStatus()` and re-probe on completion.

   SINGLE-NODE-PROCESS ASSUMPTION: `cache` and `terrainEntry` are module globals,
   so this only single-flights within one Node process. The LAN workshop runs one
   Nitro process, so that holds; a horizontally-scaled deploy would rebuild once
   per worker (still correct, just redundant). */

import { prisma } from "#/lib/prisma";
import type { SCORED_STAGES } from "../constants";
import {
    AXIS_KEYS,
    CANONICAL_X,
    CANONICAL_Y,
    COLS,
    DND_LABELS,
    FEATURES,
} from "../features";
import { LossLandscape } from "../lossgrid";
import { getTerrainSeed } from "./state";
import { buildRiggedRangeAsync, buildScoredStageAsync } from "../terrain";
import type { BuildProgress, StageTerrain } from "../terrain";
import type {
    DataPoint,
    RealRow,
    TerrainBuildInfo,
    VerifyCheck,
    WorkshopConfig,
} from "../types";

type ScoredStageId = (typeof SCORED_STAGES)[number];

export interface ActiveStore {
    /** the active Dataset row id. */
    datasetId: string;
    label: string;
    realRows: RealRow[];
    points: DataPoint[];
    land: LossLandscape;
    config: WorkshopConfig;
}

/** The two scored MLP terrains + their hardness reports, built in the background
    once per dataset. Resolved via `requireStages()` / `awaitTerrains()`. */
export interface ScoredTerrains {
    stages: Record<ScoredStageId, StageTerrain>;
    reports: Record<ScoredStageId, VerifyCheck[]>;
}

/** FNV-1a over the dataset id → a deterministic base seed for the frozen nets,
    so the same dataset always yields the same terrains (reload-stable). */
function seedOf(id: string): number {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Scramble the terrain re-roll counter into a well-mixed 32-bit value, so
    consecutive re-rolls (0, 1, 2, …) fold into unrelated base seeds rather than
    off-by-one ones (adjacent frozen-net seeds can give near-identical surfaces). */
function hashOfInt(n: number): number {
    let h = Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    return h >>> 0;
}

function buildConfig(label: string, land: LossLandscape): WorkshopConfig {
    return {
        label,
        canonical_x: CANONICAL_X,
        canonical_y: CANONICAL_Y,
        features: FEATURES,
        cols: COLS,
        axisKeys: AXIS_KEYS,
        dndLabels: DND_LABELS,
        lossRange: { min: land.gMin, max: land.gMax },
        bStar: land.bStar,
    };
}

let cache: ActiveStore | null = null;

/** The single in-flight (or completed) background terrain build. `null` = idle
    (never started for the current dataset, or invalidated). */
interface TerrainEntry {
    datasetId: string;
    cancelled: boolean;
    result: ScoredTerrains | null;
    error: unknown;
    /** 0..1 across both stages. */
    progress: number;
    /** human-readable current step for the overlay / admin row. */
    phase: string;
    /** resolves/rejects when the build finishes; `.catch`ed so a cancelled build
      never surfaces as an unhandled rejection. */
    promise: Promise<ScoredTerrains>;
}
let terrainEntry: TerrainEntry | null = null;

/** Load (and memoize) the active scoring store, or null if no dataset has been
    imported yet. The scored terrains are built in the BACKGROUND (see
    `ensureTerrains`) — this returns as soon as the light store is ready. */
export async function getActiveStore(): Promise<ActiveStore | null> {
    const row = await prisma.dataset.findFirst({
        where: { active: true },
        orderBy: { createdAt: "desc" },
    });

    if (!row) {
        cache = null;
        return null;
    }
    if (cache && cache.datasetId === row.id) {
        // already loaded — make sure a build is running (idempotent single flight).
        ensureTerrains(cache);
        return cache;
    }

    const realRows = JSON.parse(row.realRows) as RealRow[];
    const points = JSON.parse(row.points) as DataPoint[];
    const stored = JSON.parse(row.config) as Partial<WorkshopConfig>;
    const land = new LossLandscape(points);

    cache = {
        datasetId: row.id,
        label: row.label,
        realRows,
        points,
        land,
        config: {
            ...buildConfig(row.label, land),
            ...stored,
            lossRange: { min: land.gMin, max: land.gMax },
            bStar: land.bStar,
        },
    };
    // fire-and-forget: kick the background terrain build for this dataset.
    ensureTerrains(cache);
    return cache;
}

/** SYNCHRONOUS check-and-create single flight for the two scored terrains.
    Returns immediately; the build runs in the background (buildScoredStageAsync
    yields to the event loop between candidates, so join/poll RPCs stay
    responsive). Idempotent — a second call for the same dataset is a no-op while
    a build is in flight, ready, or errored is retried. The base seed is derived
    from the dataset id XOR the admin terrain re-roll counter, so the surfaces are
    stable across reloads/restarts yet deterministically re-rollable. mlp_a =
    Foothills (H=2), mlp_b = Range (H=3). */
export function ensureTerrains(store: ActiveStore): void {
    // already building or ready for this exact dataset — nothing to do. A prior
    // ERROR is retried (fall through) so a transient failure self-heals on next
    // access.
    if (
        terrainEntry &&
        terrainEntry.datasetId === store.datasetId &&
        !terrainEntry.cancelled &&
        !terrainEntry.error
    ) {
        return;
    }

    const entry: TerrainEntry = {
        datasetId: store.datasetId,
        cancelled: false,
        result: null,
        error: null,
        progress: 0,
        phase: "starting",
        promise: Promise.resolve({} as ScoredTerrains), // replaced below
    };
    terrainEntry = entry;

    const shouldAbort = () => entry.cancelled;
    // map a per-stage BuildProgress into [lo, hi] of the overall bar + a phase label.
    const onStage =
        (name: string, lo: number, hi: number) => (p: BuildProgress) => {
            if (entry.cancelled) return;
            entry.progress = lo + (hi - lo) * (p.total ? p.done / p.total : 0);
            entry.phase = `${name} · ${p.phase} search`;
        };

    entry.promise = (async () => {
        // seed math moved verbatim from the old inline build.
        const base =
            (seedOf(store.datasetId) ^ hashOfInt(await getTerrainSeed())) >>> 0;
        const a = await buildScoredStageAsync(
            store.land,
            store.points,
            { H: 2, id: "mlp_a", baseSeed: base },
            { onProgress: onStage("Foothills", 0, 0.5), shouldAbort }
        );
        // Range (mlp_b) is the RIGGED hand-crafted "ultra hard" terrain — a jagged,
        // deeply non-convex nightmare (not the honest data-derived MLP surface).
        const b = await buildRiggedRangeAsync((base ^ 0x5bd1e995) >>> 0, {
            onProgress: onStage("Range", 0.5, 1),
            shouldAbort,
        });
        const result: ScoredTerrains = {
            stages: { mlp_a: a.stage, mlp_b: b.stage },
            reports: { mlp_a: a.report, mlp_b: b.report },
        };
        entry.result = result;
        entry.progress = 1;
        entry.phase = "ready";
        return result;
    })();

    entry.promise.catch((e) => {
        // a cancelled build throws 'aborted' — that's expected, not an error state.
        if (!entry.cancelled) entry.error = e;
        // swallow so a cancelled/failed build never becomes an unhandled rejection.
    });
}

/** Like getActiveStore() but throws when no dataset is active — for the scoring /
    submission / query handlers, which have nothing to run against until the
    operator has imported a survey. */
export async function requireActiveStore(): Promise<ActiveStore> {
    const store = await getActiveStore();
    if (!store) throw new Error("no active dataset");
    return store;
}

/** Resolve the two scored terrains, FAIL-FAST: if the background build isn't
    done yet this throws `Error('terrain building')` (matched by substring the
    same way `isRoomNotOpen` matches 'no active dataset'), so the caller returns a
    friendly "still carving the terrain" state rather than blocking. Ensures a
    build is running first, so a cold call kicks it. */
export async function requireStages(): Promise<ScoredTerrains> {
    const store = await requireActiveStore();
    ensureTerrains(store);
    const entry = terrainEntry;
    if (!entry || entry.datasetId !== store.datasetId)
        throw new Error("terrain building");
    if (entry.result) return entry.result;
    if (entry.error) throw new Error("terrain building");
    throw new Error("terrain building");
}

/** Await the current terrain build to completion (for tests / warm-up). Kicks a
    build if none is running. Rejects if the build errors. */
export async function awaitTerrains(): Promise<ScoredTerrains> {
    const store = await requireActiveStore();
    ensureTerrains(store);
    if (!terrainEntry) throw new Error("terrain building");
    return terrainEntry.promise;
}

/** The current background-build status for the student overlay + admin panel. */
export function getTerrainStatus(): TerrainBuildInfo {
    const e = terrainEntry;
    if (!e) return { state: "idle", progress: 0, phase: "idle", datasetId: "" };
    const state: TerrainBuildInfo["state"] = e.cancelled
        ? "idle"
        : e.error
          ? "error"
          : e.result
            ? "ready"
            : "building";
    return {
        state,
        progress: e.progress,
        phase: e.phase,
        datasetId: e.datasetId,
    };
}

/** Force the next getActiveStore() to rebuild (call after import/generate/re-roll
    /clear/reset). Also cancels any in-flight terrain build — the abandoned build
    unwinds at its next yield and the new dataset's build is kicked by the admin
    fn (via `void getActiveStore()`). */
export function invalidateStore(): void {
    cache = null;
    if (terrainEntry) {
        terrainEntry.cancelled = true;
        terrainEntry = null;
    }
}
