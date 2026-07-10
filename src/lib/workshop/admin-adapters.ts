/* Pure shape adapters between the server wire types (types.ts — what fn/admin
   returns) and the console seam types (admin-service.ts — what the admin UI
   renders). Kept free of server-fn imports so they unit-test in isolation;
   HttpAdminService is the only runtime consumer. */

import { ACC_PHASES, PHASE_CAPS } from "./constants";
import { FEATURES } from "./features";
import type {
    AdminStats as UiAdminStats,
    BalanceReport as UiBalanceReport,
    CheckUnit,
    PhaseStat,
    TerrainCheck,
    TerrainReport,
    VerificationCheck,
    VerificationReport,
} from "./admin-service";
import type {
    AdminStats as ServerAdminStats,
    BalanceReport as ServerBalanceReport,
    GenerateReport,
    Phase,
    TerrainStageReport,
} from "./types";

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const pct1 = (v: number) => Math.round(v * 1000) / 10;

export function adaptBalance(server: ServerBalanceReport): UiBalanceReport {
    return {
        total: server.n,
        counts: { owl: server.ownlCount, early: server.earlyCount },
        minority: Math.min(server.ownlCount, server.earlyCount),
        warn: server.warning,
        perFeature: server.features.map((f) => ({
            key: f.key,
            name: FEATURES[f.key].name,
            meanEarly: round2(f.meanClass0),
            meanOwl: round2(f.meanClass1),
            r: round2(f.r),
        })),
        droppedRows: server.droppedRows ?? 0,
        fixedCells: server.fixedCells ?? 0,
    };
}

/** unit + scaling per §4.4 check name: fraction-valued checks render as
    percents; AUC and counts pass through raw. Unknown names default to '%'. */
const CHECK_UNITS: Record<string, CheckUnit> = {
    "one-line ceiling": "%",
    "kNN(9) ceiling": "%",
    "balance (owl frac)": "%",
    "max solo-feature AUC": "auc",
    "signal features (AUC≥.62)": "n",
};

export function adaptGenerate(server: GenerateReport): VerificationReport {
    const checks: VerificationCheck[] = server.checks.map((c) => {
        const unit = CHECK_UNITS[c.name] ?? "%";
        const scale = unit === "%" ? pct1 : (v: number) => v;
        return {
            name: c.name,
            value: scale(c.value),
            unit,
            band: [scale(c.lo), c.hi === Infinity ? Infinity : scale(c.hi)] as [
                number,
                number,
            ],
            pass: c.pass,
            knobHint: c.hint || undefined,
        };
    });
    return {
        checks,
        preview: server.preview ?? [],
        allPass: server.passedAll,
        // the server harness has no auto-retune loop; approximate "iterations" as
        // one clean pass or the number of out-of-band checks.
        iterations: server.passedAll
            ? 1
            : server.checks.filter((c) => !c.pass).length,
    };
}

/** Adapt a server terrain report to the console's terrain-panel shape. Terrain
    bands are raw counts/fractions (no % rescaling like adaptGenerate) — the lo/hi
    thresholds render directly — and values are lightly rounded for display. */
export function adaptTerrain(server: TerrainStageReport): TerrainReport {
    const checks: TerrainCheck[] = server.checks.map((c) => ({
        name: c.name,
        value: round2(c.value),
        band: [c.lo, c.hi] as [number, number],
        pass: c.pass,
        knobHint: c.hint || undefined,
    }));
    return {
        stage: server.stage,
        H: server.H,
        name: server.name,
        checks,
        ladder: server.ladder,
        preview: server.preview,
        pn: server.pn,
        gMin: server.gMin,
        gMax: server.gMax,
    };
}

export function adaptStats(
    server: ServerAdminStats,
    currentPhase: Phase
): UiAdminStats {
    const perPhase: PhaseStat[] = server.perPhase.map((p) => ({
        phase: p.phase,
        subs: p.submissions,
        used: p.participants ? round1(p.submissions / p.participants) : 0,
        cap: PHASE_CAPS[p.phase] ?? 0,
    }));

    // histogram: the current ACC phase if it has data, else the latest ACC phase
    // with any submissions (the console renders one 10-bucket strip).
    const withData = (ph: string) =>
        server.perPhase.find((p) => p.phase === ph && p.scoreHist.length > 0);
    const pick =
        (ACC_PHASES.includes(currentPhase)
            ? withData(currentPhase)
            : undefined) ??
        [...ACC_PHASES].reverse().map(withData).find(Boolean);
    const scoreHist = Array.from(
        { length: 10 },
        (_, i) => pick?.scoreHist[i]?.count ?? 0
    );

    return {
        students: server.studentCount,
        perPhase,
        accBoard: server.acc,
        lossBoard: server.loss,
        scoreHist,
    };
}
