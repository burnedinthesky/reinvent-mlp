/* Admin server functions (§3.3, §4). All gated by ADMIN_TOKEN. Covers phase /
   reveal / deadline control, CSV import (paste/upload), synthetic generation
   with tunable strategies, house-bot seeding, data-viz stats, and a full dump. */

import { createServerFn } from "@tanstack/react-start";
import { prisma } from "#/lib/prisma";
import {
    headerErrorMessage,
    parseHeaderRow,
    validateHeaders,
} from "../csv-schema";
import { ACC_PHASES, LOSS_PHASES } from "../constants";
import { AdminError, requireAdmin } from "../server/admin";
import { cleanRealCsv, generateSynth } from "../server/dataset-io";
import type { GenerateOpts } from "../server/dataset-io";
import { getLeaderboard, getPhaseScores } from "../server/leaderboard";
import { activateDataset, grantAttempts } from "../server/persist";
import {
    getTerrainSeed,
    setDeadline,
    setPhase,
    setReveal,
    setSelfSelect,
    setTerrainSeed,
    isRevealKey,
} from "../server/state";
import { verifyTerrain } from "../terrain";
import {
    ensureTerrains,
    getActiveStore,
    getTerrainStatus,
    invalidateStore,
    requireActiveStore,
    requireStages,
} from "../server/store";
import { getWhitelist, setWhitelist } from "../server/whitelist";
import type { WhitelistEntry, WhitelistState } from "../whitelist-csv";
import type { DatasetInfo } from "../admin-service";
import type {
    AdminStats,
    BalanceReport,
    DataPoint,
    FeatureKey,
    GenPreviewPoint,
    GenerateReport,
    HistBucket,
    Phase,
    PhaseScores,
    RealRow,
    Reveals,
    TerrainReportResponse,
    TerrainStageReport,
} from "../types";

function guard(token: string) {
    try {
        requireAdmin(token);
    } catch (e) {
        throw e instanceof AdminError ? new Error("unauthorized") : e;
    }
}

/* ---- phase / reveal / deadline ---- */

export const adminPhaseFn = createServerFn({ method: "POST" })
    .validator((d: { adminToken: string; phase: Phase }) => d)
    .handler(async ({ data }) => {
        guard(data.adminToken);
        await setPhase(data.phase);
        // the countdown is per-phase theater — a forgotten timer must not lock the
        // next phase's submissions.
        await setDeadline(null);
        return { ok: true };
    });

export const adminRevealFn = createServerFn({ method: "POST" })
    .validator(
        (d: { adminToken: string; key: keyof Reveals; value: boolean }) => d
    )
    .handler(async ({ data }) => {
        guard(data.adminToken);
        if (!isRevealKey(data.key)) throw new Error("invalid reveal key");
        await setReveal(data.key, data.value);
        return { ok: true };
    });

export const adminDeadlineFn = createServerFn({ method: "POST" })
    .validator((d: { adminToken: string; deadline: string | null }) => d)
    .handler(async ({ data }) => {
        guard(data.adminToken);
        await setDeadline(data.deadline);
        return { ok: true };
    });

export const adminSelfSelectFn = createServerFn({ method: "POST" })
    .validator((d: { adminToken: string; value: boolean }) => d)
    .handler(async ({ data }) => {
        guard(data.adminToken);
        await setSelfSelect(data.value);
        return { ok: true };
    });

/* ---- import (paste / upload) ---- */

export const adminImportFn = createServerFn({ method: "POST" })
    .validator((d: { adminToken: string; csv: string; seed?: number }) => d)
    .handler(async ({ data }): Promise<BalanceReport> => {
        guard(data.adminToken);
        const csv = data.csv;
        if (!csv) throw new Error("no CSV provided");
        // strict column contract: the 9 features + LABEL_OWL must be present and
        // unambiguous (no silent median-fill of a missing column, journey A0.2).
        // A raw Google-Form export instead maps by column order and derives the
        // label from the bedtime column.
        const err = headerErrorMessage(validateHeaders(parseHeaderRow(csv)));
        if (err) throw new Error(err);
        const { realRows, report } = cleanRealCsv(csv, data.seed ?? 7);
        // import establishes realRows; generate a default wedge synth immediately so
        // scoring works end-to-end after a single import call.
        const { points } = generateSynth(realRows, { seed: data.seed ?? 7 });
        await activateDataset({
            label: "LABEL_OWL",
            realRows,
            points,
            config: {},
            meta: { source: "import", balance: report },
            source: "import",
        });
        // activateDataset() invalidated the store cache; kick the background terrain
        // build now (at import time) so it's virtually always done by the time P4
        // runs, rather than on the first student RPC.
        void getActiveStore().catch(() => {});
        return report;
    });

