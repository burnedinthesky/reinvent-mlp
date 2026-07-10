/* P6 dense-MLP engine tests. The gradient checks are the linchpin: for a
   hand-rolled backprop we validate the analytic gradients against central-
   difference numeric gradients (rel-err < 1e-4), rather than trusting that a
   falling loss curve means the maths is right. Plus shape, determinism, softmax,
   and overfit-a-tiny-batch sanity. */

import { describe, expect, it } from "vitest";

import { argmax, MlpNet } from "../net";
import type { MlpArch, P6Activation } from "../net";

function seededInputs(n: number, dim: number, seed: number): Float32Array[] {
    let s = seed >>> 0;
    const rnd = () => {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;
        s >>>= 0;
        return s / 4294967296;
    };
    return Array.from({ length: n }, () => {
        const x = new Float32Array(dim);
        for (let i = 0; i < dim; i++) x[i] = rnd() * 2 - 1;
        return x;
    });
}

// Full-float64 forward loss reading the net's (Float32) weights. The net's own
// forward() truncates activations/probs to Float32, which caps finite-difference
// accuracy at ~1e-3; recomputing the reference loss in float64 lets the numeric
// gradient reach the net's analytic gradient to ~1e-5 without hiding real bugs.
function refLoss(
    net: MlpNet,
    x: Float32Array,
    y: number,
    act: P6Activation
): number {
    let a: number[] = Array.from(x);
    const L = net.layers.length;
    for (let l = 0; l < L; l++) {
        const ly = net.layers[l];
        const last = l === L - 1;
        const z: number[] = new Array(ly.outDim);
        for (let o = 0; o < ly.outDim; o++) {
            let acc = ly.b[o];
            const base = o * ly.inDim;
            for (let i = 0; i < ly.inDim; i++) acc += ly.W[base + i] * a[i];
            z[o] = acc;
        }
        if (last) {
            let mx = -Infinity;
            for (const v of z) if (v > mx) mx = v;
            let s = 0;
            const e = z.map((v) => {
                const ev = Math.exp(v - mx);
                s += ev;
                return ev;
            });
            a = e.map((ev) => ev / s);
        } else {
            a = z.map((v) =>
                act === "relu"
                    ? Math.max(0, v)
                    : act === "sigmoid"
                      ? 1 / (1 + Math.exp(-v))
                      : Math.tanh(v)
            );
        }
    }
    return -Math.log(Math.max(a[y], 1e-12));
}

// central-difference numeric gradient of the batch loss wrt a single scalar.
function numericGrad(
    net: MlpNet,
    xs: Float32Array[],
    ys: number[],
    act: P6Activation,
    read: () => number,
    write: (v: number) => void
): number {
    const eps = 1e-3;
    const base = read();
    write(base + eps);
    let lp = 0;
    for (let n = 0; n < xs.length; n++) lp += refLoss(net, xs[n], ys[n], act);
    write(base - eps);
    let lm = 0;
    for (let n = 0; n < xs.length; n++) lm += refLoss(net, xs[n], ys[n], act);
    write(base);
    return (lp - lm) / (2 * eps);
}

function gradCheck(arch: MlpArch, act: P6Activation) {
    const net = new MlpNet(arch, 12345);
    net.setActivation(act);
    const xs = seededInputs(4, arch.inputDim, 777);
    const ys = [0, 1, 2, 1].map((y) => y % arch.classes);
    const { grads } = net.gradients(xs, ys);

    let worst = 0;
    // check every weight + bias in every layer against numeric grad.
    net.layers.forEach((ly, l) => {
        for (let i = 0; i < ly.W.length; i++) {
            const analytic = grads.gW[l][i];
            const numeric = numericGrad(
                net,
                xs,
                ys,
                act,
                () => ly.W[i],
                (v) => {
                    ly.W[i] = v;
                }
            );
            const denom = Math.max(
                1e-6,
                Math.abs(analytic) + Math.abs(numeric)
            );
            worst = Math.max(worst, Math.abs(analytic - numeric) / denom);
        }
        for (let o = 0; o < ly.b.length; o++) {
            const analytic = grads.gb[l][o];
            const numeric = numericGrad(
                net,
                xs,
                ys,
                act,
                () => ly.b[o],
                (v) => {
                    ly.b[o] = v;
                }
            );
            const denom = Math.max(
                1e-6,
                Math.abs(analytic) + Math.abs(numeric)
            );
            worst = Math.max(worst, Math.abs(analytic - numeric) / denom);
        }
    });
    return worst;
}

