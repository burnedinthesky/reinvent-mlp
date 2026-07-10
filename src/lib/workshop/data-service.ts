/* WorkshopDataService — the single seam the student app talks to. Every
   submission/query is an async method whose shape mirrors spec.md §3.3;
   HttpDataService is the only implementation and calls the matching server
   function (fn/*) over TanStack Start's createServerFn RPC.

   The one genuinely client-side piece is createNetEngine: the MLP playground
   trains in-browser against the revealed training points and never submits —
   the split the interface already encodes. */

import { HttpDataService } from "./http-data-service";
import type { Activation, NetArchConfig, NetEngine } from "./mlp";
import type {
    BotProgram,
    CirclesResult,
    ClassLabel,
    StageSubmitResult,
    FogQueryResult,
    FogRound,
    GuessResult,
    JoinResult,
    LabelsSubmission,
    LineSubmission,
    LineResult,
    P5NetSubmission,
    P5NetResult,
    PhaseCaps,
    FeatureKey,
    RealRow,
    ServerState,
    StageId,
    StageRunResult,
    WorkshopConfig,
    DataPoint,
} from "./types";

/** The Bowl loss grid (client-reconstructed from the revealed training slice,
    like the MLP playground net engine). Used by the P4 iso-3D terrain renderer. */
export interface BowlGrid {
    grid: Float32Array;
    gMin: number;
    gMax: number;
    gn: number;
}

export interface DataBundle {
    realRows: RealRow[];
    points: DataPoint[];
    config: WorkshopConfig;
}

export interface WorkshopDataService {
    getState: () => Promise<ServerState>;
    getBundle: () => Promise<DataBundle>;
    /** the calling student's effective per-phase attempt caps (base + granted
      bonus). Polled alongside /state so an operator grant re-opens a capped
      phase; returns {} before the session token is set. */
    getLimits: () => Promise<PhaseCaps>;
    submitGuess: (
        labels: Partial<Record<string, ClassLabel>>
    ) => Promise<GuessResult>;
    submitLabels: (sub: LabelsSubmission) => Promise<CirclesResult>;
    /** P3 line-fit: submit the z-scored (w, b); server returns acc + landscape
      loss + the ids of every misclassified point (for the red flash). */
    submitLine: (sub: LineSubmission) => Promise<LineResult>;
    fogQuery: (
        round: FogRound,
        w: number,
        b: number
    ) => Promise<FogQueryResult>;
    /** P4 scored submission: validate + run the program on ONE chosen stage
      (Foothill = mlp_a / Range = mlp_b), record the submission, and return that
      stage's result (+ grid to cache). Foothill & Range share the BOT_CAP pool. */
    submitBot: (
        prog: BotProgram,
        stage: "mlp_a" | "mlp_b"
    ) => Promise<StageSubmitResult>;
    /** P4 sandbox: run a card program on the Bowl (no submission, no board). */
    botSandbox: (prog: BotProgram) => Promise<StageRunResult>;
    /** the Bowl loss grid for the P4 terrain render (reconstructed client-side). */
    bowlGrid: () => BowlGrid;
    /** a scored stage's loss grid for the P4 terrain render — Bowl is derived
      client-side, the MLP stages are fetched (and cached) once revealed. */
    getTerrain: (stage: StageId) => Promise<BowlGrid>;
    /** P5 "Neuron": submit a `{ axes, arch, weights }` payload (stage-1 single
      neuron or stage-2 trained MLP), scored on the chosen axes. */
    submitP5Net: (sub: P5NetSubmission) => Promise<P5NetResult>;
    /** P5 stage-2 engine: a NetEngine trained on the chosen axes (its own frame),
      kept separate from the MLP playground's engine. Recreated on an axis change. */
    createP5NetEngine: (
        axes: [FeatureKey, FeatureKey],
        arch: NetArchConfig,
        lr: number,
        points?: DataPoint[]
    ) => NetEngine;
    /** MLP playground engine: a NetEngine trained in-browser on the CANONICAL axes.
      Purely client-side — the playground never submits for scoring. */
    createNetEngine: (
        arch: NetArchConfig,
        act: Activation,
        lr: number
    ) => NetEngine;
    /** loss → color on the landscape's ramp (bounds are public, labels are not). */
    lossColor: (L: number, alpha?: number) => string;

    /* ---- multiplayer session plumbing ---- */
    /** POST /join — enter as (team, name); sets the service's bearer token.
      Re-entering the same (team, name) resumes that session. */
    join: (team: number, name: string) => Promise<JoinResult>;
    /** restore a token from client storage (localStorage convenience). */
    setToken: (token: string) => void;
}

let singleton: WorkshopDataService | null = null;

/** The live backend service (HttpDataService → createServerFn → Prisma/SQLite).
    Built lazily on first use and cached for the app lifetime. */
export function getWorkshopService(): WorkshopDataService {
    if (!singleton) singleton = new HttpDataService();
    return singleton;
}
