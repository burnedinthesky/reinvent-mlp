/* MlpNetClient — the main-thread proxy around the training Web Worker. The React
   phase component holds ONE of these in a ref (like the MLP playground's netEngineRef) and never
   touches MlpNet/Worker directly, so the whole training seam stays swappable.
   It buffers loss/accuracy history + the latest metrics/snapshot, and fires a
   single `onEvent` callback the component uses to schedule repaints. */

import { loadPacked } from "./dataset";
import type { DatasetId, PackedDataset } from "./dataset";
import { DEFAULT_TRAIN } from "./presets";
import type { PresetKey, TrainOpts } from "./presets";
import type {
    FromWorker,
    HyperOpts,
    ReadyInfo,
    Snapshot,
    WeightsMsg,
} from "./protocol";

export type ClientEvent = FromWorker["type"];

const HIST_CAP = 4000;

export class MlpNetClient {
    private worker: Worker;
    private seed = 20260709;

    lossHist: number[] = [];
    accHist: number[] = [];
    step = 0;
    loss = 0;
    acc = 0;
    valAcc: number | null = null;
    ready: ReadyInfo | null = null;
    snapshot: Snapshot | null = null;
    loadingDataset: DatasetId | null = null;
    lastError: string | null = null;
    /** cache of hover weight-templates, keyed `layer:neuron`; cleared on reset. */
    weights = new Map<string, WeightsMsg>();

    /** the component sets this to be told when state changed (schedule a repaint). */
    onEvent: ((ev: ClientEvent) => void) | null = null;

    /** decoded datasets, cached so re-selecting one doesn't re-decode. */
    private packedCache = new Map<DatasetId, PackedDataset>();

    constructor() {
        this.worker = new Worker(
            new URL("./trainer.worker.ts", import.meta.url),
            {
                type: "module",
            }
        );
        this.worker.onmessage = (e: MessageEvent<FromWorker>) =>
            this.handle(e.data);
    }

    private handle(m: FromWorker) {
        switch (m.type) {
            case "ready":
                this.ready = m.info;
                this.loadingDataset = null;
                this.weights.clear();
                break;
            case "loading":
                this.loadingDataset = m.dataset;
                break;
            case "metrics":
                this.step = m.step;
                this.loss = m.loss;
                this.acc = m.acc;
                this.valAcc = m.valAcc;
                if (m.step > 0) {
                    this.lossHist.push(m.loss);
                    this.accHist.push(m.acc);
                    if (this.lossHist.length > HIST_CAP) {
                        this.lossHist.splice(0, HIST_CAP / 2);
                        this.accHist.splice(0, HIST_CAP / 2);
                    }
                }
                break;
            case "snapshot":
                this.snapshot = m.snapshot;
                break;
            case "weights":
                this.weights.set(
                    `${m.weights.layer}:${m.weights.neuron}`,
                    m.weights
                );
                break;
            case "error":
                this.lastError = m.message;
                break;
        }
        this.onEvent?.(m.type);
    }

    private hyper(opts: TrainOpts): HyperOpts {
        return {
            lr: opts.lr,
            momentum: opts.momentum,
            batchSize: opts.batchSize,
            act: opts.act,
            lrDecay: opts.lrDecay,
        };
    }

    private clearHist() {
        this.lossHist = [];
        this.accHist = [];
        this.step = 0;
        this.loss = 0;
        this.acc = 0;
        this.valAcc = null;
    }

    /** decode a dataset on the main thread (cached), where canvas read-back works. */
    private async getPacked(id: DatasetId): Promise<PackedDataset> {
        let p = this.packedCache.get(id);
        if (!p) {
            p = await loadPacked(id);
            this.packedCache.set(id, p);
        }
        return p;
    }

    /** decode (if needed) then hand the dataset to the worker. Sends 'loading' so
      the UI can show a spinner during first decode. Posts a clone (no transfer)
      so the main-thread cache stays usable for re-selection. */
    private async send(
        type: "init" | "setDataset",
        dataset: DatasetId,
        preset: PresetKey,
        opts: TrainOpts
    ) {
        this.clearHist();
        this.weights.clear();
        this.loadingDataset = dataset;
        this.onEvent?.("loading");
        try {
            const packed = await this.getPacked(dataset);
            this.worker.postMessage({
                type,
                packed,
                preset,
                opts: this.hyper(opts),
                seed: this.seed,
            });
        } catch (e) {
            this.lastError = e instanceof Error ? e.message : String(e);
            this.onEvent?.("error");
        }
    }

    init(
        dataset: DatasetId,
        preset: PresetKey,
        opts: TrainOpts = DEFAULT_TRAIN
    ) {
        void this.send("init", dataset, preset, opts);
    }

    setDataset(dataset: DatasetId, preset: PresetKey, opts: TrainOpts) {
        void this.send("setDataset", dataset, preset, opts);
    }

    setArch(preset: PresetKey, opts: TrainOpts) {
        this.clearHist();
        this.weights.clear();
        this.worker.postMessage({
            type: "setArch",
            preset,
            opts: this.hyper(opts),
            seed: this.seed,
        });
    }

    setOpts(opts: TrainOpts) {
        this.worker.postMessage({ type: "setOpts", opts: this.hyper(opts) });
    }

    reset() {
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
        this.clearHist();
        this.weights.clear();
        this.worker.postMessage({ type: "reset", seed: this.seed });
    }

    start() {
        this.worker.postMessage({ type: "start" });
    }
    pause() {
        this.worker.postMessage({ type: "pause" });
    }
    stepOnce() {
        this.worker.postMessage({ type: "step" });
    }
    setInput(index: number) {
        this.worker.postMessage({ type: "setInput", index });
    }
    reqWeights(layer: number, neuron: number) {
        if (this.weights.has(`${layer}:${neuron}`)) return;
        this.worker.postMessage({ type: "reqWeights", layer, neuron });
    }

    dispose() {
        this.worker.terminate();
    }
}
