/* P4 stage terrain (p4-redesign-spec §4). A `StageTerrain` exposes the same true
   full-batch grid shape as `LossLandscape` (grid / gMin / gMax / clampG / lossAt)
   plus two batch=1 samplers the interpreter reads:

     sample(w, b, rng)     — one random training point's loss term at (w, b)
     gradSample(w, b, rng) — central-difference steepest-descent on ONE sampled
                             point's loss term (the ∇ compass; noisy by design)

   The Bowl (bowlStage) is a thin wrapper over the existing LossLandscape. The
   data-derived scored stages (buildScoredStage) freeze a tiny MLP over the same
   trainZ slice, expose two of its weights as the (w, b) plane, and are validated
   by the hardness harness (verifyTerrain) so the surface is honestly non-convex.
   Pure and client-safe — mirrors lossgrid.ts. */

import { createRng } from "./rng";
import { REFERENCE_PROGRAMS } from "./refbots";
import { runProgram } from "./server/botrun";
import type { LossLandscape, TrainZPoint } from "./lossgrid";
import type { Rng } from "./rng";
import type { StageId, VerifyCheck } from "./types";

export interface StageTerrain {
    id: StageId;
    readonly GN: number;
    readonly grid: Float32Array;
    readonly gMin: number;
    readonly gMax: number;
    /** clamp a coordinate to the [-4, 4] plane. */
    clampG: (v: number) => number;
    /** TRUE full-batch loss at (w, b) — the judge / terrain render read this. */
    lossAt: (w: number, b: number) => number;
    /** batch=1 reading: one random training point's loss term at (w, b). */
    sample: (w: number, b: number, rng: Rng) => number;
    /** single-sample steepest-descent direction. VESTIGIAL — the ∇ card was cut
      from the language; nothing calls this. Kept for a later cleanup pass. */
    gradSample: (w: number, b: number, rng: Rng) => { dw: number; db: number };
}

/** Per-point logistic loss term (same formula the Bowl grid averages over). */
function logisticTerm(
    s: number,
    x: number,
    y: number,
    w: number,
    b: number
): number {
    const m = s * (y - (w * x + b));
    return m > 30 ? 0 : m < -30 ? -m : Math.log(1 + Math.exp(-m));
}

/** Stage 0 — the Bowl: the existing P3 landscape, batch=1 sampled from its
    z-scored training slice (`land.trainZ`). No new math. */
export function bowlStage(land: LossLandscape): StageTerrain {
    const tz = land.trainZ;
    const pick = (rng: Rng) =>
        tz[Math.min(tz.length - 1, Math.floor(rng() * tz.length))];
    // grid spacing, matching lossgrid's finite-difference epsilon.
    const e = 8 / (land.GN - 1);
    return {
        id: "bowl",
        GN: land.GN,
        grid: land.grid,
        gMin: land.gMin,
        gMax: land.gMax,
        clampG: (v) => land.clampG(v),
        lossAt: (w, b) => land.lossAt(w, b),
        sample: (w, b, rng) => {
            const p = pick(rng);
            return logisticTerm(p.s, p.x, p.y, w, b);
        },
        gradSample: (w, b, rng) => {
            const p = pick(rng);
            const term = (W: number, B: number) =>
                logisticTerm(p.s, p.x, p.y, W, B);
            return {
                dw: (term(w + e, b) - term(w - e, b)) / (2 * e),
                db: (term(w, b + e) - term(w, b - e)) / (2 * e),
            };
        },
    };
}

/* ============================================================ MLP terrain */

const GN = 201;
/** grid index → coordinate in [-4, 4] (identical spacing to lossgrid). */
const coordOf = (i: number, n: number) => -4 + (8 * i) / (n - 1);
const clampG = (v: number) => Math.max(-4, Math.min(4, v));

/** A frozen `2 → H(tanh) → 1(sigmoid)` net: layer weights/biases plus the two
    weight cells the (w, b) plane overwrites. Everything else stays frozen. */
interface FrozenNet {
    H: number;
    /** W0[h][i] — hidden-layer input weights (H×2). */
    W0: number[][];
    /** b0[h] — hidden-layer biases. */
    b0: number[];
    /** W1[h] — output-layer weights (1×H). */
    W1: number[];
    /** b1 — output bias. */
    b1: number;
}

/** A curated free-weight pair: which two frozen cells become (w, b). Each ref is
    a structured `{layer, o, i}` (layer 0 = hidden W0[o][i]; layer 1 = output
    W1[o], i ignored). Cross-layer pairs fold the surface — see §4.2. */
interface WeightRef {
    layer: 0 | 1;
    o: number;
    i: number;
}
type WeightPair = [WeightRef, WeightRef];

/** Candidate pairs, in preference order. The strongest lever is (a): the two
    OUTPUT weights of a competing neuron pair (W1[j], W1[k]). The dataset's owl
    class is two sub-clusters (WEDGE_MEANS.a1 game-spur / .a2 caffeine-spur), and
    freezing tends to latch one sub-cluster per hidden neuron — so both-off misses
    the owls, one-on catches one spur, both-on catches both. That gives the plane
    a bimodal / saddle shape (two competing partial-fit basins) instead of the
    single bowl the input-weight pairs draw. Then (b) both input weights of a
    hidden neuron, (c) cross-layer folds (input weight × its output weight), and a
    few cross-neuron input pairs so the surface can pick up neighbouring basins. */
