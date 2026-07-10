/* P6 dataset loader — tests the pure pack core (buildLoadedDataset / packFrom)
   against hand-built sample-major byte arrays, so no DOM/fetch is needed. */

import { describe, expect, it } from "vitest";

import { buildLoadedDataset } from "../dataset";
import type { DatasetManifest } from "../dataset";

describe("buildLoadedDataset", () => {
    it("unpacks grayscale samples with correct shape, range, and mean-subtraction", () => {
        const manifest: DatasetManifest = {
            id: "mnist",
            tile: 2,
            depth: 1,
            trainN: 4,
            valN: 2,
            labels: [0, 1, 2, 3, 4, 5],
            classNames: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
            mean: [0.2],
        };
        // 6 samples × (2*2*1) bytes; sample s filled with value s*10
        const inputDim = 4;
        const bytes = new Uint8Array(6 * inputDim);
        for (let s = 0; s < 6; s++)
            bytes.fill(s * 10, s * inputDim, (s + 1) * inputDim);
        const ds = buildLoadedDataset(manifest, bytes);
        expect(ds.inputDim).toBe(4);
        expect(ds.trainN).toBe(4);
        expect(ds.valN).toBe(2);
        expect(ds.firstVal).toBe(4);
        const s3 = ds.get(3);
        expect(s3.label).toBe(3);
        expect(s3.data).toHaveLength(4);
        for (const v of s3.data) expect(v).toBeCloseTo(30 / 255 - 0.2, 6);
        for (const v of ds.get(0).data) expect(v).toBeCloseTo(-0.2, 6);
    });

    it("unpacks RGB samples interleaved HWC with per-channel mean", () => {
        const manifest: DatasetManifest = {
            id: "cifar10",
            tile: 1,
            depth: 3,
            trainN: 3,
            valN: 1,
            labels: [7, 1, 4, 9],
            classNames: Array.from({ length: 10 }, (_, i) => String(i)),
            mean: [0.1, 0.2, 0.3],
        };
        // 4 samples × 3 bytes (1×1×3): sample s = [s*10, s*10+1, s*10+2]
        const bytes = new Uint8Array(4 * 3);
        for (let s = 0; s < 4; s++) {
            bytes[s * 3] = s * 10;
            bytes[s * 3 + 1] = s * 10 + 1;
            bytes[s * 3 + 2] = s * 10 + 2;
        }
        const ds = buildLoadedDataset(manifest, bytes);
        expect(ds.inputDim).toBe(3);
        const s2 = ds.get(2);
        expect(s2.label).toBe(4);
        expect(s2.data[0]).toBeCloseTo(20 / 255 - 0.1, 6);
        expect(s2.data[1]).toBeCloseTo(21 / 255 - 0.2, 6);
        expect(s2.data[2]).toBeCloseTo(22 / 255 - 0.3, 6);
    });
});