/* ---- synthetic generation with strategies ---- */

/** z-scored canonical coords of the reveal slice for the console's wedge
    preview. Labels here are synthetic + admin-gated, so nothing leaks. */
function buildPreview(
    points: DataPoint[],
    cx: FeatureKey,
    cy: FeatureKey
): GenPreviewPoint[] {
    const reveal = points.filter((p) => !p.real && !p.hidden);
    const stat = (get: (p: DataPoint) => number) => {
        const xs = reveal.map(get);
        const m = xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
        const sd =
            Math.sqrt(
                xs.reduce((s, v) => s + (v - m) * (v - m), 0) / (xs.length || 1)
            ) || 1;
        return { m, sd };
    };
    const gx = (p: DataPoint) => p.feats[cx];
    const gy = (p: DataPoint) => p.feats[cy];
    const sx = stat(gx);
    const sy = stat(gy);
    const clamp3 = (v: number) => Math.max(-3, Math.min(3, v));
    return reveal.map((p) => ({
        x: clamp3((gx(p) - sx.m) / sx.sd),
        y: clamp3((gy(p) - sy.m) / sy.sd),
        cls: p.label ?? 0,
    }));
}

export const adminGenerateFn = createServerFn({ method: "POST" })
    .validator((d: { adminToken: string } & GenerateOpts) => d)
    .handler(async ({ data }): Promise<GenerateReport> => {
        guard(data.adminToken);
        const store = await requireActiveStore();
        const { points, report } = generateSynth(store.realRows, data);
        await activateDataset({
            label: store.label,
            realRows: store.realRows,
            points,
            config: {},
            meta: { source: "generate", report },
            source: "generate",
        });
        // kick the background terrain build for the freshly-generated dataset.
        void getActiveStore().catch(() => {});
        return {
            ...report,
            preview: buildPreview(
                points,
                store.config.canonical_x,
                store.config.canonical_y
            ),
        };
    });

/** Read back the last generate's verification report so the console's Generate
    analytics survive a reload. The report is already persisted in Dataset.meta
    by adminGenerateFn; the wedge preview is re-derived from the stored points
    (it isn't part of the saved meta). Returns null when the active dataset was
    only imported (source !== 'generate') or carries no parseable report. */
export const adminGenerateReportFn = createServerFn({ method: "GET" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }): Promise<GenerateReport | null> => {
        guard(data.adminToken);
        const store = await getActiveStore();
        if (!store) return null;
        const row = await prisma.dataset.findUnique({
            where: { id: store.datasetId },
            select: { source: true, meta: true },
        });
        if (row?.source !== "generate" || !row.meta) return null;
        let report: GenerateReport | undefined;
        try {
            report = (JSON.parse(row.meta) as { report?: GenerateReport })
                .report;
        } catch {
            return null;
        }
        if (!report?.checks) return null;
        return {
            ...report,
            preview: buildPreview(
                store.points,
                store.config.canonical_x,
                store.config.canonical_y
            ),
        };
    });

/* ---- P4 terrain reports + re-roll (console Generate → terrain panel) ---- */

/** Per-stage H and display name (mirrors P4Bots' STAGES). */
const TERRAIN_STAGES: { id: "mlp_a" | "mlp_b"; H: number; name: string }[] = [
    { id: "mlp_a", H: 2, name: "Foothills" },
    { id: "mlp_b", H: 3, name: "Range" },
];

/** Downsample stride for the light top-down preview grid (201² → ~51²). */
const PREVIEW_STRIDE = 4;

/** The background-build status plus the hardness-harness report for both scored
    terrains (Foothills / Range) once ready. The scored terrains are built lazily
    off the event loop now (~19 s), so opening the console warms the build
    (`ensureTerrains`) and returns `{ status, stages: [] }` while it runs; the
    Generate section polls until `status.state === 'ready'`, at which point the
    per-stage reports + downsampled preview grids are attached. The ladder means
    are re-derived from the built grid (they aren't cached). */