function weightPairs(H: number): WeightPair[] {
    const pairs: WeightPair[] = [
        // (a) competing output weights: neuron 0 vs neuron 1 (the bimodal lever).
        [
            { layer: 1, o: 0, i: 0 },
            { layer: 1, o: 1, i: 0 },
        ],
        // (b) both input weights of hidden neuron 0.
        [
            { layer: 0, o: 0, i: 0 },
            { layer: 0, o: 0, i: 1 },
        ],
        // (c) cross-layer: hidden-0 first input weight × hidden-0 output weight.
        [
            { layer: 0, o: 0, i: 0 },
            { layer: 1, o: 0, i: 0 },
        ],
        [
            { layer: 0, o: 1, i: 0 },
            { layer: 1, o: 1, i: 0 },
        ],
        // cross-neuron input pair — folds two neurons' first inputs against each other.
        [
            { layer: 0, o: 0, i: 0 },
            { layer: 0, o: 1, i: 0 },
        ],
        [
            { layer: 0, o: 1, i: 1 },
            { layer: 0, o: 0, i: 1 },
        ],
    ];
    if (H >= 3) {
        pairs.push(
            // more competing-output pairs across the third neuron (H=3 has three ways
            // to pit two owl-latching neurons against each other).
            [
                { layer: 1, o: 0, i: 0 },
                { layer: 1, o: 2, i: 0 },
            ],
            [
                { layer: 1, o: 1, i: 0 },
                { layer: 1, o: 2, i: 0 },
            ],
            [
                { layer: 0, o: 2, i: 0 },
                { layer: 0, o: 2, i: 1 },
            ],
            [
                { layer: 0, o: 2, i: 0 },
                { layer: 1, o: 2, i: 0 },
            ]
        );
    }
    return pairs;
}

/** Seed-parameterized init + `steps` full-batch GD freeze at lr=0.5 (mirrors
    mlp.ts build/trainStep, but self-contained and shaped as a 2→H→1 net). Fewer
    steps leave the net short of its single dominant basin, so more of the
    competing-neuron structure survives into the swept plane (the candidate search
    sweeps a small {150, 300} set — see buildScoredStage). */
function freezeNet(
    train: TrainZPoint[],
    H: number,
    seed: number,
    steps = 300
): FrozenNet {
    // local xorshift in [-1, 1], same shape as mlp.ts build().
    let s = (seed * 99991) >>> 0 || 0x9e3779b9;
    const rnd = () => {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;
        s >>>= 0;
        return (s / 4294967296) * 2 - 1;
    };
    const W0 = Array.from({ length: H }, () => [rnd(), rnd()]);
    const b0 = Array.from({ length: H }, () => rnd());
    const W1 = Array.from({ length: H }, () => rnd());
    let b1 = rnd();

    const lr = 0.5;
    const N = train.length || 1;
    for (let t = 0; t < steps; t++) {
        const gW0 = Array.from({ length: H }, () => [0, 0]);
        const gb0 = new Array<number>(H).fill(0);
        const gW1 = new Array<number>(H).fill(0);
        let gb1 = 0;
        for (const p of train) {
            // forward.
            const h = new Array<number>(H);
            for (let j = 0; j < H; j++) {
                h[j] = Math.tanh(W0[j][0] * p.x + W0[j][1] * p.y + b0[j]);
            }
            let z = b1;
            for (let j = 0; j < H; j++) z += W1[j] * h[j];
            const o = 1 / (1 + Math.exp(-z));
            const target = p.s > 0 ? 1 : 0;
            // output delta (BCE + sigmoid ⇒ o − t).
            const d1 = o - target;
            gb1 += d1;
            for (let j = 0; j < H; j++) {
                gW1[j] += d1 * h[j];
                // hidden delta, tanh derivative 1 − h².
                const dh = d1 * W1[j] * (1 - h[j] * h[j]);
                gb0[j] += dh;
                gW0[j][0] += dh * p.x;
                gW0[j][1] += dh * p.y;
            }
        }
        b1 -= (lr * gb1) / N;
        for (let j = 0; j < H; j++) {
            W1[j] -= (lr * gW1[j]) / N;
            b0[j] -= (lr * gb0[j]) / N;
            W0[j][0] -= (lr * gW0[j][0]) / N;
            W0[j][1] -= (lr * gW0[j][1]) / N;
        }
    }
    return { H, W0, b0, W1, b1 };
}

/** Write a weight cell addressed by a WeightRef (the swept (w, b) pair). */
function setW(net: FrozenNet, r: WeightRef, v: number): void {
    if (r.layer === 0) net.W0[r.o][r.i] = v;
    else net.W1[r.o] = v;
}

/** Full net forward on one point → P(owl) in [0,1]. */
function netOut(net: FrozenNet, x: number, y: number): number {
    let z = net.b1;
    for (let j = 0; j < net.H; j++) {
        z +=
            net.W1[j] *
            Math.tanh(net.W0[j][0] * x + net.W0[j][1] * y + net.b0[j]);
    }
    return 1 / (1 + Math.exp(-z));
}

/** Per-point BCE term under the frozen net at one training point. */
function bceTerm(net: FrozenNet, p: TrainZPoint): number {
    const o = netOut(net, p.x, p.y);
    const t = p.s > 0 ? 1 : 0;
    return -(t * Math.log(o + 1e-12) + (1 - t) * Math.log(1 - o + 1e-12));
}

/** Sweep the free-weight pair over [-4,4]² at n×n, filling a fresh loss grid
    (full-batch mean BCE at each cell). Returns the grid + its extrema/argmin.

    Fast path: the swept pair touches at most two hidden neurons, so each point's
    output split into a frozen part `zFrozen` (the neurons the pair never touches,
    computed once) + the ≤2 "active" neurons recomputed per cell. Cuts the
    per-cell forward from H tanh() evals to 1–2. */