describe("MlpNet gradient checks", () => {
    it("relu, single hidden layer matches numeric gradient", () => {
        const worst = gradCheck(
            { inputDim: 6, hidden: [5], classes: 3 },
            "relu"
        );
        expect(worst).toBeLessThan(1e-4);
    });
    it("tanh, single hidden layer matches numeric gradient", () => {
        const worst = gradCheck(
            { inputDim: 6, hidden: [5], classes: 3 },
            "tanh"
        );
        expect(worst).toBeLessThan(1e-4);
    });
    it("sigmoid, single hidden layer matches numeric gradient", () => {
        const worst = gradCheck(
            { inputDim: 6, hidden: [5], classes: 3 },
            "sigmoid"
        );
        expect(worst).toBeLessThan(1e-4);
    });
    it("two hidden layers (sigmoid) match numeric gradient", () => {
        const worst = gradCheck(
            { inputDim: 7, hidden: [6, 4], classes: 3 },
            "sigmoid"
        );
        expect(worst).toBeLessThan(1e-4);
    });
    it("two hidden layers (relu) match numeric gradient", () => {
        const worst = gradCheck(
            { inputDim: 7, hidden: [6, 4], classes: 3 },
            "relu"
        );
        expect(worst).toBeLessThan(1e-4);
    });
    it("bare softmax classifier matches numeric gradient", () => {
        const worst = gradCheck(
            { inputDim: 5, hidden: [], classes: 4 },
            "relu"
        );
        expect(worst).toBeLessThan(1e-4);
    });
});

describe("MlpNet shapes & softmax", () => {
    it("forward returns per-layer activations with a normalized softmax head", () => {
        const net = new MlpNet({ inputDim: 8, hidden: [5, 3], classes: 4 }, 1);
        const { zs, as } = net.forward(seededInputs(1, 8, 3)[0]);
        expect(zs).toHaveLength(3); // 3 fc layers
        expect(as).toHaveLength(4); // input + 3
        expect(as[0]).toHaveLength(8);
        expect(as[3]).toHaveLength(4);
        const sum = as[3].reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 5);
        as[3].forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    });
    it("is deterministic for a fixed seed", () => {
        const a = new MlpNet({ inputDim: 6, hidden: [4], classes: 3 }, 42);
        const b = new MlpNet({ inputDim: 6, hidden: [4], classes: 3 }, 42);
        const x = seededInputs(1, 6, 9)[0];
        expect(Array.from(a.predictProbs(x))).toEqual(
            Array.from(b.predictProbs(x))
        );
    });
    it("weightsInto returns an input-shaped row for the first hidden layer", () => {
        const net = new MlpNet({ inputDim: 784, hidden: [64], classes: 10 }, 1);
        expect(net.weightsInto(0, 7)).toHaveLength(784);
    });
});

describe("MlpNet training", () => {
    it("softmax cross-entropy loss decreases monotonically on a fixed batch", () => {
        const net = new MlpNet({ inputDim: 10, hidden: [8], classes: 4 }, 5);
        const xs = seededInputs(16, 10, 111);
        const ys = xs.map((_, i) => i % 4);
        let prev = Infinity;
        for (let step = 0; step < 40; step++) {
            const { loss } = net.trainBatch(xs, ys, 0.1, 0.9);
            expect(loss).toBeLessThanOrEqual(prev + 1e-6);
            prev = loss;
        }
    });
    it("overfits a tiny batch to ~100% accuracy", () => {
        const net = new MlpNet({ inputDim: 12, hidden: [16], classes: 3 }, 7);
        const xs = seededInputs(20, 12, 222);
        const ys = xs.map((_, i) => i % 3);
        let acc = 0;
        for (let step = 0; step < 300; step++)
            acc = net.trainBatch(xs, ys, 0.1, 0.9).acc;
        expect(acc).toBeGreaterThan(0.95);
        // and predictions agree with the trained argmax
        const preds = xs.map((x) => argmax(net.predictProbs(x)));
        const correct = preds.filter((p, i) => p === ys[i]).length;
        expect(correct / xs.length).toBeGreaterThan(0.95);
    });
});
