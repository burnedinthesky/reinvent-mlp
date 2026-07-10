/* Hand-rolled MLP (2 inputs → 0-2 hidden layers → 1 sigmoid), full-batch GD with
   BCE loss. Ported from the prototype's initNet / netForward / trainStep. Wrapped
   in a NetEngine that also owns the standardization stats and loss history so it
   survives component remounts when held in a ref. */

import type { TrainFrame, TrainZPoint, ZStats } from "./lossgrid";
import type { DataPoint, FeatureKey, NetArch } from "./types";

export type Activation = "tanh" | "relu" | "sigmoid";

interface Net {
    sizes: number[];
    W: number[][][];
    b: number[][];
    step: number;
}

export interface NetArchConfig {
    layers: number;
    n1: number;
    n2: number;
}

/** The read-only view the shared draw code needs — sizes, weights/biases, the
    standardization stats, and a value-at sampler. NetEngine (stage 2) and the
    stage-1 singleNeuronView both satisfy this, so draw/network.ts + draw/p5main.ts
    take a NetView and don't care which produced it. */
export interface NetView {
    sizes: number[];
    weights: number[][][];
    biases: number[][];
    stats: ZStats;
    valueAt: (key: string, rawx: number, rawy: number) => number;
}

const NET_SEED = 20260706;

export class NetEngine implements NetView {
    private net: Net;
    private seedCounter = 0;
    private readonly zStats: ZStats;
    private readonly trainZ: TrainZPoint[];
    private readonly xKey: FeatureKey;
    private readonly yKey: FeatureKey;
    lossHist: number[] = [];

    constructor(
        frame: TrainFrame,
        private readonly points: DataPoint[],
        arch: NetArchConfig,
        public act: Activation = "tanh",
        public lr = 0.1
    ) {
        this.zStats = frame.zStats;
        this.trainZ = frame.trainZ;
        this.xKey = frame.xKey;
        this.yKey = frame.yKey;
        this.net = this.build(arch);
    }

    private build(arch: NetArchConfig): Net {
        const sizes = [2];
        if (arch.layers >= 1) sizes.push(arch.n1);
        if (arch.layers >= 2) sizes.push(arch.n2);
        sizes.push(1);
        this.seedCounter += 1;
        let s = (NET_SEED + this.seedCounter * 99991) >>> 0;
        const rnd = () => {
            s ^= s << 13;
            s >>>= 0;
            s ^= s >> 17;
            s ^= s << 5;
            s >>>= 0;
            return (s / 4294967296) * 2 - 1;
        };
        this.lossHist = [];
        return {
            sizes,
            W: sizes
                .slice(1)
                .map((no, li) =>
                    Array.from({ length: no }, () =>
                        Array.from({ length: sizes[li] }, () => rnd())
                    )
                ),
            b: sizes
                .slice(1)
                .map((no) => Array.from({ length: no }, () => rnd())),
            step: 0,
        };
    }

    /** re-draw random weights for a (possibly new) architecture. */
    reset(arch: NetArchConfig): void {
        this.net = this.build(arch);
    }

    get step(): number {
        return this.net.step;
    }
    get sizes(): number[] {
        return this.net.sizes;
    }
    get weights(): number[][][] {
        return this.net.W;
    }
    get biases(): number[][] {
        return this.net.b;
    }
    get lastLoss(): number | null {
        return this.lossHist.length
            ? this.lossHist[this.lossHist.length - 1]
            : null;
    }
    get stats(): ZStats {
        return this.zStats;
    }

    private actF(z: number): number {
        return this.act === "relu"
            ? z > 0
                ? z
                : 0
            : this.act === "sigmoid"
              ? 1 / (1 + Math.exp(-z))
              : Math.tanh(z);
    }
    private actD(z: number, a: number): number {
        return this.act === "relu"
            ? z > 0
                ? 1
                : 0
            : this.act === "sigmoid"
              ? a * (1 - a)
              : 1 - a * a;
    }

    forward(x0: number[]): number[][] {
        const net = this.net;
        let a = x0;
        const acts: number[][] = [];
        for (let l = 0; l < net.W.length; l++) {
            const last = l === net.W.length - 1;
            const out: number[] = [];
            for (let o = 0; o < net.W[l].length; o++) {
                let z = net.b[l][o];
                const row = net.W[l][o];
                for (let i = 0; i < row.length; i++) z += row[i] * a[i];
                out.push(last ? 1 / (1 + Math.exp(-z)) : this.actF(z));
            }
            acts.push(out);
            a = out;
        }
        return acts;
    }