function sweepGrid(
    base: FrozenNet,
    train: TrainZPoint[],
    pair: WeightPair,
    n: number
): { grid: Float32Array; gMin: number; gMax: number; bStar: number } {
    const H = base.H;
    const N = train.length || 1;
    // which hidden neurons each ref addresses (layer 1 refs multiply neuron `o`'s
    // activation; layer 0 refs are one of neuron `o`'s input weights).
    const active = new Set<number>([pair[0].o, pair[1].o]);
    const activeIdx = [...active];

    // per-point frozen output contribution (b1 + Σ non-active neurons W1·tanh).
    const zFrozen = new Float32Array(train.length);
    for (let pi = 0; pi < train.length; pi++) {
        const p = train[pi];
        let z = base.b1;
        for (let j = 0; j < H; j++) {
            if (active.has(j)) continue;
            z +=
                base.W1[j] *
                Math.tanh(
                    base.W0[j][0] * p.x + base.W0[j][1] * p.y + base.b0[j]
                );
        }
        zFrozen[pi] = z;
    }

    // mutable copy of the active neurons' weights, overwritten per cell.
    const w0 = base.W0.map((r) => r.slice());
    const w1 = base.W1.slice();
    const grid = new Float32Array(n * n);
    let mn = Infinity;
    let mx = -Infinity;
    let am = 0;
    for (let bi = 0; bi < n; bi++) {
        setPairCell(w0, w1, pair[1], coordOf(bi, n));
        for (let wi = 0; wi < n; wi++) {
            setPairCell(w0, w1, pair[0], coordOf(wi, n));
            let L = 0;
            for (let pi = 0; pi < train.length; pi++) {
                const p = train[pi];
                let z = zFrozen[pi];
                for (const j of activeIdx) {
                    z +=
                        w1[j] *
                        Math.tanh(w0[j][0] * p.x + w0[j][1] * p.y + base.b0[j]);
                }
                const o = 1 / (1 + Math.exp(-z));
                const t = p.s > 0 ? 1 : 0;
                L += -(
                    t * Math.log(o + 1e-12) +
                    (1 - t) * Math.log(1 - o + 1e-12)
                );
            }
            L /= N;
            const idx = bi * n + wi;
            grid[idx] = L;
            if (L < mn) {
                mn = L;
                am = idx;
            }
            if (L > mx) mx = L;
        }
    }
    return { grid, gMin: mn, gMax: mx, bStar: coordOf(Math.floor(am / n), n) };
}

/** overwrite the weight cell a ref addresses in the working (w0, w1) arrays. */
function setPairCell(
    w0: number[][],
    w1: number[],
    r: WeightRef,
    v: number
): void {
    if (r.layer === 0) w0[r.o][r.i] = v;
    else w1[r.o] = v;
}

/** Wrap a frozen net + chosen pair + swept grid as a StageTerrain. The batch=1
    samplers overwrite the pair cells per call and read a single training point,
    exactly mirroring how the Bowl relates its per-point term to its grid. */
function stageFromGrid(
    id: StageId,
    base: FrozenNet,
    train: TrainZPoint[],
    pair: WeightPair,
    swept: { grid: Float32Array; gMin: number; gMax: number; bStar: number }
): StageTerrain {
    // grid may be the coarse (candidate-search) or full (final) sweep — GN must
    // track whichever it is so the harness reads it at the right resolution. The
    // analytic samplers below are resolution-independent (they recompute the net).
    const gn = Math.round(Math.sqrt(swept.grid.length));
    const e = 8 / (gn - 1);
    const pick = (rng: Rng) =>
        train[Math.min(train.length - 1, Math.floor(rng() * train.length))];
    // a private working net the samplers/lossAt reuse (never mutates `base`).
    const net: FrozenNet = {
        H: base.H,
        W0: base.W0.map((r) => r.slice()),
        b0: base.b0.slice(),
        W1: base.W1.slice(),
        b1: base.b1,
    };
    const N = train.length || 1;
    const lossAt = (w: number, b: number) => {
        setW(net, pair[0], clampG(w));
        setW(net, pair[1], clampG(b));
        let L = 0;
        for (const p of train) L += bceTerm(net, p);
        return L / N;
    };
    const termAt = (p: TrainZPoint, w: number, b: number) => {
        setW(net, pair[0], w);
        setW(net, pair[1], b);
        return bceTerm(net, p);
    };
    return {
        id,
        GN: gn,
        grid: swept.grid,
        gMin: swept.gMin,
        gMax: swept.gMax,
        clampG,
        lossAt,
        sample: (w, b, rng) => termAt(pick(rng), clampG(w), clampG(b)),
        gradSample: (w, b, rng) => {
            const p = pick(rng);
            const W = clampG(w);
            const B = clampG(b);
            return {
                dw: (termAt(p, W + e, B) - termAt(p, W - e, B)) / (2 * e),
                db: (termAt(p, W, B + e) - termAt(p, W, B - e)) / (2 * e),
            };
        },
    };
}

/* ------------------------------------------------------------ hardness harness */

/** VerifyCheck helper (replicated from dataset-io.band, kept local so terrain.ts
    stays decoupled from the server import graph). */
function band(
    name: string,
    value: number,
    lo: number,
    hi: number,
    hint: string
): VerifyCheck {
    const pass = value >= lo && value <= hi;
    // pass/fail is decided on the raw numbers; value AND bounds are rounded for
    // display only (computed bounds like max(abs, frac×range) are raw floats).
    const r = (v: number) =>
        Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v;
    return {
        name,
        value: r(value),
        lo: r(lo),
        hi: r(hi),
        pass,
        hint: pass ? "" : hint,
    };
}

/** Iterated 3×3 box blur (`passes` of it ≈ a Gaussian of stdev √passes cells).
    Feature-counting reads a well-smoothed grid so floating-point wiggle in the
    saturated flat regions doesn't manufacture spurious minima/saddles — only
    structure at the terrain's own scale survives. Never mutates the caller's
    grid (ping-pongs private buffers). */
function smooth(grid: Float32Array, n: number, passes: number): Float32Array {
    // two private buffers ping-pong; the caller's grid is never mutated.
    let src: Float32Array = Float32Array.from(grid);
    let out: Float32Array = new Float32Array(n * n);
    for (let pass = 0; pass < passes; pass++) {
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                let s = 0;
                let c = 0;
                for (let dj = -1; dj <= 1; dj++) {
                    for (let di = -1; di <= 1; di++) {
                        const jj = j + dj;
                        const ii = i + di;
                        if (jj < 0 || jj >= n || ii < 0 || ii >= n) continue;
                        s += src[jj * n + ii];
                        c++;
                    }
                }
                out[j * n + i] = s / c;
            }
        }
        const tmp = src;
        src = out;
        out = tmp;
    }
    return src;
}

/** index of the global minimum cell. */
function argMin(grid: Float32Array): number {
    let am = 0;
    let mn = Infinity;
    for (let k = 0; k < grid.length; k++) {
        if (grid[k] < mn) {
            mn = grid[k];
            am = k;
        }
    }
    return am;
}

