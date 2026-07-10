/* Architecture presets for the P6 playground. Each preset yields the hidden-layer
   widths for a given input dimension; the input/output sizes are fixed by the
   dataset (D = 784 or 3072) and the 10 classes. Constrained to teachable shapes:
   1 or 2 hidden layers, each independently 32 or 64 wide. Kept small so a dense
   net trains visibly in seconds on flattened pixels. */

import type { MlpArch, P6Activation } from "./net";

export type LayerCount = 1 | 2;
export type LayerWidth = 32 | 64;
export type PresetKey =
    "h32" | "h64" | "h32_32" | "h32_64" | "h64_32" | "h64_64";

export interface P6Preset {
    key: PresetKey;
    label: string;
    hidden: number[];
}

export const P6_PRESETS: Record<PresetKey, P6Preset> = {
    h32: { key: "h32", label: "32", hidden: [32] },
    h64: { key: "h64", label: "64", hidden: [64] },
    h32_32: { key: "h32_32", label: "32 → 32", hidden: [32, 32] },
    h32_64: { key: "h32_64", label: "32 → 64", hidden: [32, 64] },
    h64_32: { key: "h64_32", label: "64 → 32", hidden: [64, 32] },
    h64_64: { key: "h64_64", label: "64 → 64", hidden: [64, 64] },
};

export const PRESET_KEYS: PresetKey[] = [
    "h32",
    "h64",
    "h32_32",
    "h32_64",
    "h64_32",
    "h64_64",
];

/** map per-layer widths (1 or 2 of them) to a preset key. */
export function keyFor(widths: LayerWidth[]): PresetKey {
    return ("h" + widths.join("_")) as PresetKey;
}

/** inverse of keyFor: the per-layer widths for a preset key. */
export function widthsOf(key: PresetKey): LayerWidth[] {
    return P6_PRESETS[key].hidden as LayerWidth[];
}

export interface TrainOpts {
    lr: number;
    momentum: number;
    batchSize: number;
    act: P6Activation;
    /** anneal the learning rate over steps (see trainer.worker effectiveLr). */
    lrDecay: boolean;
}

export const DEFAULT_TRAIN: TrainOpts = {
    lr: 0.05,
    momentum: 0.9,
    batchSize: 16,
    act: "relu",
    lrDecay: false,
};

export function archFor(
    preset: PresetKey,
    inputDim: number,
    classes = 10
): MlpArch {
    return { inputDim, hidden: P6_PRESETS[preset].hidden, classes };
}
