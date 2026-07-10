/* One-off asset generator for the P6 "Playground" playground. NOT part of the app
   bundle — run it once locally to populate public/datasets/:

     node scripts/build-datasets.mjs            # download real sets, sample subsets
     node scripts/build-datasets.mjs --synthetic  # skip network, structured fakes

   For each of MNIST / FashionMNIST / KMNIST / CIFAR-10 it downloads the standard
   files, samples a class-balanced 2000-train + 200-validation subset (train tiles
   first, then validation drawn from the held-out test split — no leakage), packs
   them into ONE gzipped raw-pixel blob (grayscale or RGB), computes the per-channel
   train mean, and writes a sibling JSON manifest consumed by src/lib/workshop/
   cnn/dataset.ts. Any dataset whose download/parse fails falls back to a
   deterministic synthetic generator so all four assets always exist. */

import { gzipSync, gunzipSync, inflateSync, inflateRawSync } from 'node:zlib'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'datasets')
const CACHE = join(__dirname, '.datacache')
const SYNTHETIC = process.argv.includes('--synthetic')
// --only=cifar10,mnist restricts the build to a subset (leaves other assets intact)
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '')
  .replace('--only=', '')
  .split(',')
  .filter(Boolean)

const CFG = {
  mnist: {
    depth: 1,
    tile: 28,
    trainN: 2000,
    valN: 200,
    classNames: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    idx: {
      base: 'https://ossci-datasets.s3.amazonaws.com/mnist/',
      trImg: 'train-images-idx3-ubyte.gz',
      trLbl: 'train-labels-idx1-ubyte.gz',
      teImg: 't10k-images-idx3-ubyte.gz',
      teLbl: 't10k-labels-idx1-ubyte.gz',
    },
  },
  fashion: {
    depth: 1,
    tile: 28,
    trainN: 2000,
    valN: 200,
    classNames: ['T-shirt', 'Trouser', 'Pullover', 'Dress', 'Coat', 'Sandal', 'Shirt', 'Sneaker', 'Bag', 'Boot'],
    idx: {
      // GitHub raw rate-limits (429); Google's Keras mirror is fast + reliable.
      base: 'https://storage.googleapis.com/tensorflow/tf-keras-datasets/',
      trImg: 'train-images-idx3-ubyte.gz',
      trLbl: 'train-labels-idx1-ubyte.gz',
      teImg: 't10k-images-idx3-ubyte.gz',
      teLbl: 't10k-labels-idx1-ubyte.gz',
    },
  },
  kmnist: {
    depth: 1,
    tile: 28,
    trainN: 2000,
    valN: 200,
    classNames: ['お', 'き', 'す', 'つ', 'な', 'は', 'ま', 'や', 'れ', 'を'],
    npz: {
      base: 'http://codh.rois.ac.jp/kmnist/dataset/kmnist/',
      trImg: 'kmnist-train-imgs.npz',
      trLbl: 'kmnist-train-labels.npz',
      teImg: 'kmnist-test-imgs.npz',
      teLbl: 'kmnist-test-labels.npz',
    },
  },
  cifar10: {
    depth: 3,
    tile: 32,
    trainN: 2000,
    valN: 200,
    classNames: ['plane', 'car', 'bird', 'cat', 'deer', 'dog', 'frog', 'horse', 'ship', 'truck'],
    // The canonical toronto binary tar is ~9 KB/s from here (stalls); fast.ai's
    // S3 mirror ships the same images as folder-structured 32×32 PNGs at ~8 MB/s.
    cifar: {
      url: 'https://s3.amazonaws.com/fast-ai-imageclas/cifar10.tgz',
    },
  },
}

// fast.ai folder name → CIFAR class index (matches classNames order above).
const CIFAR_CLASS = {
  airplane: 0, automobile: 1, bird: 2, cat: 3, deer: 4,
  dog: 5, frog: 6, horse: 7, ship: 8, truck: 9,
}