/** Options selecting the Foothills (H=2) vs Range (H=3) bands, and letting tests
    trim the ladder pass count for speed. */
export interface VerifyOptions {
    /** true = Range (H=3) thresholds; false = Foothills (H=2). */
    hard: boolean;
    /** the stage id to run the reference-bot ladder against. */
    stage: StageTerrain;
    /** seeded ladder passes per program (default 16). */
    ladderK?: number;
}

/** The five structural bands (everything but the ladder) — the expensive part
    is the flow-basin walk, but it's still far cheaper than the reference-bot
    ladder, so the candidate search reads these first and only ladders the
    promising pairs. */
function structuralChecks(stage: StageTerrain, hard: boolean): VerifyCheck[] {
    const n = stage.GN;
    const raw = stage.grid;
    // smooth at a fixed physical scale (~4 % of the plane) so the coarse candidate
    // search and the 201² final report see features at the same scale.
    const sm = smooth(raw, n, Math.max(3, Math.round(n * 0.04)));
    const range = stage.gMax - stage.gMin || 1;
    // range-normalized heights in [0,1] — all the structural bands read this, so
    // their thresholds are scale-invariant across pairs with wildly different loss
    // spread (input-weight pairs vary ~0.2, output-weight pairs ~5).
    const g = new Float32Array(n * n);
    for (let k = 0; k < g.length; k++) g[k] = (sm[k] - stage.gMin) / range;

    // --- local minima: strictly below all 8 neighbours (interior cells). ---
    let localMin = 0;
    const minVals: number[] = [];
    for (let j = 1; j < n - 1; j++) {
        for (let i = 1; i < n - 1; i++) {
            const v = g[j * n + i];
            let lo = true;
            for (let dj = -1; dj <= 1 && lo; dj++) {
                for (let di = -1; di <= 1; di++) {
                    if (di === 0 && dj === 0) continue;
                    if (g[(j + dj) * n + (i + di)] <= v) {
                        lo = false;
                        break;
                    }
                }
            }
            if (lo) {
                localMin++;
                minVals.push(v);
            }
        }
    }

    // --- global-basin fraction: cells whose steepest-descent flow reaches the
    //     global min (follow the lowest 8-neighbour until a local min is hit). ---
    const gmin = argMin(g);
    let basin = 0;
    const total = n * n;
    for (let start = 0; start < total; start++) {
        let cur = start;
        for (let hops = 0; hops < 4000; hops++) {
            const ci = cur % n;
            const cj = (cur - ci) / n;
            let best = cur;
            let bv = g[cur];
            for (let dj = -1; dj <= 1; dj++) {
                for (let di = -1; di <= 1; di++) {
                    if (di === 0 && dj === 0) continue;
                    const ii = ci + di;
                    const jj = cj + dj;
                    if (ii < 0 || ii >= n || jj < 0 || jj >= n) continue;
                    const k = jj * n + ii;
                    if (g[k] < bv) {
                        bv = g[k];
                        best = k;
                    }
                }
            }
            if (best === cur) break; // reached a local min
            cur = best;
        }
        if (cur === gmin) basin++;
    }
    const basinFrac = basin / total;

    // --- saddle count: walk the 8-neighbour ring; a saddle shows ≥4 sign changes
    //     in (neighbour − centre) (uphill in some directions, downhill in others,
    //     alternating). Minima/maxima show 0 changes; a plain slope shows 2. ---
    const ring = [
        [-1, -1],
        [0, -1],
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
    ] as const;
    let saddles = 0;
    const flatEps = 1e-4; // ignore near-flat ring cells (normalized units)
    for (let j = 1; j < n - 1; j++) {
        for (let i = 1; i < n - 1; i++) {
            const v = g[j * n + i];
            let changes = 0;
            let prev = 0;
            let first = 0;
            for (let r = 0; r < 8; r++) {
                const d = g[(j + ring[r][1]) * n + (i + ring[r][0])] - v;
                const sgn = d > flatEps ? 1 : d < -flatEps ? -1 : 0;
                if (sgn === 0) continue;
                if (first === 0) first = sgn;
                else if (sgn !== prev) changes++;
                prev = sgn;
            }
            if (first !== 0 && prev !== first) changes++; // close the ring
            if (changes >= 4) saddles++;
        }
    }

    // --- trap gap: (best non-global local min − global min), heights already
    //     range-normalized so this is directly the fraction-of-range depth. ---
    const gm = g[gmin];
    let bestTrap = Infinity;
    for (const v of minVals) {
        if (v > gm + 1e-9 && v < bestTrap) bestTrap = v;
    }
    const trapGap = Number.isFinite(bestTrap) ? bestTrap - gm : 0;

    // --- plateau fraction: |∇| < ε. Gradient is normalized-height rise over a
    //     plane-fraction run (i/(n-1) ∈ [0,1]), so ε is dimensionless — a cell is
    //     "flat" when the surface barely tilts across the whole plane there. ---
    const runStep = 1 / (n - 1);
    const eps = 0.15;
    let flat = 0;
    let counted = 0;
    for (let j = 1; j < n - 1; j++) {
        for (let i = 1; i < n - 1; i++) {
            const gw =
                (g[j * n + (i + 1)] - g[j * n + (i - 1)]) / (2 * runStep);
            const gb =
                (g[(j + 1) * n + i] - g[(j - 1) * n + i]) / (2 * runStep);
            counted++;
            if (Math.hypot(gw, gb) < eps) flat++;
        }
    }
    const plateauFrac = counted ? flat / counted : 0;

    return [
        band(
            "local minima",
            localMin,
            hard ? 3 : 2,
            Infinity,
            "restarts must matter — bump seed/pair for a bumpier surface"
        ),
        band(
            "global-basin frac",
            basinFrac,
            hard ? 0.05 : 0.1,
            hard ? 0.35 : 0.5,
            "basin too big/small — findable but not trivial"
        ),
        band(
            "saddle count",
            saddles,
            1,
            Infinity,
            "no saddle — the patience beat needs one"
        ),
        band(
            "trap gap",
            trapGap,
            hard ? 0.08 : 0.05,
            Infinity,
            "traps too shallow — escaping must move the board"
        ),
        band(
            "plateau frac",
            plateauFrac,
            0.05,
            0.5,
            "either a pancake or no flats at all"
        ),
    ];
}