    trainStep(): number {
        const net = this.net;
        const D = this.trainZ;
        const N = D.length;
        const lr = this.lr;
        const Lm = net.W.length;
        const gW = net.W.map((m) => m.map((r) => r.map(() => 0)));
        const gb = net.b.map((r) => r.map(() => 0));
        let loss = 0;
        for (let di = 0; di < N; di++) {
            const p = D[di];
            let a = [p.x, p.y];
            const as: number[][] = [a];
            const zs: number[][] = [];
            for (let l = 0; l < Lm; l++) {
                const last = l === Lm - 1;
                const zrow: number[] = [];
                const arow: number[] = [];
                for (let o = 0; o < net.W[l].length; o++) {
                    let z = net.b[l][o];
                    const row = net.W[l][o];
                    for (let i = 0; i < row.length; i++) z += row[i] * a[i];
                    zrow.push(z);
                    arow.push(last ? 1 / (1 + Math.exp(-z)) : this.actF(z));
                }
                zs.push(zrow);
                as.push(arow);
                a = arow;
            }
            const o = a[0];
            const t = p.s > 0 ? 1 : 0;
            loss += -(
                t * Math.log(o + 1e-12) +
                (1 - t) * Math.log(1 - o + 1e-12)
            );
            let delta = [o - t];
            for (let l = Lm - 1; l >= 0; l--) {
                const aPrev = as[l];
                for (let oi = 0; oi < delta.length; oi++) {
                    gb[l][oi] += delta[oi];
                    const gr = gW[l][oi];
                    for (let ii = 0; ii < aPrev.length; ii++)
                        gr[ii] += delta[oi] * aPrev[ii];
                }
                if (l > 0) {
                    const nd = new Array(aPrev.length).fill(0);
                    for (let ii = 0; ii < aPrev.length; ii++) {
                        let sum = 0;
                        for (let oi = 0; oi < delta.length; oi++)
                            sum += net.W[l][oi][ii] * delta[oi];
                        nd[ii] = sum * this.actD(zs[l - 1][ii], as[l][ii]);
                    }
                    delta = nd;
                }
            }
        }
        for (let l = 0; l < Lm; l++) {
            for (let o = 0; o < net.W[l].length; o++) {
                net.b[l][o] -= (lr * gb[l][o]) / N;
                for (let i = 0; i < net.W[l][o].length; i++)
                    net.W[l][o][i] -= (lr * gW[l][o][i]) / N;
            }
        }
        net.step++;
        const ml = loss / N;
        this.lossHist.push(ml);
        if (this.lossHist.length > 4000) this.lossHist.splice(0, 2000);
        return ml;
    }

    /** value in [0,1] for a heatmap cell: 'out' = P(owl), 'h<layer>-<idx>' = a
      neuron's normalized activation. Ported from p5ValAt. */
    valueAt(key: string, rawx: number, rawy: number): number {
        const zs = this.zStats;
        const acts = this.forward([
            (rawx - zs.mx) / zs.sx,
            (rawy - zs.my) / zs.sy,
        ]);
        if (key === "out") return acts[acts.length - 1][0];
        const m = /^h(\d+)-(\d+)$/.exec(key);
        if (!m) return acts[acts.length - 1][0];
        const a: number | undefined = (acts[+m[1]] as number[] | undefined)?.[
            +m[2]
        ];
        if (a == null) return acts[acts.length - 1][0];
        return this.act === "tanh"
            ? (a + 1) / 2
            : this.act === "sigmoid"
              ? a
              : Math.max(0, Math.min(1, a / 2));
    }

    /** accuracy over the filtered point set, forwarding on the frame's axes. Used
      for both the full-set judged mirror (filter = all) and the live known-set
      readout (filter = non-hidden known-label). Points without a label never
      count as correct (undefined !== 0/1). */
    accuracyOn(filter: (p: DataPoint) => boolean): number {
        const zs = this.zStats;
        const set = this.points.filter(filter);
        let ok = 0;
        set.forEach((p) => {
            const acts = this.forward([
                (p.feats[this.xKey] - zs.mx) / zs.sx,
                (p.feats[this.yKey] - zs.my) / zs.sy,
            ]);
            if ((acts[acts.length - 1][0] > 0.5 ? 1 : 0) === p.label) ok++;
        });
        return set.length ? Math.round((ok / set.length) * 1000) / 10 : 0;
    }

    /** accuracy on the full point set — the same metric the server judges for
      POST /submit/net (real + synthetic, revealed + hidden). */
    accuracyOnAll(): number {
        return this.accuracyOn(() => true);
    }

    serialize(): { arch: NetArch; weights: number[] } {
        const weights: number[] = [];
        this.net.W.forEach((m) =>
            m.forEach((r) => r.forEach((v) => weights.push(v)))
        );
        this.net.b.forEach((r) => r.forEach((v) => weights.push(v)));
        return { arch: { layers: this.net.sizes, act: this.act }, weights };
    }
}