export const adminTerrainReportFn = createServerFn({ method: "GET" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }): Promise<TerrainReportResponse> => {
        guard(data.adminToken);
        const store = await getActiveStore();
        if (!store) return { status: getTerrainStatus(), stages: [] };
        // warm the build so opening the panel kicks it (idempotent single flight).
        ensureTerrains(store);
        let scored;
        try {
            scored = await requireStages();
        } catch {
            // still building (or errored) — return the status so the console can poll.
            return { status: getTerrainStatus(), stages: [] };
        }
        const stages = TERRAIN_STAGES.map(
            ({ id, H, name }): TerrainStageReport => {
                const stage = scored.stages[id];
                const checks = scored.reports[id];
                // the ladder means aren't cached on the store — re-run the harness for them
                // (cheap: a handful of K passes over the already-built grid).
                const { ladder } = verifyTerrain({
                    hard: H >= 3,
                    stage,
                    ladderK: 12,
                });
                // downsample the full 201² grid to a ~51² preview for a light payload.
                const gn = stage.GN;
                const pn = Math.floor((gn - 1) / PREVIEW_STRIDE) + 1;
                const preview: number[] = [];
                for (let j = 0; j < gn; j += PREVIEW_STRIDE) {
                    for (let i = 0; i < gn; i += PREVIEW_STRIDE)
                        preview.push(stage.grid[j * gn + i]);
                }
                return {
                    stage: id,
                    H,
                    name,
                    checks,
                    ladder,
                    preview,
                    pn,
                    gMin: stage.gMin,
                    gMax: stage.gMax,
                };
            }
        );
        return { status: getTerrainStatus(), stages };
    });

/** Re-roll both scored terrains: bump the terrain re-roll counter and drop the
    store cache so the next access rebuilds Foothills/Range from a fresh (but
    deterministic + reload-stable) base seed. The rebuild takes a few seconds. */
export const adminRerollTerrainFn = createServerFn({ method: "POST" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }) => {
        guard(data.adminToken);
        await setTerrainSeed((await getTerrainSeed()) + 1);
        invalidateStore();
        // kick the rebuild now (fresh base seed) so the console's progress row and
        // the student overlay pick up the new build immediately, not on next RPC.
        void getActiveStore().catch(() => {});
        return { ok: true };
    });

/* ---- active dataset info (console StatusStrip / Import badge) ---- */

export const adminDatasetFn = createServerFn({ method: "GET" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }): Promise<DatasetInfo | null> => {
        guard(data.adminToken);
        const [store, count] = await Promise.all([
            getActiveStore(),
            prisma.dataset.count(),
        ]);
        // no dataset imported yet — the console keeps every gated section locked.
        if (!store) return null;
        const row = await prisma.dataset.findUnique({
            where: { id: store.datasetId },
            select: { source: true },
        });
        return {
            name: row?.source ?? "import",
            version: count + 1,
            label: store.label,
            // a store exists ⇒ a survey has been imported, which unlocks Generate;
            // generated (source === 'generate', set by adminGenerateFn) then unlocks
            // Live Ops and everything after it.
            imported: true,
            generated: row?.source === "generate",
            canonical: [store.config.canonical_x, store.config.canonical_y],
            counts: {
                real: store.realRows.length,
                reveal: store.points.filter((p) => !p.real && !p.hidden).length,
                hidden: store.points.filter((p) => p.hidden).length,
            },
        };
    });

/* ---- active dataset rows (console Import table viewer) ---- */

export const adminDataRowsFn = createServerFn({ method: "GET" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }): Promise<RealRow[]> => {
        guard(data.adminToken);
        return (await getActiveStore())?.realRows ?? [];
    });

/* ---- active dataset points (console distribution histogram) ---- */

/** The full active point set — real + reveal + hidden, all 9 feats — for the
    Generate section's before/after distribution chart. Admin-token gated; feats
    are never gated (only labels are, and only for students). */
export const adminPointsFn = createServerFn({ method: "GET" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }): Promise<DataPoint[]> => {
        guard(data.adminToken);
        return (await getActiveStore())?.points ?? [];
    });

/* ---- clear all data (console Setup / Phase 0) ---- */

/** Wipe imported/generated datasets plus the accumulated submissions & fog
    queries, returning the console to the pre-import seed state. Student accounts
    and phase/reveal state are left intact. */
export const adminClearDataFn = createServerFn({ method: "POST" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }) => {
        guard(data.adminToken);
        await prisma.submission.deleteMany({});
        await prisma.fogQuery.deleteMany({});
        await prisma.dataset.deleteMany({});
        invalidateStore();
        return { ok: true };
    });

/* ---- reset db: full factory reset (console Setup / Phase 0) ---- */

/** Full factory reset: wipe ALL workshop data — students, submissions, fog
    queries and datasets — and reset AppState to fresh-boot defaults. The room
    returns to the Phase-0 setup gate (phase P1, all reveals off). The `User`
    boilerplate table is left untouched. */
export const adminResetDbFn = createServerFn({ method: "POST" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }) => {
        guard(data.adminToken);
        await prisma.submission.deleteMany({});
        await prisma.fogQuery.deleteMany({});
        await prisma.dataset.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.appState.deleteMany({}); // phase/reveals revert to DEFAULTS
        invalidateStore();
        return { ok: true };
    });