/* --------------------------------------------------------------- seeded RNG */
function mulberry32(seed) {
  let s = seed >>> 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* --------------------------------------------------------------- download */
async function fetchCached(url, name) {
  mkdirSync(CACHE, { recursive: true })
  const dest = join(CACHE, name)
  if (existsSync(dest)) return readFileSync(dest)
  process.stdout.write(`  ↓ ${url}\n`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(dest, buf)
  return buf
}

/* --------------------------------------------------------------- parsers */
function parseIdxImages(buf) {
  // magic(4) n(4) rows(4) cols(4) then rows*cols bytes each
  const n = buf.readUInt32BE(4)
  const rows = buf.readUInt32BE(8)
  const cols = buf.readUInt32BE(12)
  return { n, rows, cols, data: buf.subarray(16) }
}
function parseIdxLabels(buf) {
  const n = buf.readUInt32BE(4)
  return { n, data: buf.subarray(8) }
}

// minimal .npz (ZIP of .npy) reader: find first local file, inflate, strip npy header.
function parseNpz(buf) {
  // local file header signature 0x04034b50
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip/npz')
  const method = buf.readUInt16LE(8)
  const nameLen = buf.readUInt16LE(26)
  const extraLen = buf.readUInt16LE(28)
  const dataStart = 30 + nameLen + extraLen
  const compSize = buf.readUInt32LE(18)
  const raw = buf.subarray(dataStart, dataStart + compSize)
  const npy = method === 8 ? inflateRawSync(raw) : raw
  // .npy: \x93NUMPY, ver(2), headerLen(2 LE for v1), header dict, then data
  const headerLen = npy.readUInt16LE(8)
  const dataOff = 10 + headerLen
  const header = npy.subarray(10, dataOff).toString('latin1')
  const shape = /'shape':\s*\(([^)]*)\)/.exec(header)[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
  return { shape, data: npy.subarray(dataOff) }
}

function untarGz(buf) {
  const tar = gunzipSync(buf)
  const files = []
  let off = 0
  while (off + 512 <= tar.length) {
    const name = tar.subarray(off, off + 100).toString('latin1').replace(/\0.*$/, '')
    if (!name) break
    const size = parseInt(tar.subarray(off + 124, off + 136).toString('latin1').replace(/\0.*$/, '').trim(), 8) || 0
    const start = off + 512
    files.push({ name, data: tar.subarray(start, start + size) })
    off = start + Math.ceil(size / 512) * 512
  }
  return files
}

/* --------------------------------------------------------------- loaders → {images:Uint8[tile*tile*depth], labels} split into train/test */
async function loadIdx(cfg, key) {
  const s = cfg.idx
  const [trI, trL, teI, teL] = await Promise.all([
    fetchCached(s.base + s.trImg, `${key}-trI.gz`),
    fetchCached(s.base + s.trLbl, `${key}-trL.gz`),
    fetchCached(s.base + s.teImg, `${key}-teI.gz`),
    fetchCached(s.base + s.teLbl, `${key}-teL.gz`),
  ])
  const trImg = parseIdxImages(gunzipSync(trI))
  const trLbl = parseIdxLabels(gunzipSync(trL))
  const teImg = parseIdxImages(gunzipSync(teI))
  const teLbl = parseIdxLabels(gunzipSync(teL))
  return {
    train: { img: trImg.data, lbl: trLbl.data, n: trImg.n, stride: trImg.rows * trImg.cols },
    test: { img: teImg.data, lbl: teLbl.data, n: teImg.n, stride: teImg.rows * teImg.cols },
  }
}

async function loadNpz(cfg, key) {
  const s = cfg.npz
  const [trI, trL, teI, teL] = await Promise.all([
    fetchCached(s.base + s.trImg, `${key}-trI.npz`),
    fetchCached(s.base + s.trLbl, `${key}-trL.npz`),
    fetchCached(s.base + s.teImg, `${key}-teI.npz`),
    fetchCached(s.base + s.teLbl, `${key}-teL.npz`),
  ])
  const trImg = parseNpz(trI)
  const teImg = parseNpz(teI)
  const stride = trImg.shape[1] * trImg.shape[2]
  return {
    train: { img: trImg.data, lbl: parseNpz(trL).data, n: trImg.shape[0], stride },
    test: { img: teImg.data, lbl: parseNpz(teL).data, n: teImg.shape[0], stride },
  }
}

/* --------------------------------------------------------------- minimal PNG decode
   Enough of the spec for fast.ai's 32×32 CIFAR tiles: 8-bit, color types 0/2/3/6,
   filters 0–4, single IDAT stream. Returns HWC RGB bytes (3 ch). No deps beyond
   zlib inflate. */
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}
function decodePngRGB(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let off = 8
  let width = 0, height = 0, bitDepth = 0, colorType = 0
  let palette = null
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'PLTE') {
      palette = data
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`)
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : 1 // 3=palette→1 index
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * 3)
  const prev = new Uint8Array(stride)
  const cur = new Uint8Array(stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    for (let i = 0; i < stride; i++) {
      const rawv = raw[p++]
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v
      switch (filter) {
        case 0: v = rawv; break
        case 1: v = rawv + a; break
        case 2: v = rawv + b; break
        case 3: v = rawv + ((a + b) >> 1); break
        case 4: v = rawv + paeth(a, b, c); break
        default: throw new Error(`bad PNG filter ${filter}`)
      }
      cur[i] = v & 0xff
    }
    // expand this scanline to RGB
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 3
      if (colorType === 3) {
        const idx = cur[x] * 3
        out[di] = palette[idx]; out[di + 1] = palette[idx + 1]; out[di + 2] = palette[idx + 2]
      } else if (colorType === 0) {
        const g = cur[x]; out[di] = g; out[di + 1] = g; out[di + 2] = g
      } else {
        const s = x * channels
        out[di] = cur[s]; out[di + 1] = cur[s + 1]; out[di + 2] = cur[s + 2]
      }
    }
    prev.set(cur)
  }
  return { width, height, data: out } // HWC RGB
}

// fast.ai CIFAR: cifar10/{train,test}/<class>/<id>.png — decode a capped, seeded
// per-class subset (enough for sampleBalanced to draw the final counts from).
async function loadCifar(cfg) {
  const buf = await fetchCached(cfg.cifar.url, 'cifar10-fastai.tgz')
  const files = untarGz(buf)
  const rnd = mulberry32(hashStr('cifar-fastai'))
  const build = (split, perClass) => {
    const byClass = Array.from({ length: 10 }, () => [])
    const re = new RegExp(`cifar10/${split}/([a-z]+)/[^/]+\\.png$`)
    for (const f of files) {
      const m = re.exec(f.name)
      if (m && CIFAR_CLASS[m[1]] !== undefined) byClass[CIFAR_CLASS[m[1]]].push(f)
    }
    const picked = []
    for (let c = 0; c < 10; c++) {
      const arr = byClass[c]
      for (let k = arr.length - 1; k > 0; k--) {
        const j = Math.floor(rnd() * (k + 1))
        ;[arr[k], arr[j]] = [arr[j], arr[k]]
      }
      for (let k = 0; k < perClass && k < arr.length; k++) picked.push({ f: arr[k], c })
    }
    const img = new Uint8Array(picked.length * 3072)
    const lbl = new Uint8Array(picked.length)
    picked.forEach((pk, i) => {
      const dec = decodePngRGB(pk.f.data)
      img.set(dec.data.subarray(0, 3072), i * 3072)
      lbl[i] = pk.c
    })
    return { img, lbl, n: picked.length, stride: 3072 }
  }
  return {
    train: build('train', Math.ceil(cfg.trainN / 10) + 200),
    test: build('test', Math.ceil(cfg.valN / 10) + 100),
    interleaved: true,
  }
}

/* --------------------------------------------------------------- synthetic fallback */
function synthetic(cfg, key) {
  const { tile, depth, trainN, valN } = cfg
  const rnd = mulberry32(0xc0ffee ^ hashStr(key))
  const stride = tile * tile * depth
  const gen = (n) => {
    const img = new Uint8Array(n * stride)
    const lbl = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      const c = i % 10
      lbl[i] = c
      // each class = an oriented gradient blob at a class-specific angle/color
      const ang = (c / 10) * Math.PI * 2
      const cx = tile / 2 + Math.cos(ang) * tile * 0.2
      const cy = tile / 2 + Math.sin(ang) * tile * 0.2
      for (let y = 0; y < tile; y++)
        for (let x = 0; x < tile; x++) {
          const d = Math.hypot(x - cx, y - cy) / tile
          const v = Math.max(0, 1 - d * 1.6) * 255
          const base = (y * tile + x) * depth
          if (depth === 1) img[i * stride + base] = clamp8(v + (rnd() - 0.5) * 40)
          else {
            img[i * stride + base] = clamp8(v * (c % 3 === 0 ? 1 : 0.3) + (rnd() - 0.5) * 40)
            img[i * stride + base + 1] = clamp8(v * (c % 3 === 1 ? 1 : 0.3) + (rnd() - 0.5) * 40)
            img[i * stride + base + 2] = clamp8(v * (c % 3 === 2 ? 1 : 0.3) + (rnd() - 0.5) * 40)
          }
        }
    }
    return { img, lbl, n, stride }
  }
  return { train: gen(trainN * 2), test: gen(valN * 2), interleaved: true, synthetic: true }
}

function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
function clamp8(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

/* --------------------------------------------------------------- sampling + tiling */
function sampleBalanced(split, cfg, perClass, seed, interleaved) {
  const byClass = Array.from({ length: 10 }, () => [])
  for (let i = 0; i < split.n; i++) {
    const c = split.lbl[i]
    if (c < 10) byClass[c].push(i)
  }
  const rnd = mulberry32(seed)
  const picked = []
  for (let c = 0; c < 10; c++) {
    const arr = byClass[c]
    for (let k = arr.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1))
      ;[arr[k], arr[j]] = [arr[j], arr[k]]
    }
    for (let k = 0; k < perClass && k < arr.length; k++) picked.push(arr[k])
  }
  // interleave classes so the sheet isn't class-blocked (nicer thumbnails)
  for (let k = picked.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1))
    ;[picked[k], picked[j]] = [picked[j], picked[k]]
  }
  const depthStride = interleaved ? split.stride : split.stride // src bytes per image
  return picked.map((i) => ({
    px: split.img.subarray(i * depthStride, i * depthStride + depthStride),
    label: split.lbl[i],
  }))
}

/** Pack samples into one flat sample-major HWC byte array + per-channel mean. */
function packBytes(samples, tile, depth) {
  const total = samples.length
  const inputDim = tile * tile * depth
  const bytes = new Uint8Array(total * inputDim)
  const mean = new Float64Array(depth)
  samples.forEach((s, t) => {
    const base = t * inputDim
    for (let k = 0; k < inputDim; k++) {
      const v = s.px[k]
      bytes[base + k] = v
      mean[k % depth] += v
    }
  })
  const n = total * tile * tile
  for (let c = 0; c < depth; c++) mean[c] = mean[c] / n / 255
  return { bytes, mean: Array.from(mean) }
}

/* --------------------------------------------------------------- per-dataset build */
async function build(key) {
  const cfg = CFG[key]
  let raw
  let note = 'real'
  if (SYNTHETIC) {
    raw = synthetic(cfg, key)
    note = 'synthetic (--synthetic)'
  } else {
    try {
      if (cfg.idx) raw = await loadIdx(cfg, key)
      else if (cfg.npz) raw = await loadNpz(cfg, key)
      else raw = await loadCifar(cfg)
    } catch (e) {
      console.warn(`  ! ${key}: real download failed (${e.message}) → synthetic fallback`)
      raw = synthetic(cfg, key)
      note = 'synthetic (download failed)'
    }
  }
  const interleaved = raw.interleaved ?? false
  const trainSamples = sampleBalanced(raw.train, cfg, cfg.trainN / 10, hashStr(key) ^ 1, interleaved)
  const valSamples = sampleBalanced(raw.test, cfg, cfg.valN / 10, hashStr(key) ^ 2, interleaved)
  const all = [...trainSamples, ...valSamples]
  const { bytes, mean } = packBytes(all, cfg.tile, cfg.depth)
  const gz = gzipSync(bytes, { level: 9 })

  mkdirSync(OUT, { recursive: true })
  // NB: extension is deliberately NOT ".gz" — Nitro's static handler stamps
  // Content-Encoding: gzip on any ".gz" asset, which makes browsers/CDNs
  // transparently decompress it and breaks our manual DecompressionStream
  // (and truncates the stream through a Cloudflare tunnel). We serve this as an
  // opaque octet-stream and gunzip it ourselves in the client.
  writeFileSync(join(OUT, `${key}.bin.gzip`), gz)
  const manifest = {
    id: key,
    tile: cfg.tile,
    depth: cfg.depth,
    trainN: trainSamples.length,
    valN: valSamples.length,
    labels: all.map((s) => s.label),
    classNames: cfg.classNames,
    mean,
  }
  writeFileSync(join(OUT, `${key}.json`), JSON.stringify(manifest))
  console.log(
    `  ✓ ${key}: ${all.length} imgs, ${(bytes.length / 1e6).toFixed(1)} MB raw → ${(gz.length / 1e6).toFixed(2)} MB gz [${note}]`,
  )
}

async function main() {
  console.log(`Building P6 datasets → ${OUT}${SYNTHETIC ? ' (synthetic)' : ''}`)
  const keys = Object.keys(CFG).filter((k) => ONLY.length === 0 || ONLY.includes(k))
  for (const key of keys) {
    console.log(`• ${key}`)
    await build(key)
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