/** Mean final TRUE loss for each reference program over K seeded runs, in the
    ladder order (weakest 醉猴 → strongest +jump). */
function ladderMeans(stage: StageTerrain, K: number): number[] {
    const order = ["DRUNK", "PROBE", "SCAN", "SCAN_DECAY", "FULL"] as const;
    return order.map((name, li) => {
        const prog = REFERENCE_PROGRAMS[name];
        let sum = 0;
        for (let k = 0; k < K; k++) {
            // seed offset uses the ladder INDEX (not name.length) so distinct programs
            // never share a seed via same-length names.
            sum += runProgram(
                stage,
                createRng(1000 + k * 7 + li),
                prog
            ).trueLoss;
        }
        return Math.round((sum / K) * 1000) / 1000;
    });
}

/** Minimum ladder spread (max − min mean), as a fraction of the terrain's own
    loss range (gMax − gMin). Below this the surface is effectively flat for the
    bots — every strategy scores the same and the "better ideas score better"
    ladder is vacuously ordered — so candidates under it never count as
    `ordered`, and verifyTerrain surfaces it as the 'ladder spread' band.
    Calibrated on the fixture dataset (see terrain.test.ts spread-gate tests). */
export const MIN_SPREAD_FRAC = 0.08;
/** …AND an absolute floor, in loss units. The relative gate alone is fooled by
    a degenerate near-flat candidate: its ladder spread and its loss range shrink
    TOGETHER, so the ratio still clears 8% while every bot scores the same to 3
    decimals (and the all-tied ladder passes ladderOrdered vacuously — 醉猴 "="
    max). Observed live on the fixture (mlp_b flat at 0.236 across all five
    rungs, amplitude ≈ 0.01). Dead ladders measure ~0.001; live ones ≥ 0.3 in
    BCE units, so 0.05 separates them with a wide margin either way. */
export const MIN_SPREAD_ABS = 0.05;

/** true when the reference-bot ladder is "generally accurate": the random
    walker 醉猴 (DRUNK, index 0) is the worst (max) mean, and the best (min) is
    one of the scan-descent family — SCAN / SCAN_DECAY / FULL (indices 2–4).
    That is the load-bearing pedagogical contract ("better ideas score better":
    strategy beats randomness and a scan bot wins).

    We deliberately do NOT require strict adjacent-margin monotonicity, nor that
    FULL specifically be the global min. On these honest data-derived terrains
    the frozen net converges to a single dominant basin with no deep traps
    (verified: trap gap ≈ 0 across the candidate space), so random restarts into
    the surrounding high-loss plateau are a net harm — FULL can land at or above
    SCAN_DECAY. Requiring FULL-wins would be un-satisfiable here; certifying that
    the scan family beats the wanderers is the achievable, faithful bar. */
function ladderOrdered(ladder: number[]): boolean {
    const max = Math.max(...ladder);
    const min = Math.min(...ladder);
    const descentWins =
        ladder[2] === min || ladder[3] === min || ladder[4] === min;
    return ladder[0] === max && descentWins;
}

/** Run the hardness bands + the reference-bot ladder over a stage's grid.
    Returns the per-band VerifyChecks (admin display) and the 5 ladder means
    (weakest → strongest program order). */
export function verifyTerrain(opts: VerifyOptions): {
    checks: VerifyCheck[];
    ladder: number[];
} {
    const checks = structuralChecks(opts.stage, opts.hard);
    const ladder = ladderMeans(opts.stage, opts.ladderK ?? 16);
    const range = opts.stage.gMax - opts.stage.gMin || 1;
    const spread = Math.max(...ladder) - Math.min(...ladder);
    checks.push(
        band(
            "ladder spread",
            spread,
            Math.max(MIN_SPREAD_ABS, MIN_SPREAD_FRAC * range),
            Infinity,
            "strategy barely rewarded — the surface plays flat for the bots"
        ),
        band(
            "ref-bot ladder",
            ladderOrdered(ladder) ? 1 : 0,
            1,
            1,
            "ladder not accurate — 醉猴 should score worst and a scan bot best"
        )
    );
    return { checks, ladder };
}

/* ------------------------------------------------------ scored-stage builder */

export interface BuildScoredOptions {
    H: number;
    id: StageId;
    baseSeed: number;
    /** max (seed × freezeSteps × pair) candidates to evaluate on the coarse grid
      (default 96). */
    maxCandidates?: number;
    /** ladder passes per reference program in the FINAL (full-grid) report
      (default 16). The coarse tiebreak ladder always runs at K=6 for speed. */
    ladderK?: number;
}

/** The small deterministic freeze-length set the candidate search sweeps around
    the 300-step target: a shorter 150-step freeze leaves the net short of its
    single dominant basin, so competing-neuron traps/saddles survive into the
    plane; 300 is the well-converged bowl. Each (seed × freezeSteps × pair) is one
    candidate, so this multiplies the search breadth — the maxCandidates cap keeps
    the coarse-eval budget bounded. */
const FREEZE_STEPS = [150, 300] as const;

/** Size of the coarse-search shortlist promoted to a full-resolution re-score.
    The full 201² sweep is the whole cost (~0.3 s each), so keeping SHORTLIST small
    is what holds the build to a few seconds. The shortlist is ranked by the
    LADDER quality (ordered → rungs → spread), NOT by structure: the structural
    features (saddles, traps, local minima) shift wildly between the 61² coarse and
    the 201² final grid — coarse structure actively mis-ranks — whereas the ladder
    is resolution-stable. Structure is therefore judged only at full res, in the
    stage-2 re-score. 20 is enough that both good terrains survive the coarse
    filter on the fixture: the sloped Foothills (whose modest coarse ladder-rank
    sits mid-list, below the wide-swinging output-weight pairs that lose the
    ordered gate at full res) and the trappy Range (ordered, near-flat but max
    rungs). The full re-score corrects the coarse mis-rankings. */
