/* Logistic-loss landscape over the canonical (w, b) plane, ported from the
   prototype's buildLossGrid. Standardizes the two canonical features, then
   precomputes a 201×201 loss grid. Lives server-side conceptually (P3 fog
   queries and P4 bot sims read it; clients only get loss numbers back). */

import { CANONICAL_X, CANONICAL_Y } from "./features";
import { lossRamp } from "./theme";
import type { DataPoint, FeatureKey } from "./types";

export interface ZStats {
    mx: number;
    my: number;
    sx: number;
    sy: number;
}

/** Standardization stats (mean/std of two chosen features) over the given points.
    Callers pass the training slice (non-hidden). The axis keys default to the
    canonical pair so every existing caller (LossLandscape, the P3 client) keeps
    working unchanged; P5 passes its dock-chosen axes. Needs features only, never
    labels, so the client can reconstruct it exactly (the parity seam). */
export function zStatsOf(
    points: DataPoint[],
    xKey: FeatureKey = CANONICAL_X,
    yKey: FeatureKey = CANONICAL_Y
): ZStats {
    const mean = (a: number[]) =>
        a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const xs = points.map((p) => p.feats[xKey]);
    const ys = points.map((p) => p.feats[yKey]);
    const mx = mean(xs);
    const my = mean(ys);
    const sx = Math.sqrt(mean(xs.map((v) => (v - mx) * (v - mx)))) || 1;
    const sy = Math.sqrt(mean(ys.map((v) => (v - my) * (v - my)))) || 1;
    return { mx, my, sx, sy };
}

export interface TrainZPoint {
    x: number;
    y: number;
    /** sign target: +1 owl, -1 early. */
    s: number;
}

/** A training frame over two chosen axes — the parity seam shared by the client
    NetEngine / stage-1 neuron math and the server scorer. `zStats` is computed
    over ALL non-hidden points (label-free, so it matches the server exactly);
    `trainZ` is the z-scored known-label subset the gradient descent trains on
    (dropping unlabeled points avoids the `label === 1 ? … : -1` undefined trap). */
export interface TrainFrame {
    xKey: FeatureKey;
    yKey: FeatureKey;
    zStats: ZStats;
    trainZ: TrainZPoint[];
}

/** Build a TrainFrame over the chosen axes. zStats over every non-hidden point
    (matches the server's `store.points.filter(p => !p.hidden)`); trainZ only over
    non-hidden points whose label is known. */
export function trainFrameOf(
    points: DataPoint[],
    xKey: FeatureKey = CANONICAL_X,
    yKey: FeatureKey = CANONICAL_Y
): TrainFrame {
    const visible = points.filter((p) => !p.hidden);
    const zStats = zStatsOf(visible, xKey, yKey);
    const { mx, my, sx, sy } = zStats;
    const trainZ = visible
        .filter((p) => p.label === 0 || p.label === 1)
        .map((p) => ({
            x: (p.feats[xKey] - mx) / sx,
            y: (p.feats[yKey] - my) / sy,
            s: p.label === 1 ? 1 : -1,
        }));
    return { xKey, yKey, zStats, trainZ };
}

const GN = 201;

export class LossLandscape {
    readonly GN = GN;
    readonly grid: Float32Array;
    readonly gMin: number;
    readonly gMax: number;
    readonly bStar: number;
    readonly zStats: ZStats;
    readonly trainZ: TrainZPoint[];

    constructor(points: DataPoint[]) {
        const tr = points.filter((p) => !p.hidden);
        const { mx, my, sx, sy } = zStatsOf(tr);
        this.zStats = { mx, my, sx, sy };
        this.trainZ = tr.map((p) => ({
            x: (p.feats[CANONICAL_X] - mx) / sx,
            y: (p.feats[CANONICAL_Y] - my) / sy,
            s: p.label === 1 ? 1 : -1,
        }));

        const N = GN;
        const grid = new Float32Array(N * N);
        let mn = Infinity;
        let mxv = -Infinity;
        let am = 0;
        for (let bi = 0; bi < N; bi++) {
            const b = -4 + (8 * bi) / (N - 1);
            for (let wi = 0; wi < N; wi++) {
                const w = -4 + (8 * wi) / (N - 1);
                let L = 0;
                for (const p of this.trainZ) {
                    const m = p.s * (p.y - (w * p.x + b));
                    L += m > 30 ? 0 : m < -30 ? -m : Math.log(1 + Math.exp(-m));
                }
                L /= this.trainZ.length;
                const idx = bi * N + wi;
                grid[idx] = L;
                if (L < mn) {
                    mn = L;
                    am = idx;
                }
                if (L > mxv) mxv = L;
            }
        }
        this.grid = grid;
        this.gMin = mn;
        this.gMax = mxv;
        this.bStar = -4 + (8 * Math.floor(am / N)) / (N - 1);
    }

    clampG(v: number): number {
        return Math.max(-4, Math.min(4, v));
    }

    lossAt(w: number, b: number): number {
        const N = this.GN;
        const wi = Math.round(((this.clampG(w) + 4) / 8) * (N - 1));
        const bi = Math.round(((this.clampG(b) + 4) / 8) * (N - 1));
        return this.grid[bi * N + wi];
    }
}

/** loss → color on the shared lime magnitude ramp (low loss = hot lime). */
export function lossColor(
    L: number,
    gMin: number,
    gMax: number,
    alpha?: number
): string {
    const t = Math.sqrt(
        Math.max(0, Math.min(1, (L - gMin) / (gMax - gMin || 1)))
    );
    return lossRamp(t, alpha == null ? 1 : alpha);
}