/* ---- roster whitelist (console Roster / join gate) ---- */

/** Current roster whitelist (enforcement flag + allowed (team, name) list). */
export const adminGetWhitelistFn = createServerFn({ method: "GET" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }): Promise<WhitelistState> => {
        guard(data.adminToken);
        return getWhitelist();
    });

/** Replace the roster whitelist. Sanitization/validation happens server-side. */
export const adminSetWhitelistFn = createServerFn({ method: "POST" })
    .validator(
        (d: {
            adminToken: string;
            enabled: boolean;
            entries: WhitelistEntry[];
        }) => d
    )
    .handler(async ({ data }) => {
        guard(data.adminToken);
        await setWhitelist({ enabled: data.enabled, entries: data.entries });
        return { ok: true };
    });

/* ---- data viz stats ---- */

function hist(
    values: number[],
    lo: number,
    hi: number,
    bins = 10
): HistBucket[] {
    const out: HistBucket[] = [];
    const w = (hi - lo) / bins || 1;
    for (let i = 0; i < bins; i++)
        out.push({ lo: lo + i * w, hi: lo + (i + 1) * w, count: 0 });
    values.forEach((v) => {
        let idx = Math.floor((v - lo) / w);
        if (idx < 0) idx = 0;
        if (idx >= bins) idx = bins - 1;
        out[idx].count++;
    });
    return out;
}

export const adminStatsFn = createServerFn({ method: "GET" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }): Promise<AdminStats> => {
        guard(data.adminToken);
        const [studentCount, subs, acc, loss] = await Promise.all([
            prisma.student.count(),
            prisma.submission.findMany({
                select: { phase: true, score: true, studentId: true },
            }),
            getLeaderboard("ACC", null),
            getLeaderboard("LOSS", null),
        ]);

        type SubRow = { phase: string; score: number; studentId: string };
        const phases = ["P1", "P2", "P3", "P4", "P5", "API"];
        const perPhase = phases.map((phase) => {
            const rows = (subs as SubRow[]).filter((s) => s.phase === phase);
            const scores = rows.map((s) => s.score);
            const isLoss = LOSS_PHASES.includes(phase);
            const lo = isLoss ? Math.min(...scores, 0) : 0;
            const hi = isLoss ? Math.max(...scores, 1) : 100;
            const best = scores.length
                ? isLoss
                    ? Math.min(...scores)
                    : Math.max(...scores)
                : null;
            return {
                phase,
                submissions: rows.length,
                participants: new Set(rows.map((s) => s.studentId)).size,
                scoreHist: scores.length ? hist(scores, lo, hi) : [],
                best,
            };
        });

        void ACC_PHASES; // documents which phases feed the ACC board
        return { studentCount, perPhase, acc: acc.top, loss: loss.top };
    });

/* ---- per-student phase scores (console Scores section) ---- */

/** Full-roster per-student best score + attempts for one phase; the console
    sorts/filters it by score and squad client-side. */
export const adminPhaseScoresFn = createServerFn({ method: "GET" })
    .validator((d: { adminToken: string; phase: Phase }) => d)
    .handler(async ({ data }): Promise<PhaseScores> => {
        guard(data.adminToken);
        return getPhaseScores(data.phase);
    });

/** Grant a student `delta` extra attempts for one phase — raises the server
    cap and the student's own effective cap (getLimitsFn) by the same amount, so
    a capped-out submit button re-opens within one /state poll. Returns the new
    absolute bonus. Scores section. */
export const adminGrantAttemptsFn = createServerFn({ method: "POST" })
    .validator(
        (d: {
            adminToken: string;
            studentId: string;
            phase: Phase;
            delta: number;
        }) => d
    )
    .handler(async ({ data }): Promise<{ bonus: number }> => {
        guard(data.adminToken);
        const student = await prisma.student.findUnique({
            where: { id: data.studentId },
            select: { id: true },
        });
        if (!student) throw new Error("student not found");
        const bonus = await grantAttempts(
            data.studentId,
            data.phase,
            data.delta
        );
        return { bonus };
    });

/* ---- full dump ---- */

export const adminDumpFn = createServerFn({ method: "GET" })
    .validator((d: { adminToken: string }) => d)
    .handler(async ({ data }) => {
        guard(data.adminToken);
        const [students, submissions, fogQueries] = await Promise.all([
            prisma.student.findMany({
                select: { id: true, nickname: true, createdAt: true },
            }),
            prisma.submission.findMany(),
            prisma.fogQuery.findMany(),
        ]);
        return { students, submissions, fogQueries };
    });
