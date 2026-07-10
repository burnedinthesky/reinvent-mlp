/* HttpDataService — the backend behind the WorkshopDataService seam, and the
   only implementation. Every method calls the matching server function (fn/*),
   passing the session bearer token in the payload (LAN prototype: no header
   plumbing needed over the RPC envelope). The only genuinely client-side piece
   is createNetEngine: the MLP playground trains in-browser and never submits —
   the same split the interface already encodes. */

import { NetEngine } from "./mlp";
import type { Activation, NetArchConfig } from "./mlp";
import {
    LossLandscape,
    lossColor as lossColorFn,
    trainFrameOf,
} from "./lossgrid";
import type { WorkshopDataService, DataBundle, BowlGrid } from "./data-service";
import type {
    BotProgram,
    CirclesResult,
    ClassLabel,
    DataPoint,
    StageSubmitResult,
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
} from "./types";

import { joinFn } from "./fn/identity";
import { getBundleFn, getLimitsFn, getStateFn, getTerrainFn } from "./fn/data";
import {
    botSandboxFn,
    submitBotFn,
    submitGuessFn,
    submitP2LabelsFn,
    submitP3LineFn,
    submitP5NetFn,
} from "./fn/submissions";
import { fogQueryFn } from "./fn/fog";

export class HttpDataService implements WorkshopDataService {
    private token = "";
    private lossRange: { min: number; max: number } = { min: 0, max: 1 };
    private points: DataPoint[] = [];
    private land: LossLandscape | null = null;
    /** scored-stage loss grids, cached in-memory (shipped by submitBot or fetched
      by getTerrain) so revealed terrain survives a component remount. */
    private terrains = new Map<StageId, BowlGrid>();

    setToken(token: string): void {
        this.token = token;
    }

    async join(team: number, name: string): Promise<JoinResult> {
        const r = await joinFn({ data: { team, name } });
        this.token = r.token;
        return r;
    }

    async getState(): Promise<ServerState> {
        return getStateFn();
    }

    async getLimits(): Promise<PhaseCaps> {
        if (!this.token) return {};
        return getLimitsFn({ data: { token: this.token } });
    }

    async getBundle(): Promise<DataBundle> {
        const b = await getBundleFn();
        this.lossRange = b.config.lossRange;
        // cache points so the MLP playground can build its client-side training landscape (labels
        // are revealed by the time the playground opens).
        this.points = b.points;
        this.land = null;
        return b;
    }

    async submitGuess(
        labels: Partial<Record<string, ClassLabel>>
    ): Promise<GuessResult> {
        return submitGuessFn({ data: { token: this.token, labels } });
    }

    async submitLabels(sub: LabelsSubmission): Promise<CirclesResult> {
        return submitP2LabelsFn({ data: { token: this.token, sub } });
    }

    async submitLine(sub: LineSubmission): Promise<LineResult> {
        return submitP3LineFn({
            data: { token: this.token, w: sub.w, b: sub.b, plane: sub.plane },
        });
    }

    async fogQuery(
        round: FogRound,
        w: number,
        b: number
    ): Promise<FogQueryResult> {
        return fogQueryFn({ data: { token: this.token, round, w, b } });
    }

    async submitBot(
        prog: BotProgram,
        stage: "mlp_a" | "mlp_b"
    ): Promise<StageSubmitResult> {
        const res = await submitBotFn({
            data: { token: this.token, prog, stage },
        });
        // cache the scored stage's grid the response ships, so the terrain renders
        // immediately and getTerrain() needn't re-fetch this session.
        const g = res.grid;
        if (g) {
            this.terrains.set(g.stage, {
                grid: Float32Array.from(g.grid),
                gMin: g.min,
                gMax: g.max,
                gn: g.gn,
            });
        }
        return res;
    }

    async botSandbox(prog: BotProgram): Promise<StageRunResult> {
        return botSandboxFn({ data: { token: this.token, prog } });
    }

    bowlGrid(): BowlGrid {
        // reconstruct the Bowl landscape from the loaded (revealed) training points —
        // the same client-side reconstruction the MLP playground's net engine uses.
        if (!this.land) this.land = new LossLandscape(this.points);
        const l = this.land;
        return { grid: l.grid, gMin: l.gMin, gMax: l.gMax, gn: l.GN };
    }

    async getTerrain(stage: StageId): Promise<BowlGrid> {
        if (stage === "bowl") return this.bowlGrid();
        const cached = this.terrains.get(stage);
        if (cached) return cached;
        const t = await getTerrainFn({ data: { token: this.token, stage } });
        const grid: BowlGrid = {
            grid: Float32Array.from(t.grid),
            gMin: t.min,
            gMax: t.max,
            gn: t.gn,
        };
        this.terrains.set(stage, grid);
        return grid;
    }

    async submitP5Net(sub: P5NetSubmission): Promise<P5NetResult> {
        return submitP5NetFn({ data: { token: this.token, sub } });
    }

    createP5NetEngine(
        axes: [FeatureKey, FeatureKey],
        arch: NetArchConfig,
        lr: number,
        points?: DataPoint[]
    ): NetEngine {
        // stage 2 trains in-browser on the CHOSEN axes' frame (baked-in trainZ) —
        // tanh is fixed (no picker; that's the MLP playground's beat). Recreated on an axis change.
        // P5 passes its own 100-dot training slice (the visible synthetic set); other
        // callers get the full loaded set.
        const pts = points ?? this.points;
        const frame = trainFrameOf(pts, axes[0], axes[1]);
        return new NetEngine(frame, pts, arch, "tanh", lr);
    }

    createNetEngine(
        arch: NetArchConfig,
        act: Activation,
        lr: number
    ): NetEngine {
        // The MLP playground trains in-browser against the loaded (revealed) training
        // points — purely client-side, nothing is submitted for scoring.
        if (!this.land) this.land = new LossLandscape(this.points);
        return new NetEngine(
            trainFrameOf(this.points),
            this.points,
            arch,
            act,
            lr
        );
    }

    lossColor(L: number, alpha?: number): string {
        return lossColorFn(L, this.lossRange.min, this.lossRange.max, alpha);
    }
}
