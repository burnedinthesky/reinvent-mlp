/* AdminService — the operator-console seam, mirroring the WorkshopDataService
   pattern (data-service.ts). Every admin action is an async method whose shape
   follows spec.md §3.3 / §4; HttpAdminService (calling the createServerFn admin
   fns) is the only implementation, so the console runs entirely against the live
   backend.

   Admin-panel types are co-located here (not in types.ts) so this seam stays
   self-contained; the shared workshop types (Phase, Reveals, ServerState,
   FeatureKey) are imported. */

import { HttpAdminService } from "./http-admin-service";
import type { WhitelistState } from "./whitelist-csv";
import type {
    ClassLabel,
    DataPoint,
    FeatureKey,
    Phase,
    PhaseScores,
    RealRow,
    Reveals,
    ServerState,
} from "./types";

/* ------------------------------------------------------------------ types */

export type RevealKey = keyof Reveals;

/** Re-exported from the shared constants module (single source of truth) so
    existing `import { PHASES } from './admin-service'` sites keep working while
    the canonical definitions live in one place. `REVEAL_META` lives there too
    (client-safe) so the student Header can read the per-phase flag metadata
    without importing this admin seam; console sections keep importing it here. */
export { PHASES, REVEAL_META } from "./constants";

/** Re-exported so console sections import the per-phase score-table shapes from
    the admin seam alongside the rest of the admin types. */
export type { PhaseScoreRow, PhaseScores } from "./types";

export interface DatasetInfo {
    name: string;
    version: number;
    label: string;
    /** always true once a DatasetInfo exists (a store implies an import); the
      console models the pre-import state as a null DatasetInfo, which keeps
      Generate (and beyond) locked until a real survey is imported. */
    imported: boolean;
    /** true once the operator has run Generate on the imported data — the second
      gate: keeps Live Ops and everything after it locked until then. */
    generated: boolean;
    canonical: [FeatureKey, FeatureKey];
    counts: { real: number; reveal: number; hidden: number };
}

export type ImportSource = "paste" | "file";

export interface ImportInput {
    source: ImportSource;
    csv: string;
}

export interface FeatureStat {
    key: FeatureKey;
    name: string;
    meanEarly: number;
    meanOwl: number;
    /** crude point-biserial correlation with the label (signal proxy). */
    r: number;
}

export interface BalanceReport {
    total: number;
    /** counts for the *chosen* label. owl = class 1 (or P), early = class 0. */
    counts: { owl: number; early: number };
    minority: number;
    /** WARN copy when the majority-class fraction is outside the ~42–58% band (§4.1). */
    warn: string | null;
    perFeature: FeatureStat[];
    /** hygiene: rows dropped (blank/timestamp) and ugly cells repaired. */
    droppedRows: number;
    fixedCells: number;
}

export interface GenerateParams {
    strategy: string;
    /** global class-mean separation multiplier (the auto-tuned knob, §4.3). */
    sep: number;
    /** numeric-feature noise σ multiplier (default 1.3 — self-reports lie). */
    noise: number;
    /** mixture weight of the two class-1 archetypes (0..1). */
    mix: number;
    /** fraction of labels flipped for irreducible error (loss floor). */
    flip: number;
    seed: number;
}

export interface SynthStrategy {
    id: string;
    name: string;
    desc: string;
    defaults: GenerateParams;
}

export type CheckUnit = "%" | "auc" | "n";

export interface VerificationCheck {
    name: string;
    value: number;
    unit: CheckUnit;
    band: [number, number];
    pass: boolean;
    /** which knob to turn when out of band (§4.4). */
    knobHint?: string;
}

export interface PreviewPoint {
    x: number;
    y: number;
    cls: ClassLabel;
}

export interface VerificationReport {
    checks: VerificationCheck[];
    preview: PreviewPoint[];
    allPass: boolean;
    /** auto-retune passes the harness would have run (§4.4). */
    iterations: number;
}

/** One row of a P4 terrain hardness report, adapted for the console's terrain
    panel. Terrain bands are raw counts/fractions (no % rescaling), so `band` is
    rendered directly as the lo–hi threshold. */
export interface TerrainCheck {
    name: string;
    value: number;
    band: [number, number];
    pass: boolean;
    knobHint?: string;
}

/** A scored terrain's console report: bands, the 5 ladder means (weakest 醉猴 →
    strongest +restarts), and a downsampled top-down loss grid for the preview. */
export interface TerrainReport {
    stage: string;
    H: number;
    name: string;
    checks: TerrainCheck[];
    ladder: number[];
    preview: number[];
    pn: number;
    gMin: number;
    gMax: number;
}

/** The console's view of the P4 terrain panel: the background-build status plus
    the per-stage reports (empty while `status.state === 'building'`). The
    Generate section shows a progress row and polls until `state === 'ready'`. */
export interface TerrainReportsResult {
    status: {
        state: "idle" | "building" | "ready" | "error";
        progress: number;
        phase: string;
    };
    reports: TerrainReport[];
}

export interface LeaderboardRow {
    rank: number;
    name: string;
    value: number;
    tag?: string;
}

export interface PhaseStat {
    /** Phase, plus the reserved 'API' uni-tier channel in server mode. */
    phase: string;
    subs: number;
    used: number;
    cap: number;
}

