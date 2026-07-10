/* Stage-1 "one neuron" math for Phase 5. A single sigmoid unit over two z-scored
   inputs: p = σ(w1·x_z + w2·y_z + b). Pure and serializable — no NetEngine, no
   refs. `singleNeuronView` adapts it to the shared NetView the draw code takes, so
   the same network diagram + heatmap render whether stage 1 (hand-tuned) or
   stage 2 (trained) produced the weights.

   Weight layout note (§8 gotcha): a NetEngine of sizes [2, 1] serializes as
   all-W-then-all-b = [w1, w2, b], so the stage-1 submission weights array is
   exactly [w1, w2, b] and the server's buildForward reads it identically. */

import type { NetView } from "./mlp";
import type { TrainFrame } from "./lossgrid";

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** A NetView for a single sigmoid neuron with weights (w1, w2) + bias b over the
    frame's z-scored axes. sizes = [2, 1]; valueAt('out', …) = σ(z) at the z-scored
    (rawx, rawy) — any other key falls back to the output (there are no hidden
    neurons). */
export function singleNeuronView(
    frame: TrainFrame,
    w1: number,
    w2: number,
    b: number
): NetView {
    const zs = frame.zStats;
    return {
        sizes: [2, 1],
        // W[layer][out][in]: one output neuron reading the two inputs.
        weights: [[[w1, w2]]],
        biases: [[b]],
        stats: zs,
        valueAt: (_key, rawx, rawy) => {
            const xz = (rawx - zs.mx) / zs.sx;
            const yz = (rawy - zs.my) / zs.sy;
            return sigmoid(w1 * xz + w2 * yz + b);
        },
    };
}

/** Mean binary-cross-entropy of the neuron over the frame's known-label training
    set. Uses the same clamped log form as NetEngine.trainStep, so the loss the
    student watches fall reads on the same scale as a trained net's. At (0,0,0) the
    neuron outputs 0.5 for every point ⇒ BCE = ln 2 ≈ 0.693 (the starting beat). */
export function neuronBce(
    frame: TrainFrame,
    w1: number,
    w2: number,
    b: number
): number {
    const D = frame.trainZ;
    if (!D.length) return 0;
    let loss = 0;
    for (const p of D) {
        const o = sigmoid(w1 * p.x + w2 * p.y + b);
        const t = p.s > 0 ? 1 : 0;
        loss += -(t * Math.log(o + 1e-12) + (1 - t) * Math.log(1 - o + 1e-12));
    }
    return loss / D.length;
}

/** Accuracy of the neuron over the frame's known-label training set, as a
    one-decimal percentage (the same scale as NetEngine.accuracyOn — the live
    column of the P3-style readout). */
export function neuronAccuracy(
    frame: TrainFrame,
    w1: number,
    w2: number,
    b: number
): number {
    const D = frame.trainZ;
    if (!D.length) return 0;
    let ok = 0;
    for (const p of D) {
        const o = sigmoid(w1 * p.x + w2 * p.y + b);
        if ((o > 0.5 ? 1 : 0) === (p.s > 0 ? 1 : 0)) ok++;
    }
    return Math.round((ok / D.length) * 1000) / 10;
}

/** Every known-label point's pre-activation z = w1·x_z + w2·y_z + b and its class,
    feeding the sigmoid-expand plot: each point is drawn at (z, σ(z)) in its class
    color, so dragging the sliders visibly pushes the two classes to opposite ends
    of the S-curve. */
export function neuronPointZs(
    frame: TrainFrame,
    w1: number,
    w2: number,
    b: number
): { z: number; cls: 0 | 1 }[] {
    return frame.trainZ.map((p) => {
        const cls: 0 | 1 = p.s > 0 ? 1 : 0;
        return { z: w1 * p.x + w2 * p.y + b, cls };
    });
}