const SHORTLIST = 20;

/** Progress emitted by the scored-stage generator between candidates, so the
    async wrapper can drive a progress bar and cancellation without leaking the
    search internals. `done`/`total` are in abstract weighted units (coarse
    candidate = 1, shortlist re-score = 3, final sweep+verify = 8), and `phase`
    names the current step for UI copy. */
export interface BuildProgress {
    done: number;
    total: number;
    phase: "coarse" | "refine" | "final";
}

/** The one true builder, as a sync generator: it computes the two-stage search
    exactly as before and yields a BuildProgress after each unit of work. Both
    `buildScoredStage` (sync drain) and `buildScoredStageAsync` (setImmediate
    between yields, with progress + abort hooks) drive this same body, so the
    async build is byte-for-byte identical to the sync one — the yields only
    partition WHEN the identical work runs, never WHAT runs. The final `return`
    value carries the built stage + report. */
function* scoredStageSteps(
    land: LossLandscape,
    opts: BuildScoredOptions
): Generator<
    BuildProgress,
    { stage: StageTerrain; report: VerifyCheck[]; ladder: number[] }
> {
    const { H, id, baseSeed } = opts;
    const maxCandidates = opts.maxCandidates ?? 96;
    const ladderK = opts.ladderK ?? 16;
    const train = land.trainZ;
    const pairs = weightPairs(H);
    const COARSE = 61;
    const COARSE_K = 6;
    // K for the stage-2 shortlist re-score — smaller than the final report's K so
    // the 201² re-scores stay cheap; K=12 settles the ladder ordering used for
    // selection, and the winner is re-verified at the full ladderK below.
    const SELECT_K = 12;
    const hard = H >= 3;

    // total weighted work: one unit per coarse candidate, 3 per shortlist re-score,
    // 8 for the final sweep+verify (matches the measured cost profile).
    const total = maxCandidates + SHORTLIST * 3 + 8;
    let done = 0;

    interface Cand {
        seed: number;
        steps: number;
        pair: WeightPair;
        /** 1 if the ladder is accurate (醉猴 worst, descent family best). */
        ordered: number;
        /** # structural bands passed (0..5) — traps/saddles/minima richness. */
        structure: number;
        /** ladder spread (max − min mean) — how strongly strategy is rewarded. */
        spread: number;
        /** # adjacent ladder rungs correctly ordered (0..4). */
        rungs: number;
    }

    // FINAL selection (stage 2, full 201²): the ladder being ACCURATE gates
    // everything (load-bearing "better ideas score better"); among accurate
    // candidates, structural richness leads so a genuinely trappy surface wins, then
    // ladder spread (strategy still visibly rewarded), then adjacent rungs. These
    // honest data-derived surfaces rarely satisfy every band, so this maximizes how
    // many bite without ever faking the terrain.
    const better = (c: Cand, b: Cand): boolean => {
        if (c.ordered !== b.ordered) return c.ordered > b.ordered;
        if (c.structure !== b.structure) return c.structure > b.structure;
        if (Math.abs(c.spread - b.spread) > 1e-4) return c.spread > b.spread;
        return c.rungs > b.rungs;
    };

    // COARSE shortlist rank (stage 1, 61²): by ladder quality alone — ordered, then
    // adjacent rungs, then spread. Coarse structure mis-ranks (saddles/minima on the
    // coarse grid are smoothing noise that vanishes at 201²), but the ladder is
    // resolution-stable, so this reliably promotes every well-behaved candidate
    // (both the sloped Foothills seed and the flat-but-ordered trappy Range one) to
    // a full re-score, where their true structure decides the winner.
    const ladderRank = (c: Cand, b: Cand): boolean => {
        if (c.ordered !== b.ordered) return c.ordered > b.ordered;
        if (c.rungs !== b.rungs) return c.rungs > b.rungs;
        return c.spread > b.spread;
    };

    const scoreAt = (
        net: FrozenNet,
        pair: WeightPair,
        n: number,
        K: number,
        seed: number,
        steps: number
    ): Cand | null => {
        const swept = sweepGrid(net, train, pair, n);
        if (swept.gMax - swept.gMin < 1e-6) return null; // degenerate flat surface
        const stage = stageFromGrid(id, net, train, pair, swept);
        const ladder = ladderMeans(stage, K);
        const spread = Math.max(...ladder) - Math.min(...ladder);
        // flat-terrain gate: a candidate only counts as `ordered` when the ladder
        // spread clears MIN_SPREAD_FRAC of the surface's own loss range AND the
        // absolute MIN_SPREAD_ABS floor — the relative gate alone is fooled by a
        // near-flat surface whose spread and range shrink together (see the
        // MIN_SPREAD_ABS docstring); a vacuously-ordered ladder on a bot-flat
        // surface must not win selection.
        const spreadOk =
            spread >=
            Math.max(
                MIN_SPREAD_ABS,
                MIN_SPREAD_FRAC * (swept.gMax - swept.gMin)
            );
        const ordered = ladderOrdered(ladder) && spreadOk ? 1 : 0;
        const structure = structuralChecks(stage, hard).filter(
            (c) => c.pass
        ).length;
        let rungs = 0;
        for (let k = 0; k < 4; k++)
            if (ladder[k] >= ladder[k + 1] - 1e-6) rungs++;
        return { seed, steps, pair, ordered, structure, spread, rungs };
    };

    // --- stage 1: coarse-score every candidate on the fast 61² grid and keep the
    //     top SHORTLIST by ladder quality (`ladderRank`). ---
    const shortlist: Cand[] = [];
    let evaluated = 0;
    outer: for (let si = 0; si < 64; si++) {
        const seed = (baseSeed * 2654435761 + si * 40503 + 1) >>> 0;
        for (const steps of FREEZE_STEPS) {
            const net = freezeNet(train, H, seed, steps);
            for (const pair of pairs) {
                if (evaluated >= maxCandidates) break outer;
                evaluated++;
                const cand = scoreAt(net, pair, COARSE, COARSE_K, seed, steps);
                // each coarse candidate is one weighted unit (yield AFTER the work so the
                // async wrapper can abort at exactly the same boundaries a re-run would).
                done += 1;
                yield { done, total, phase: "coarse" };
                if (!cand) continue;
                if (shortlist.length < SHORTLIST) {
                    shortlist.push(cand);
                } else {
                    let worst = 0;
                    for (let k = 1; k < shortlist.length; k++)
                        if (ladderRank(shortlist[worst], shortlist[k]))
                            worst = k;
                    if (ladderRank(cand, shortlist[worst]))
                        shortlist[worst] = cand;
                }
            }
        }
    }

    // --- stage 2: re-score the shortlist at full 201² (where saddles/traps
    //     register crisply and the ladder settles at the higher K) and pick the
    //     winner there. K matches the final report so selection and report agree. ---
    let best: Cand | null = null;
    for (const s of shortlist) {
        const net = freezeNet(train, H, s.seed, s.steps);
        const r = scoreAt(net, s.pair, GN, SELECT_K, s.seed, s.steps);
        // each 201² re-score is 3 units — the expensive per-candidate work.
        done += 3;
        yield { done, total, phase: "refine" };
        if (!r) continue;
        if (!best || better(r, best)) best = r;
    }

    // fallback: if every candidate was degenerate (never happens on real data),
    // take the first seed/steps/pair so a stage always exists.
    if (!best) {
        best = {
            seed: (baseSeed * 2654435761 + 1) >>> 0,
            steps: FREEZE_STEPS[FREEZE_STEPS.length - 1],
            pair: pairs[0],
            ordered: 0,
            structure: 0,
            spread: 0,
            rungs: 0,
        };
    }

    // build the FULL 201² grid + full report once for the winning (seed, steps, pair).
    const net = freezeNet(train, H, best.seed, best.steps);
    const swept = sweepGrid(net, train, best.pair, GN);
    const stage = stageFromGrid(id, net, train, best.pair, swept);
    const { checks, ladder } = verifyTerrain({ hard, stage, ladderK });
    done = total;
    yield { done, total, phase: "final" };
    return { stage, report: checks, ladder };
}

