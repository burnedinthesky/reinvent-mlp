import type { BowlGrid, DataBundle, WorkshopDataService } from "./data-service";
import { PHASE_CAPS, FOG_BUDGET } from "./constants";
import {
    LossLandscape,
    lossColor as lossColorFn,
    trainFrameOf,
} from "./lossgrid";
import { NetEngine } from "./mlp";
import type { Activation, NetArchConfig } from "./mlp";
import {
    scoreGuess,
    scoreLabels,
    scoreLine,
    scoreP5Net,
    scoreStage,
} from "./server/scoring";
import type { ActiveStore } from "./server/store";
import { bowlStage } from "./terrain";
import { buildLocalConfig, localWorkshopRuntime } from "./local-runtime";
import type {
    BotProgram,
    CirclesResult,
    ClassLabel,
    DataPoint,
    FeatureKey,
    FogQueryResult,
    FogRound,
    GuessResult,
    JoinResult,
    LabelsSubmission,
    LineResult,
    LineSubmission,
    P5NetResult,
    P5NetSubmission,
    PhaseCaps,
    ServerState,
    StageId,
    StageRunResult,
    StageSubmitResult,
} from "./types";

const LOCAL_REVEALS = {
    reveal100: false,
    p3_wb_plane: false,
    p2_line_mode: false,
    p3_show_dots: false,
    p5_deep: false,
    p4_terrains: false,
};

export class LocalDataService implements WorkshopDataService {
    private points: DataPoint[] = [];
    private land: LossLandscape | null = null;
    private attempts = { guess: 0, labels: 0, line: 0, bot: 0, p5: 0 };
    private fogUsed: Record<FogRound, number> = { "1d": 0, "2d": 0 };

    private async store(): Promise<ActiveStore> {
        const record = await localWorkshopRuntime.load();
        if (!record) throw new Error("no active dataset");
        if (!this.land || this.points !== record.points) {
            this.points = record.points;
            this.land = new LossLandscape(record.points);
        }
        return {
            datasetId: record.id,
            label: record.label,
            realRows: record.realRows,
            points: record.points,
            land: this.land,
            config: buildLocalConfig(record.points, record.label),
        };
    }

    resetSession(): void {
        this.attempts = { guess: 0, labels: 0, line: 0, bot: 0, p5: 0 };
        this.fogUsed = { "1d": 0, "2d": 0 };
    }

    async getState(): Promise<ServerState> {
        await this.store();
        return {
            phase: "P1",
            deadline: null,
            reveals: LOCAL_REVEALS,
            boards: ["ACC", "LOSS"],
            selfSelect: true,
            terrain: { state: "ready", progress: 1 },
        };
    }

    async getBundle(): Promise<DataBundle> {
        const store = await this.store();
        return {
            realRows: store.realRows,
            points: store.points.map((point) =>
                point.hidden ? { ...point, label: undefined } : point
            ),
            config: store.config,
        };
    }

    async getLimits(): Promise<PhaseCaps> {
        return { ...PHASE_CAPS };
    }

    async submitGuess(
        labels: Partial<Record<string, ClassLabel>>
    ): Promise<GuessResult> {
        const store = await this.store();
        this.attempts.guess += 1;
        return { acc: scoreGuess(store, labels), attempt: this.attempts.guess };
    }

    async submitLabels(sub: LabelsSubmission): Promise<CirclesResult> {
        const store = await this.store();
        this.attempts.labels += 1;
        return { ...scoreLabels(store, sub), attempt: this.attempts.labels };
    }

    async submitLine(sub: LineSubmission): Promise<LineResult> {
        const store = await this.store();
        this.attempts.line += 1;
        return {
            ...scoreLine(store, sub.w, sub.b),
            attempt: this.attempts.line,
        };
    }

    async fogQuery(
        round: FogRound,
        w: number,
        b: number
    ): Promise<FogQueryResult> {
        const store = await this.store();
        const used = ++this.fogUsed[round];
        const bUsed = round === "1d" ? store.land.bStar : b;
        return {
            loss: store.land.lossAt(w, bUsed),
            remaining: Math.max(0, FOG_BUDGET[round] - used),
        };
    }

    async submitBot(
        prog: BotProgram,
        stage: "mlp_a" | "mlp_b"
    ): Promise<StageSubmitResult> {
        await localWorkshopRuntime.ensureTerrains();
        const terrain = localWorkshopRuntime.terrain(stage);
        if (!terrain) throw new Error("terrain unavailable");
        const result = scoreStage(terrain, prog, 4700 + this.attempts.bot++);
        return {
            stage,
            result,
            loss: result.trueLoss,
            grid: {
                stage,
                gn: terrain.GN,
                grid: Array.from(terrain.grid),
                min: terrain.gMin,
                max: terrain.gMax,
            },
        };
    }

    async botSandbox(prog: BotProgram): Promise<StageRunResult> {
        const store = await this.store();
        return scoreStage(
            bowlStage(store.land),
            prog,
            1200 + this.attempts.bot++
        );
    }

    bowlGrid(): BowlGrid {
        if (!this.land) throw new Error("dataset not loaded");
        return {
            grid: this.land.grid,
            gMin: this.land.gMin,
            gMax: this.land.gMax,
            gn: this.land.GN,
        };
    }

    async getTerrain(stage: StageId): Promise<BowlGrid> {
        if (stage === "bowl") return this.bowlGrid();
        await localWorkshopRuntime.ensureTerrains();
        const terrain = localWorkshopRuntime.terrain(stage);
        if (!terrain) throw new Error("terrain unavailable");
        return {
            grid: terrain.grid,
            gMin: terrain.gMin,
            gMax: terrain.gMax,
            gn: terrain.GN,
        };
    }

    async submitP5Net(sub: P5NetSubmission): Promise<P5NetResult> {
        const store = await this.store();
        this.attempts.p5 += 1;
        return { ...scoreP5Net(store, sub), attempt: this.attempts.p5 };
    }

    createP5NetEngine(
        axes: [FeatureKey, FeatureKey],
        arch: NetArchConfig,
        lr: number,
        points?: DataPoint[]
    ): NetEngine {
        const active = points ?? this.points;
        return new NetEngine(
            trainFrameOf(active, axes[0], axes[1]),
            active,
            arch,
            "tanh",
            lr
        );
    }

    createNetEngine(
        arch: NetArchConfig,
        act: Activation,
        lr: number
    ): NetEngine {
        return new NetEngine(
            trainFrameOf(this.points),
            this.points,
            arch,
            act,
            lr
        );
    }

    lossColor(loss: number, alpha?: number): string {
        const range = this.land
            ? { min: this.land.gMin, max: this.land.gMax }
            : { min: 0, max: 1 };
        return lossColorFn(loss, range.min, range.max, alpha);
    }

    async join(_team: number, name: string): Promise<JoinResult> {
        return { token: "local", nickname: name || "Local learner" };
    }

    setToken(_token: string): void {}
}

let singleton: LocalDataService | null = null;

export function getLocalDataService(): LocalDataService {
    if (!singleton) singleton = new LocalDataService();
    return singleton;
}
