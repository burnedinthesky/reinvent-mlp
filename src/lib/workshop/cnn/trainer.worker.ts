/* P6 training Web Worker. Owns the dataset tensors, the MlpNet, and a
   self-scheduling mini-batch training loop. Posts cheap metrics every tick and a
   throttled viz snapshot (activations for the current input) so the main thread
   never runs the heavy maths. All net access goes through here — the UI only
   talks to MlpNetClient. */

/// <reference lib="webworker" />

import { wrapPacked } from "./dataset";
import type { LoadedDataset } from "./dataset";
import { MlpNet } from "./net";
import { archFor } from "./presets";
import type { PresetKey } from "./presets";
import type { HyperOpts, FromWorker, ToWorker } from "./protocol";

const TICK_MS = 33;
const BATCHES_PER_TICK = 3;
const SNAPSHOT_EVERY = 6; // ticks
const VAL_EVERY = 18; // ticks
const VAL_SAMPLE = 500;
// LR-decay schedule: when enabled, the effective lr halves every DECAY_STEPS and
// is floored at DECAY_FLOOR·lr₀, so training anneals visibly over ~seconds.
const DECAY_STEPS = 1200;
const DECAY_FLOOR = 0.2;

let ds: LoadedDataset | null = null;
let net: MlpNet | null = null;
let presetKey: PresetKey = "h64";
let opts: HyperOpts = {
    lr: 0.05,
    momentum: 0.9,
    batchSize: 16,
    act: "relu",
    lrDecay: false,
};
let running = false;
let step = 0;
let curInput = 0;
let tick = 0;
let lastValAcc: number | null = null;
// running metric estimates (EMA) so the readout is smooth between ticks.
let emaLoss = 0;
let emaAcc = 0;
let rngState = 12345;
let timer: ReturnType<typeof setInterval> | null = null;

function post(msg: FromWorker, transfer?: Transferable[]) {
    (self as unknown as Worker).postMessage(msg, transfer ?? []);
}

function rnd(): number {
    rngState ^= rngState << 13;
    rngState >>>= 0;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    rngState >>>= 0;
    return rngState / 4294967296;
}

function buildNet(seed: number) {
    if (!ds) return;
    net = new MlpNet(archFor(presetKey, ds.inputDim), seed);
    net.setActivation(opts.act);
    step = 0;
    tick = 0;
    emaLoss = 0;
    emaAcc = 0;
    lastValAcc = null;
}

/** current learning rate, annealed by step when decay is enabled. */
function effectiveLr(): number {
    if (!opts.lrDecay) return opts.lr;
    return opts.lr * Math.max(DECAY_FLOOR, Math.pow(0.5, step / DECAY_STEPS));
}

function trainOneTick() {
    if (!net || !ds) return;
    const bs = opts.batchSize;
    for (let b = 0; b < BATCHES_PER_TICK; b++) {
        const xs: Float32Array[] = [];
        const ys: number[] = [];
        for (let i = 0; i < bs; i++) {
            const idx = Math.floor(rnd() * ds.trainN);
            const s = ds.get(idx);
            xs.push(s.data);
            ys.push(s.label);
        }
        const r = net.trainBatch(xs, ys, effectiveLr(), opts.momentum);
        emaLoss = emaLoss === 0 ? r.loss : emaLoss * 0.9 + r.loss * 0.1;
        emaAcc = emaAcc === 0 ? r.acc : emaAcc * 0.9 + r.acc * 0.1;
        step++;
    }
}

function valAccuracy(): number {
    if (!net || !ds) return 0;
    let ok = 0;
    const n = Math.min(VAL_SAMPLE, ds.valN);
    for (let i = 0; i < n; i++) {
        const s = ds.get(ds.trainN + i);
        if (net.predict(s.data) === s.label) ok++;
    }
    return n ? ok / n : 0;
}

function sendSnapshot() {
    if (!net || !ds) return;
    const s = ds.get(curInput);
    const { as } = net.forward(s.data);
    const probs = as[as.length - 1];
    // reconstruct a displayable image (add per-channel mean back is unavailable
    // here; the mean-subtracted data still renders fine once paintVol normalizes).
    post({
        type: "snapshot",
        snapshot: {
            inputIndex: curInput,
            label: s.label,
            input: s.data,
            acts: as,
            probs,
        },
    });
}

function loop() {
    if (!running) return;
    trainOneTick();
    tick++;
    if (tick % VAL_EVERY === 0) lastValAcc = valAccuracy();
    post({
        type: "metrics",
        step,
        loss: emaLoss,
        acc: emaAcc,
        valAcc: lastValAcc,
    });
    if (tick % SNAPSHOT_EVERY === 0) sendSnapshot();
}

function startTimer() {
    if (timer != null) return;
    timer = setInterval(loop, TICK_MS);
}
function stopTimer() {
    if (timer != null) {
        clearInterval(timer);
        timer = null;
    }
}

function ready() {
    if (!ds || !net) return;
    post({
        type: "ready",
        info: {
            dataset: ds.id,
            trainN: ds.trainN,
            valN: ds.valN,
            tile: ds.tile,
            depth: ds.depth,
            inputDim: ds.inputDim,
            classNames: ds.classNames,
            layers: net.layerSummary(),
            firstVal: ds.firstVal,
        },
    });
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
    const m = ev.data;
    try {
        switch (m.type) {
            case "init":
            case "setDataset": {
                running = false;
                stopTimer();
                presetKey = m.preset;
                opts = m.opts;
                ds = wrapPacked(m.packed);
                curInput = ds.firstVal;
                buildNet(m.seed);
                ready();
                sendSnapshot();
                break;
            }
            case "setArch": {
                presetKey = m.preset;
                opts = m.opts;
                buildNet(m.seed);
                ready();
                sendSnapshot();
                break;
            }
            case "reset": {
                buildNet(m.seed);
                post({
                    type: "metrics",
                    step: 0,
                    loss: 0,
                    acc: 0,
                    valAcc: null,
                });
                sendSnapshot();
                break;
            }
            case "setOpts": {
                opts = m.opts;
                net?.setActivation(opts.act);
                break;
            }
            case "setInput": {
                curInput = m.index;
                sendSnapshot();
                break;
            }
            case "reqWeights": {
                if (!net || !ds) break;
                post({
                    type: "weights",
                    weights: {
                        layer: m.layer,
                        neuron: m.neuron,
                        row: net.weightsInto(m.layer, m.neuron),
                        tile: ds.tile,
                        depth: ds.depth,
                    },
                });
                break;
            }
            case "start": {
                running = true;
                startTimer();
                break;
            }
            case "pause": {
                running = false;
                stopTimer();
                break;
            }
            case "step": {
                running = false;
                stopTimer();
                loopOnce();
                break;
            }
        }
    } catch (e) {
        post({
            type: "error",
            message: e instanceof Error ? e.message : String(e),
        });
    }
};

function loopOnce() {
    trainOneTick();
    tick++;
    lastValAcc = valAccuracy();
    post({
        type: "metrics",
        step,
        loss: emaLoss,
        acc: emaAcc,
        valAcc: lastValAcc,
    });
    sendSnapshot();
}