/** Build a scored MLP stage (p4-redesign-spec §4.2). Two-stage search over
    ~maxCandidates (seed × freezeSteps × pair) combinations: a fast coarse (61²)
    pass shortlists the most promising, then each shortlisted candidate is
    re-scored at full 201² (where saddles/traps register honestly and the ladder
    settles) and the winner is picked there. The reference-bot ladder being
    ACCURATE (醉猴 worst, descent family best) is a hard gate; among accurate
    candidates the search prioritizes STRUCTURAL richness (# bands passed →
    traps/saddles), so a genuinely trappy surface wins whenever the ladder stays
    honest — this is what lets the "restarts / patience matter" pedagogy bite.
    ALWAYS returns a stage — the best-scoring candidate is the fallback so
    activation can never wedge; honest surfaces that can't form traps keep their
    best candidate and simply report those bands as "tune".

    This drains the generator synchronously — signature + output are unchanged
    (byte-for-byte deterministic; existing tests depend on the exact grids). */
export function buildScoredStage(
    land: LossLandscape,
    points: unknown, // unused; kept for signature parity with the documented brief
    opts: BuildScoredOptions
): { stage: StageTerrain; report: VerifyCheck[]; ladder: number[] } {
    void points;
    const gen = scoredStageSteps(land, opts);
    let step = gen.next();
    while (!step.done) step = gen.next();
    return step.value;
}

/* ------------------------------------------ RIGGED Range (hand-crafted brutal) */

/** A Gaussian feature carved into the plateau: `h > 0` is a dip (well), `h < 0`
    is a ridge/wall that pushes the surface up. */
interface RiggedWell {
    cx: number;
    cy: number;
    /** signed height: positive dips DOWN (a basin), negative bumps UP (a wall). */
    h: number;
    sigma: number;
}

/** A hand-crafted BRUTAL loss field for the Range stage — the "ultra hard / ultra
    rigged" surface. Unlike the honest data-derived MLP stages, this is a synthetic
    analytic loss engineered so the strategy ladder is dramatic:

      • a NARROW, DEEP global basin tucked in a far corner (small σ ⇒ tiny
        catchment), so it is essentially unreachable by luck — only restart +
        re-descent (FULL) tends to stumble into it;
      • a decoy trap sitting RIGHT on the center spawn, so greedy single-probe and
        scan descent fall straight into a mediocre minimum and settle there;
      • a ring of shallower decoy traps to strand descent that wanders off-center;
      • a corrugated HIGH plateau everywhere else, so the random walker (醉猴) ends
        each run stranded up on the ridges (worst mean by a wide margin).

    The load-bearing structure (global basin + center trap) is FIXED so every
    re-roll stays brutal and correctly ordered; the decoy traps and the corrugation
    phase jitter by seed so re-rolls still look different. */
