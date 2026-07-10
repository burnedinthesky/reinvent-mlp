/* Typed message protocol between the P6 UI (main thread) and the training Web
   Worker. The worker owns the dataset tensors + the MlpNet + the training loop;
   the main thread only sends control messages and receives cheap metrics plus
   throttled viz snapshots. Keeping this union in one file is the contract both
   sides import. */

import type { DatasetId, PackedDataset } from "./dataset";
import type { P6Activation } from "./net";
import type { PresetKey } from "./presets";

export interface HyperOpts {
    lr: number;
    momentum: number;
    batchSize: number;
    act: P6Activation;
    lrDecay: boolean;
}

/** one layer block for the diagram: input, hidden×N, output. */
export interface LayerMeta {
    type: "input" | "hidden" | "output";
    size: number;
}

/* ----------------------------------------------------- main → worker.
   `init`/`setDataset` carry the decoded PackedDataset (data+labels buffers
   transferred) — the main thread decodes since a worker's OffscreenCanvas reads
   back all-zeros. */
export type ToWorker =
    | {
          type: "init";
          packed: PackedDataset;
          preset: PresetKey;
          opts: HyperOpts;
          seed: number;
      }
    | { type: "start" }
    | { type: "pause" }
    | { type: "step" } // advance one tick then pause
    | { type: "reset"; seed: number } // re-init weights, same dataset/arch
    | { type: "setArch"; preset: PresetKey; opts: HyperOpts; seed: number }
    | {
          type: "setDataset";
          packed: PackedDataset;
          preset: PresetKey;
          opts: HyperOpts;
          seed: number;
      }
    | { type: "setOpts"; opts: HyperOpts } // live lr/batch/momentum/act
    | { type: "setInput"; index: number }
    | { type: "reqWeights"; layer: number; neuron: number };

/* ----------------------------------------------------- worker → main */
export interface ReadyInfo {
    dataset: DatasetId;
    trainN: number;
    valN: number;
    tile: number;
    depth: number;
    inputDim: number;
    classNames: string[];
    layers: LayerMeta[];
    firstVal: number;
}

/** activations for the current input image, one array per layer (input first,
    softmax last). `input` is the displayable image (0..1, mean added back). */
export interface Snapshot {
    inputIndex: number;
    label: number;
    input: Float32Array;
    acts: Float32Array[]; // acts[0] = input, acts[L] = probs
    probs: Float32Array;
}

export interface WeightsMsg {
    layer: number;
    neuron: number;
    row: Float32Array;
    tile: number;
    depth: number;
}

export type FromWorker =
    | { type: "ready"; info: ReadyInfo }
    | {
          type: "metrics";
          step: number;
          loss: number;
          acc: number;
          valAcc: number | null;
      }
    | { type: "snapshot"; snapshot: Snapshot }
    | { type: "weights"; weights: WeightsMsg }
    | { type: "loading"; dataset: DatasetId }
    | { type: "error"; message: string };
