import { adaptBalance, adaptGenerate, adaptTerrain } from "./admin-adapters";
import type {
    AdminDump,
    AdminService,
    AdminStats,
    BalanceReport as UiBalanceReport,
    DatasetInfo,
    GenerateParams,
    ImportInput,
    PhaseScores,
    RevealKey,
    TerrainReportsResult,
    VerificationReport,
    WhitelistState,
} from "./admin-service";
import { SYNTH_STRATEGIES } from "./admin-service";
import { makePseudos, WEDGE_MEANS } from "./dataset-shared";
import {
    AXIS_KEYS,
    CANONICAL_X,
    CANONICAL_Y,
    COLS,
    DND_LABELS,
    FEATURES,
} from "./features";
import { LossLandscape } from "./lossgrid";
import { createRng } from "./rng";
import { cleanRealCsv, generateSynth } from "./server/dataset-io";
import { buildRiggedRange } from "./terrain";
import type { StageTerrain } from "./terrain";
import type {
    ClassLabel,
    DataPoint,
    FeatureValues,
    GenerateReport,
    Phase,
    RealRow,
    ServerState,
    TerrainStageReport,
    WorkshopConfig,
} from "./types";

const DB_NAME = "reinvent-mlp-serverless";
const STORE_NAME = "workshop";
const ACTIVE_KEY = "active";
const RECORD_VERSION = 1;

export interface LocalDatasetRecord {
    schemaVersion: number;
    id: string;
    label: string;
    realRows: RealRow[];
    points: DataPoint[];
    params: GenerateParams;
    balance: UiBalanceReport | null;
    report: VerificationReport;
    wireReport: GenerateReport;
    terrainSeed: number;
    source: "synthetic" | "upload";
    savedAt: string;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error("IndexedDB failed"));
    });
}

async function openDb(): Promise<IDBDatabase> {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME))
            db.createObjectStore(STORE_NAME);
    };
    return requestValue(request);
}

async function readRecord(): Promise<LocalDatasetRecord | null> {
    const db = await openDb();
    try {
        const value = await requestValue(
            db
                .transaction(STORE_NAME, "readonly")
                .objectStore(STORE_NAME)
                .get(ACTIVE_KEY)
        );
        if (
            !value ||
            (value as LocalDatasetRecord).schemaVersion !== RECORD_VERSION
        )
            return null;
        return value as LocalDatasetRecord;
    } finally {
        db.close();
    }
}

async function writeRecord(record: LocalDatasetRecord): Promise<void> {
    const db = await openDb();
    try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(record, ACTIVE_KEY);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () =>
                reject(tx.error ?? new Error("IndexedDB write failed"));
            tx.onabort = () =>
                reject(tx.error ?? new Error("IndexedDB write aborted"));
        });
    } finally {
        db.close();
    }
}

async function deleteRecord(): Promise<void> {
    const db = await openDb();
    try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(ACTIVE_KEY);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () =>
                reject(tx.error ?? new Error("IndexedDB delete failed"));
        });
    } finally {
        db.close();
    }
}

function clampRound(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
}

/** A deterministic, entirely synthetic survey-like anchor set. */
function buildSyntheticRows(seed: number): RealRow[] {
    const rng = createRng(seed);
    const pseudos = makePseudos(rng, 48);
    const specs: { cls: ClassLabel; arch: "a1" | "a2" | "none" }[] = [];
    for (let i = 0; i < 24; i++)
        specs.push({ cls: 1, arch: rng() < 0.55 ? "a1" : "a2" });
    for (let i = 0; i < 24; i++) specs.push({ cls: 0, arch: "none" });
    for (let i = specs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [specs[i], specs[j]] = [specs[j], specs[i]];
    }
    return specs.map(({ cls, arch }, index) => {
        const [zx, zy] = WEDGE_MEANS[arch];
        const owl = cls === 1;
        const feats: FeatureValues = {
            SCREEN_AVG: clampRound(
                360 + (zx + rng.gauss() * 0.55) * 150,
                0,
                960
            ),
            CAFFEINE: clampRound(4.2 + (zy + rng.gauss() * 0.55) * 2.9, 0, 24),
            LATE7: clampRound((owl ? 4.6 : 1.4) + rng.gauss() * 1.4, 0, 7),
            SNACK_DAYS: clampRound((owl ? 3.4 : 1.1) + rng.gauss() * 1.4, 0, 7),
            LATE_SHOWER: clampRound((owl ? 3 : 1) + rng.gauss() * 1.4, 0, 7),
            EARLY_WAKE: clampRound((owl ? 1.6 : 4.6) + rng.gauss() * 1.4, 0, 7),
            GAME_HRS: clampRound((owl ? 15 : 5) + rng.gauss() * 6, 0, 60),
            DND_START: clampRound((owl ? 3.1 : 1.1) + rng.gauss() * 0.95, 0, 4),
            BREAKFAST: clampRound((owl ? 2.6 : 4.8) + rng.gauss() * 1.4, 0, 7),
        };
        return {
            id: `r${index}`,
            pseudo: pseudos[index],
            feats,
            label: cls,
            real: true,
        };
    });
}