export interface AdminStats {
    students: number;
    perPhase: PhaseStat[];
    accBoard: LeaderboardRow[];
    lossBoard: LeaderboardRow[];
    /** score histogram buckets (0..100 in 10s) for the current ACC phase. */
    scoreHist: number[];
}

export interface AdminDump {
    exportedAt: string;
    state: ServerState;
    dataset: DatasetInfo | null;
    stats: AdminStats;
    /** raw DB rows (students / submissions / fog queries) in server mode. */
    raw?: unknown;
}

export interface AdminService {
    /** supply the operator's ADMIN_TOKEN, sent with every admin fn call. */
    setToken: (token: string) => void;
    getState: () => Promise<ServerState>;
    setPhase: (phase: Phase) => Promise<ServerState>;
    setReveal: (key: RevealKey, value: boolean) => Promise<ServerState>;
    setDeadline: (iso: string | null) => Promise<ServerState>;
    setSelfSelect: (value: boolean) => Promise<ServerState>;
    /** the active dataset's info, or null until a survey has been imported. */
    getDataset: () => Promise<DatasetInfo | null>;
    /** the active dataset's real survey rows, for the Import table viewer. */
    getDataRows: () => Promise<RealRow[]>;
    /** the full active point set (real + synthetic), for the distribution chart. */
    getPoints: () => Promise<DataPoint[]>;
    importDataset: (input: ImportInput) => Promise<BalanceReport>;
    /** wipe the imported/generated data and return to the pre-import state. */
    clearData: () => Promise<void>;
    /** full factory reset: wipe all students/submissions/fog/datasets and reset phase state. */
    resetDb: () => Promise<void>;
    generate: (params: GenerateParams) => Promise<VerificationReport>;
    /** the last generate's persisted verification report (bands + wedge preview),
      or null if the active dataset hasn't been generated — lets the Generate
      section rehydrate its analytics on reload. */
    getGenerateReport: () => Promise<VerificationReport | null>;
    /** the background-build status + the hardness reports for both scored terrains
      (Foothills / Range) — bands, ladder means, and a downsampled preview grid —
      for the terrain panel. `reports` is empty while the build is still running;
      the console polls until `status.state === 'ready'`. */
    getTerrainReports: () => Promise<TerrainReportsResult>;
    /** re-roll both scored terrains (bumps the terrain seed, rebuilds the store).
      Resolves once the server has invalidated the cache; the rebuild happens on
      the next terrain fetch. */
    rerollTerrain: () => Promise<void>;
    getStats: () => Promise<AdminStats>;
    /** full-roster per-student best score + attempts for one phase (Scores section). */
    getPhaseScores: (phase: Phase) => Promise<PhaseScores>;
    /** grant a student `delta` extra attempts for one phase (raises their cap by
      that much; negative takes some back, clamped at 0). Scores section. */
    grantAttempts: (
        studentId: string,
        phase: Phase,
        delta: number
    ) => Promise<void>;
    /** the roster whitelist gating who may join (enforcement flag + allow-list). */
    getWhitelist: () => Promise<WhitelistState>;
    setWhitelist: (state: WhitelistState) => Promise<void>;
    dump: () => Promise<AdminDump>;
}

/** Re-exported so console sections import roster types from the service seam
    alongside the rest of the admin types. */
export type { WhitelistEntry, WhitelistState } from "./whitelist-csv";

/* ------------------------------------------------------------- strategies */

export const SYNTH_STRATEGIES: SynthStrategy[] = [
    {
        id: "balanced_wedge",
        name: "Balanced wedge",
        desc: "The canonical OR-shape: one line ≈85%, two lines ≈93–95%. The camp default.",
        defaults: {
            strategy: "balanced_wedge",
            sep: 1,
            noise: 1.3,
            mix: 0.55,
            flip: 0.05,
            seed: 7,
        },
    },
    {
        id: "tight",
        name: "Tight / near-linear",
        desc: "Wider class separation — a single line already scores high. Good for a warm-up demo.",
        defaults: {
            strategy: "tight",
            sep: 1.35,
            noise: 1.0,
            mix: 0.5,
            flip: 0.03,
            seed: 7,
        },
    },
    {
        id: "noisy",
        name: "Noisy / overlapping",
        desc: "Heavy self-report noise and thinner margins — punishes shortcut features.",
        defaults: {
            strategy: "noisy",
            sep: 0.8,
            noise: 1.7,
            mix: 0.55,
            flip: 0.08,
            seed: 7,
        },
    },
    {
        id: "skewed",
        name: "Archetype-skewed",
        desc: "Lopsided mixture so one class-1 archetype dominates — stresses the two-line fit.",
        defaults: {
            strategy: "skewed",
            sep: 1.05,
            noise: 1.3,
            mix: 0.78,
            flip: 0.05,
            seed: 7,
        },
    },
];

/* ------------------------------------------------------------ singleton */

let singleton: AdminService | null = null;

/** The live operator console service (HttpAdminService → the /admin
    createServerFn endpoints). Built lazily and cached for the app lifetime. */
export function getAdminService(): AdminService {
    if (!singleton) singleton = new HttpAdminService();
    return singleton;
}