function riggedField(seed: number): {
    loss: (w: number, b: number) => number;
    noiseAmp: (L: number) => number;
} {
    // seeded xorshift in [0,1) for mild layout jitter.
    let s = (seed * 2246822519 + 1) >>> 0 || 0x9e3779b9;
    const rnd = () => {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;
        s >>>= 0;
        return s / 4294967296;
    };
    const jit = (a: number) => (rnd() * 2 - 1) * a;

    // A dozen scattered SHARP features — alternating deep pits (h > 0) and jagged
    // peaks (h < 0), narrow σ so they spike rather than roll. Seed-placed across the
    // plane so the surface is a chaotic mountain range, nothing like a bowl.
    const wells: RiggedWell[] = [];
    for (let k = 0; k < 12; k++) {
        wells.push({
            cx: -3.4 + rnd() * 6.8,
            cy: -3.4 + rnd() * 6.8,
            // alternate sign so pits and peaks interleave; magnitudes stay big.
            h: (k % 2 === 0 ? 1 : -1) * (0.7 + rnd() * 0.7),
            sigma: 0.35 + rnd() * 0.5,
        });
    }
    // GLOBAL optimum — a brutally deep, narrow spike jammed into a far corner, so
    // the true min is a needle in the chaos, nowhere near the center spawn. FIXED.
    const gx = 2.7 + jit(0.3);
    const gy = -2.7 + jit(0.3);
    wells.push({ cx: gx, cy: gy, h: 2.4, sigma: 0.4 });
    // …ringed by a sharp crater WALL so even landing near it, you fall off the edge.
    wells.push({ cx: gx, cy: gy, h: -1.1, sigma: 1.0 });

    const loss = (w: number, b: number) => {
        // layered multi-frequency corrugation + concentric ripples = a jagged,
        // terrifying, deeply non-convex surface with peaks and pits everywhere.
        let L = 1.35;
        L += 0.4 * Math.sin(1.4 * w + 0.4) * Math.cos(1.7 * b - 0.3);
        L += 0.26 * Math.sin(2.6 * w - 0.5) * Math.sin(2.3 * b + 0.7);
        L += 0.17 * Math.cos(3.7 * w + 1.1) * Math.cos(3.1 * b - 0.9);
        L += 0.1 * Math.sin(5.3 * w) * Math.sin(4.9 * b + 0.2);
        // concentric shock rings emanating from the spawn.
        L += 0.22 * Math.sin(2.1 * Math.hypot(w, b) - 1.0);
        for (const wl of wells) {
            const d2 = (w - wl.cx) ** 2 + (b - wl.cy) ** 2;
            L -= wl.h * Math.exp(-d2 / (2 * wl.sigma * wl.sigma));
        }
        return Math.max(0.02, L);
    };
    // batch=1 reading noise: modest, loss-scaled, so readings stay honestly jittery.
    const noiseAmp = (L: number) => 0.07 + 0.05 * L;
    return { loss, noiseAmp };
}

/** Build the rigged Range stage: fill the 201² grid from the analytic field, wrap
    it as a `StageTerrain` (same contract as the MLP stages), and run the standard
    hardness harness for the admin report + ladder. Fully synthetic — takes no
    dataset, only the re-roll-derived seed. */
export function buildRiggedRange(seed: number): {
    stage: StageTerrain;
    report: VerifyCheck[];
    ladder: number[];
} {
    const { loss, noiseAmp } = riggedField(seed);
    const n = GN;
    const grid = new Float32Array(n * n);
    let gMin = Infinity;
    let gMax = -Infinity;
    for (let bi = 0; bi < n; bi++) {
        const b = coordOf(bi, n);
        for (let wi = 0; wi < n; wi++) {
            const L = loss(coordOf(wi, n), b);
            grid[bi * n + wi] = L;
            if (L < gMin) gMin = L;
            if (L > gMax) gMax = L;
        }
    }
    const e = 8 / (n - 1);
    // symmetric ~gaussian in [-1.5, 1.5] from three uniforms.
    const g3 = (rng: Rng) => rng() + rng() + rng() - 1.5;
    const stage: StageTerrain = {
        id: "mlp_b",
        GN: n,
        grid,
        gMin,
        gMax,
        clampG,
        lossAt: (w, b) => loss(clampG(w), clampG(b)),
        sample: (w, b, rng) => {
            const L = loss(clampG(w), clampG(b));
            return Math.max(0.001, L + g3(rng) * noiseAmp(L));
        },
        gradSample: (w, b, rng) => {
            const W = clampG(w);
            const B = clampG(b);
            const at = (x: number, y: number) =>
                loss(x, y) + g3(rng) * noiseAmp(loss(x, y));
            return {
                dw: (at(W + e, B) - at(W - e, B)) / (2 * e),
                db: (at(W, B + e) - at(W, B - e)) / (2 * e),
            };
        },
    };
    const { checks, ladder } = verifyTerrain({ hard: true, stage });
    return { stage, report: checks, ladder };
}

/** Async twin of `buildRiggedRange`, matching `buildScoredStageAsync`'s hook shape
    so `store.ts` can drop it in for the Range build. The synthetic build is nearly
    instant; the one `setImmediate` keeps the event loop breathing while the
    harness ladder runs. */
export async function buildRiggedRangeAsync(
    seed: number,
    hooks?: {
        onProgress?: (p: BuildProgress) => void;
        shouldAbort?: () => boolean;
    }
): Promise<{ stage: StageTerrain; report: VerifyCheck[]; ladder: number[] }> {
    if (hooks?.shouldAbort?.()) throw new Error("aborted");
    hooks?.onProgress?.({ done: 1, total: 3, phase: "coarse" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (hooks?.shouldAbort?.()) throw new Error("aborted");
    const out = buildRiggedRange(seed);
    hooks?.onProgress?.({ done: 3, total: 3, phase: "final" });
    return out;
}

/** Async twin of `buildScoredStage`: identical computation, but awaits a
    `setImmediate` between generator steps so the Node event loop breathes (joins,
    /state polls, Vite serving all stay responsive during the ~19 s build).
    `onProgress` fires with each BuildProgress; `shouldAbort` is checked at each
    yield and, when true, the generator is closed and the promise rejects with
    `Error('aborted')` so a re-import/re-roll mid-build unwinds promptly. */
export async function buildScoredStageAsync(
    land: LossLandscape,
    points: unknown,
    opts: BuildScoredOptions,
    hooks?: {
        onProgress?: (p: BuildProgress) => void;
        shouldAbort?: () => boolean;
    }
): Promise<{ stage: StageTerrain; report: VerifyCheck[]; ladder: number[] }> {
    void points;
    const gen = scoredStageSteps(land, opts);
    let step = gen.next();
    while (!step.done) {
        if (hooks?.shouldAbort?.()) {
            gen.return(undefined as never);
            throw new Error("aborted");
        }
        hooks?.onProgress?.(step.value);
        await new Promise<void>((resolve) => setImmediate(resolve));
        step = gen.next();
    }
    return step.value;
}