function buildPreview(points: DataPoint[]): GenerateReport["preview"] {
    const visible = points.filter((p) => !p.real && !p.hidden);
    const stat = (key: typeof CANONICAL_X | typeof CANONICAL_Y) => {
        const values = visible.map((p) => p.feats[key]);
        const mean =
            values.reduce((sum, value) => sum + value, 0) /
            (values.length || 1);
        const sd =
            Math.sqrt(
                values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
                    (values.length || 1)
            ) || 1;
        return { mean, sd };
    };
    const x = stat(CANONICAL_X);
    const y = stat(CANONICAL_Y);
    return visible.map((point) => ({
        x: Math.max(
            -3,
            Math.min(3, (point.feats[CANONICAL_X] - x.mean) / x.sd)
        ),
        y: Math.max(
            -3,
            Math.min(3, (point.feats[CANONICAL_Y] - y.mean) / y.sd)
        ),
        cls: point.label ?? 0,
    }));
}

export function buildLocalConfig(
    points: DataPoint[],
    label = "LABEL_OWL"
): WorkshopConfig {
    const land = new LossLandscape(points);
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

function datasetInfo(record: LocalDatasetRecord): DatasetInfo {
    return {
        name: record.id,
        version: record.schemaVersion,
        label: record.label,
        imported: true,
        generated: true,
        canonical: [CANONICAL_X, CANONICAL_Y],
        counts: {
            real: record.realRows.length,
            reveal: record.points.filter((p) => !p.real && !p.hidden).length,
            hidden: record.points.filter((p) => p.hidden).length,
        },
    };
}

function stageReport(
    id: "mlp_a" | "mlp_b",
    terrain: StageTerrain,
    report: ReturnType<typeof buildRiggedRange>["report"],
    ladder: number[]
): TerrainStageReport {
    const stride = 4;
    const preview: number[] = [];
    for (let y = 0; y < terrain.GN; y += stride)
        for (let x = 0; x < terrain.GN; x += stride)
            preview.push(terrain.grid[y * terrain.GN + x]);
    return {
        stage: id,
        H: id === "mlp_a" ? 2 : 3,
        name: id === "mlp_a" ? "Foothills" : "Range",
        checks: report,
        ladder,
        preview,
        pn: Math.floor((terrain.GN - 1) / stride) + 1,
        gMin: terrain.gMin,
        gMax: terrain.gMax,
    };
}

type Listener = (record: LocalDatasetRecord | null) => void;

export class LocalWorkshopRuntime {
    private record: LocalDatasetRecord | null = null;
    private loaded = false;
    private listeners = new Set<Listener>();
    private terrains: Partial<Record<"mlp_a" | "mlp_b", StageTerrain>> = {};
    private terrainReports: TerrainStageReport[] = [];

    async load(): Promise<LocalDatasetRecord | null> {
        if (!this.loaded) {
            this.record = await readRecord();
            this.loaded = true;
        }
        return this.record;
    }

    current(): LocalDatasetRecord | null {
        return this.record;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(): void {
        this.listeners.forEach((listener) => listener(this.record));
    }

    private async activate(
        realRows: RealRow[],
        params: GenerateParams,
        source: LocalDatasetRecord["source"],
        balance: UiBalanceReport | null
    ): Promise<LocalDatasetRecord> {
        const generated = generateSynth(realRows, {
            strategy: "wedge",
            sep: params.sep,
            noise: params.noise,
            mix: params.mix,
            flip: params.flip,
            seed: params.seed,
        });
        const wireReport = {
            ...generated.report,
            preview: buildPreview(generated.points),
        };
        const record: LocalDatasetRecord = {
            schemaVersion: RECORD_VERSION,
            id: `local-${Date.now()}`,
            label: "LABEL_OWL",
            realRows,
            points: generated.points,
            params,
            balance,
            wireReport,
            report: adaptGenerate(wireReport),
            terrainSeed: params.seed,
            source,
            savedAt: new Date().toISOString(),
        };
        await writeRecord(record);
        this.record = record;
        this.loaded = true;
        this.terrains = {};
        this.terrainReports = [];
        this.emit();
        return record;
    }

    async createDefault(
        params = SYNTH_STRATEGIES[0].defaults
    ): Promise<LocalDatasetRecord> {
        return this.activate(
            buildSyntheticRows(params.seed),
            params,
            "synthetic",
            null
        );
    }

    async importCsv(csv: string): Promise<UiBalanceReport> {
        const params = this.record?.params ?? SYNTH_STRATEGIES[0].defaults;
        const cleaned = cleanRealCsv(csv, params.seed);
        const balance = adaptBalance(cleaned.report);
        await this.activate(cleaned.realRows, params, "upload", balance);
        return balance;
    }

    async generate(params: GenerateParams): Promise<VerificationReport> {
        const rows = this.record?.realRows ?? buildSyntheticRows(params.seed);
        const source = this.record?.source ?? "synthetic";
        const record = await this.activate(
            rows,
            params,
            source,
            this.record?.balance ?? null
        );
        return record.report;
    }

    async clear(): Promise<void> {
        await deleteRecord();
        this.record = null;
        this.loaded = true;
        this.terrains = {};
        this.terrainReports = [];
        this.emit();
    }

    async ensureTerrains(): Promise<void> {
        const record = await this.load();
        if (!record || this.terrainReports.length) return;
        const a = buildRiggedRange(record.terrainSeed ^ 0x52f0a1);
        const b = buildRiggedRange(record.terrainSeed ^ 0xa91c37);
        this.terrains.mlp_a = { ...a.stage, id: "mlp_a" };
        this.terrains.mlp_b = b.stage;
        this.terrainReports = [
            stageReport("mlp_a", this.terrains.mlp_a, a.report, a.ladder),
            stageReport("mlp_b", this.terrains.mlp_b, b.report, b.ladder),
        ];
    }

    terrain(id: "mlp_a" | "mlp_b"): StageTerrain | null {
        return this.terrains[id] ?? null;
    }

    reports(): TerrainStageReport[] {
        return this.terrainReports;
    }

    async rerollTerrain(): Promise<void> {
        const record = await this.load();
        if (!record) throw new Error("no active dataset");
        record.terrainSeed += 1;
        await writeRecord(record);
        this.terrains = {};
        this.terrainReports = [];
        await this.ensureTerrains();
        this.emit();
    }
}

export const localWorkshopRuntime = new LocalWorkshopRuntime();

const LOCAL_STATE: ServerState = {
    phase: "P1",
    deadline: null,
    reveals: {
        reveal100: false,
        p3_wb_plane: false,
        p2_line_mode: false,
        p3_show_dots: false,
        p5_deep: false,
        p4_terrains: false,
    },
    boards: ["ACC", "LOSS"],
    selfSelect: true,
    terrain: { state: "ready", progress: 1 },
};

/** Local adapter for the data-related admin panels. */
export class LocalAdminService implements AdminService {
    setToken(): void {}
    async getState(): Promise<ServerState> {
        return LOCAL_STATE;
    }
    async setPhase(phase: Phase): Promise<ServerState> {
        return { ...LOCAL_STATE, phase };
    }
    async setReveal(_key: RevealKey, _value: boolean): Promise<ServerState> {
        return LOCAL_STATE;
    }
    async setDeadline(_iso: string | null): Promise<ServerState> {
        return LOCAL_STATE;
    }
    async setSelfSelect(_value: boolean): Promise<ServerState> {
        return LOCAL_STATE;
    }
    async getDataset(): Promise<DatasetInfo | null> {
        const record = await localWorkshopRuntime.load();
        return record ? datasetInfo(record) : null;
    }
    async getDataRows(): Promise<RealRow[]> {
        return (await localWorkshopRuntime.load())?.realRows ?? [];
    }
    async getPoints(): Promise<DataPoint[]> {
        return (await localWorkshopRuntime.load())?.points ?? [];
    }
    async importDataset(input: ImportInput): Promise<UiBalanceReport> {
        return localWorkshopRuntime.importCsv(input.csv);
    }
    async clearData(): Promise<void> {
        await localWorkshopRuntime.clear();
    }
    async resetDb(): Promise<void> {
        await localWorkshopRuntime.clear();
    }
    async generate(params: GenerateParams): Promise<VerificationReport> {
        return localWorkshopRuntime.generate(params);
    }
    async getGenerateReport(): Promise<VerificationReport | null> {
        return (await localWorkshopRuntime.load())?.report ?? null;
    }
    async getTerrainReports(): Promise<TerrainReportsResult> {
        await localWorkshopRuntime.ensureTerrains();
        return {
            status: { state: "ready", progress: 1, phase: "ready" },
            reports: localWorkshopRuntime.reports().map(adaptTerrain),
        };
    }
    async rerollTerrain(): Promise<void> {
        await localWorkshopRuntime.rerollTerrain();
    }
    async getStats(): Promise<AdminStats> {
        return {
            students: 1,
            perPhase: [],
            accBoard: [],
            lossBoard: [],
            scoreHist: [],
        };
    }
    async getPhaseScores(_phase: Phase): Promise<PhaseScores> {
        return { rows: [], rosterCount: 0 } as unknown as PhaseScores;
    }
    async grantAttempts(): Promise<void> {}
    async getWhitelist(): Promise<WhitelistState> {
        return { enabled: false, entries: [] };
    }
    async setWhitelist(_state: WhitelistState): Promise<void> {}
    async dump(): Promise<AdminDump> {
        return {
            exportedAt: new Date().toISOString(),
            state: LOCAL_STATE,
            dataset: await this.getDataset(),
            stats: await this.getStats(),
        };
    }
}
