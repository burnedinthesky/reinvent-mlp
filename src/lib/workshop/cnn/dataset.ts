/* P6 dataset loader. Each dataset ships as a gzipped raw-pixel blob
   (public/datasets/<id>.bin.gzip) plus a sibling JSON manifest. We deliberately do
   NOT use a PNG sprite-sheet: decoding a large image through a canvas and reading
   it back with getImageData is unreliable in headless/GPU-composited contexts
   (regions come back black), which silently feeds the net constant input. Raw
   bytes + the browser's built-in DecompressionStream('gzip') is deterministic and
   canvas-free.

   Bytes are stored sample-major, each sample HWC-interleaved:
   byte(sample s, y, x, c) = s*inputDim + (y*tile + x)*depth + c. That layout
   reshapes straight back to an image for the hover viz, and a first-hidden weight
   row uses the identical layout so its "template" renders as a picture. Values are
   v/255 then per-channel mean-subtracted (mean shipped in the manifest). */

export type DatasetId = "mnist" | "fashion" | "kmnist" | "cifar10";

export const DATASET_IDS: DatasetId[] = [
    "mnist",
    "fashion",
    "kmnist",
    "cifar10",
];

export const DATASET_LABEL: Record<DatasetId, string> = {
    mnist: "MNIST",
    fashion: "FashionMNIST",
    kmnist: "KMNIST",
    cifar10: "CIFAR-10",
};

export interface DatasetManifest {
    id: DatasetId;
    tile: number; // 28 or 32
    depth: 1 | 3;
    trainN: number;
    valN: number;
    labels: number[]; // class per sample (train samples first, then validation)
    classNames: string[];
    mean: number[]; // per-channel train mean, over v/255; length === depth
}

export interface Sample {
    data: Float32Array; // length tile*tile*depth, HWC, mean-subtracted
    label: number;
}

/** A whole dataset packed into two flat, transferable buffers. */
export interface PackedDataset {
    id: DatasetId;
    tile: number;
    depth: number;
    inputDim: number;
    classNames: string[];
    trainN: number;
    valN: number;
    firstVal: number;
    data: Float32Array; // (trainN+valN) * inputDim, sample-major
    labels: Int32Array; // (trainN+valN)
}

export interface LoadedDataset {
    id: DatasetId;
    tile: number;
    depth: number;
    inputDim: number;
    classNames: string[];
    trainN: number;
    valN: number;
    /** sample by global index: [0, trainN) = train, [trainN, trainN+valN) = validation. */
    get: (index: number) => Sample;
    /** first-validation-image index — the default hover-viz input. */
    firstVal: number;
}

/** Convert the raw sample-major pixel bytes into one flat mean-subtracted tensor.
    `bytes` length must equal (trainN+valN) * tile*tile*depth. Pure. */
export function packFrom(
    manifest: DatasetManifest,
    bytes: Uint8Array
): PackedDataset {
    const { tile, depth } = manifest;
    const total = manifest.trainN + manifest.valN;
    const inputDim = tile * tile * depth;
    const mean = manifest.mean;
    const data = new Float32Array(total * inputDim);
    const lbl = new Int32Array(total);

    for (let s = 0; s < total; s++) {
        const base = s * inputDim;
        for (let k = 0; k < inputDim; k++) {
            data[base + k] = bytes[base + k] / 255 - mean[k % depth];
        }
        lbl[s] = manifest.labels[s];
    }

    return {
        id: manifest.id,
        tile,
        depth,
        inputDim,
        classNames: manifest.classNames,
        trainN: manifest.trainN,
        valN: manifest.valN,
        firstVal: manifest.trainN,
        data,
        labels: lbl,
    };
}

/** Wrap a packed dataset (local or received over postMessage) as a LoadedDataset.
    get() returns a zero-copy subarray view into the flat buffer. */
export function wrapPacked(p: PackedDataset): LoadedDataset {
    return {
        id: p.id,
        tile: p.tile,
        depth: p.depth,
        inputDim: p.inputDim,
        classNames: p.classNames,
        trainN: p.trainN,
        valN: p.valN,
        firstVal: p.firstVal,
        get: (i: number) => ({
            data: p.data.subarray(i * p.inputDim, (i + 1) * p.inputDim),
            label: p.labels[i],
        }),
    };
}

/** Test/convenience helper: pack straight to a LoadedDataset from raw bytes. */
export function buildLoadedDataset(
    manifest: DatasetManifest,
    bytes: Uint8Array
): LoadedDataset {
    return wrapPacked(packFrom(manifest, bytes));
}

/** Fetch + gunzip a dataset into a PackedDataset ready to hand to the worker.
    No canvas: DecompressionStream('gzip') gives deterministic raw pixels. */
export async function loadPacked(
    id: DatasetId,
    base = "/datasets"
): Promise<PackedDataset> {
    const [manifest, raw] = await Promise.all([
        fetch(`${base}/${id}.json`).then(
            (r) => r.json() as Promise<DatasetManifest>
        ),
        fetch(`${base}/${id}.bin.gzip`).then(async (r) => {
            if (!r.ok)
                throw new Error(`fetch ${id}.bin.gzip → HTTP ${r.status}`);
            return new Uint8Array(await r.arrayBuffer());
        }),
    ]);
    if (manifest.trainN !== 2000 || manifest.valN !== 200) {
        throw new Error(
            `P6 dataset "${id}" has the wrong split (trainN=${manifest.trainN}, valN=${manifest.valN}; expected 2000 + 200). Run: node scripts/build-datasets.mjs`
        );
    }
    // The payload is a gzip blob we decompress ourselves. We serve it as opaque
    // application/octet-stream (extension is .gzip, not .gz) so no proxy adds
    // Content-Encoding and transparently decompresses it. Belt-and-braces: if a
    // proxy DID decompress it in transit, the gzip magic (0x1f 0x8b) is gone and
    // these are already the raw pixels — use them as-is.
    const bytes =
        raw.length > 1 && raw[0] === 0x1f && raw[1] === 0x8b
            ? new Uint8Array(
                  await new Response(
                      new Blob([raw])
                          .stream()
                          .pipeThrough(new DecompressionStream("gzip"))
                  ).arrayBuffer()
              )
            : raw;
    const expected =
        (manifest.trainN + manifest.valN) *
        manifest.tile *
        manifest.tile *
        manifest.depth;
    if (bytes.length !== expected) {
        throw new Error(
            `P6 dataset "${id}" byte length ${bytes.length} !== expected ${expected}. Re-run: node scripts/build-datasets.mjs`
        );
    }
    return packFrom(manifest, bytes);
}
