/* Data pipeline: CSV import (§4.1 clean) + synthetic generation (§4.2/4.3) +
   verification harness (§4.4). Pure numeric TS; no Prisma import so it stays
   unit-testable. The server-fn/route layer persists the resulting bundle.

   Reduced feature universe: the TS app uses the 9 Sleep features + LABEL_OWL
   (see types.ts), so this pipeline targets that schema. A CSV may carry a
   LABEL_OWL column directly; if absent we derive a proxy owl label from the
   sleep-signal composite (documented — the full SLEEP_MED derivation of §2.1
   needs raw bedtime slots the app doesn't model). */

import {
    detectCsvFormat,
    mapHeaders,
    parseBedtimeLateness,
    parseLeadingNum,
    positionalMap,
} from "../csv-schema";
import { WEDGE_MEANS, makePseudos } from "../dataset-shared";
import { CANONICAL_X, CANONICAL_Y, COLS, FEATURES } from "../features";
import { LossLandscape } from "../lossgrid";
import { createRng } from "../rng";
import type {
    BalanceReport,
    ClassLabel,
    DataPoint,
    FeatureKey,
    FeatureStat,
    FeatureValues,
    GenerateReport,
    RealRow,
    VerifyCheck,
} from "../types";

/* ---------- tiny CSV parser (handles quotes + commas) ---------- */

export function parseCsv(text: string): Record<string, string>[] {
    const rows: string[][] = [];
    let field = "";
    let row: string[] = [];
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else inQ = false;
            } else field += c;
        } else if (c === '"') inQ = true;
        else if (c === ",") {
            row.push(field);
            field = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field);
            field = "";
            if (row.some((f) => f.trim() !== "")) rows.push(row);
            row = [];
        } else field += c;
    }
    if (field !== "" || row.length) {
        row.push(field);
        if (row.some((f) => f.trim() !== "")) rows.push(row);
    }
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim());
    return rows.slice(1).map((r) => {
        const o: Record<string, string> = {};
        header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
        return o;
    });
}

/* ---------- numeric hygiene (§4.1 step 3) ---------- */

function toNum(raw: string | undefined): number | null {
    const s = (raw ?? "").trim();
    if (!s) return null;
    if (s === "∞" || s.toLowerCase() === "inf" || s === "無") return Infinity;
    const cleaned = s.replace(/[^0-9.-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const v = Number(cleaned);
    return Number.isFinite(v) ? v : null;
}

function median(vals: number[]): number {
    if (!vals.length) return 0;
    const s = [...vals].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ---------- CSV → realRows rows + balance report (§4.1) ---------- */

export interface CleanResult {
    realRows: RealRow[];
    report: BalanceReport;
}

function clampFeat(key: FeatureKey, v: number): number {
    const m = FEATURES[key];
    const x = v === Infinity ? m.max : v;
    return Math.max(m.min, Math.min(m.max, Math.round(x)));
}

/** Clean a survey CSV into labeled rows. Missing numerics → column median;
    ∞ / out-of-range → clamped; label taken from LABEL_OWL or derived. */
export function cleanRealCsv(csvText: string, seed = 7): CleanResult {
    const raw = parseCsv(csvText);
    if (!raw.length) throw new Error("empty CSV");
    const headers = Object.keys(raw[0]);
    // codename contract vs. raw Google-Form export (mapped by column order).
    const format = detectCsvFormat(headers);
    const pos = format === "positional" ? positionalMap(headers) : null;
    const hmap: Partial<Record<FeatureKey | "LABEL_OWL", string>> = pos
        ? pos.feats
        : mapHeaders(headers);
    // positional cells are Google-Form "N + label" options / free numbers → read
    // the leading numeric token; the codename path keeps its numeric-hygiene parse.
    const numOf = pos ? parseLeadingNum : toNum;
    const droppedRows = Math.max(
        0,
        csvText.split(/\r?\n/).filter((l) => l.trim() !== "").length -
            1 -
            raw.length
    );

    // shuffle (drop any submission-order signal, §1) with a seeded RNG.
    const rng = createRng(seed);
    const rows = [...raw];
    for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
    }

    // per-column numeric parse + median fill.
    const cols: Partial<Record<FeatureKey, number[]>> = {};
    const parsed = rows.map((r) => {
        const out: Partial<Record<FeatureKey, number | null>> = {};
        COLS.forEach((k) => {
            const v = numOf(r[hmap[k] ?? k]);
            out[k] = v;
            if (v != null && v !== Infinity) (cols[k] ??= []).push(v);
        });
        return out;
    });
    const meds = {} as Record<FeatureKey, number>;
    COLS.forEach((k) => (meds[k] = median(cols[k] ?? [])));

    let fixedCells = 0;
    const feats: FeatureValues[] = parsed.map((p) => {
        const f = {} as FeatureValues;
        COLS.forEach((k) => {
            const v = p[k];
            const m = FEATURES[k];
            if (v == null || v === Infinity || v < m.min || v > m.max)
                fixedCells++;
            f[k] = clampFeat(k, v == null ? meds[k] : v);
        });
        return f;
    });

    // labels. positional (Google-Form): split the class at the median of the
    // average-bedtime column — later than median → owl. Codename: explicit
    // LABEL_OWL 0/1 column if present, else the sleep-composite proxy.
    let labels: ClassLabel[];
    if (pos) {
        labels = bedtimeLabels(rows, pos.bedtimeHeader) ?? deriveOwl(feats);
    } else {
        const explicit = rows.map((r) =>
            toNum(r[hmap.LABEL_OWL ?? "LABEL_OWL"])
        );
        const hasExplicit = explicit.every((v) => v === 0 || v === 1);
        labels = hasExplicit
            ? explicit.map((v) => (v === 1 ? 1 : 0))
            : deriveOwl(feats);
    }

    const pseudos = makePseudos(rng, feats.length);
    const realRows: RealRow[] = feats.map((f, i) => ({
        id: "r" + i,
        pseudo: pseudos[i],
        feats: f,
        label: labels[i],
        real: true,
    }));

    return {
        realRows,
        report: { ...balanceReport(realRows), droppedRows, fixedCells },
    };
}

/** Owl label from the average-bedtime column (Google-Form / positional import):
    parse each row's bedtime to a lateness score, split the class at the median
    (later than median → owl). Returns null — so the caller falls back to the
    sleep-composite proxy — when the column is absent or under half the rows
    parse. Unparseable rows in an otherwise-good column fill with the median. */
function bedtimeLabels(
    rows: Record<string, string>[],
    bedtimeHeader: string | null
): ClassLabel[] | null {
    if (!bedtimeHeader) return null;
    const late = rows.map((r) => parseBedtimeLateness(r[bedtimeHeader]));
    const known = late.filter((v): v is number => v != null);
    if (known.length < rows.length / 2) return null;
    const cut = median(known);
    return late.map((v) => ((v ?? cut) > cut ? 1 : 0));
}

/** Proxy owl label: standardized sleep-signal composite, split at its median.
    Higher screen/caffeine/late-nights/snacks/late-shower + lower early-wake/
    breakfast → owl. Only used when the CSV lacks an explicit LABEL_OWL. */
function deriveOwl(feats: FeatureValues[]): ClassLabel[] {
    const dir: Partial<Record<FeatureKey, number>> = {
        SCREEN_AVG: 1,
        CAFFEINE: 1,
        LATE7: 1,
        SNACK_DAYS: 1,
        LATE_SHOWER: 1,
        DND_START: 1,
        EARLY_WAKE: -1,
        BREAKFAST: -1,
        GAME_HRS: 0.5,
    };
    const stats = COLS.map((k) => {
        const xs = feats.map((f) => f[k]);
        const m = xs.reduce((s, v) => s + v, 0) / xs.length;
        const sd =
            Math.sqrt(
                xs.reduce((s, v) => s + (v - m) * (v - m), 0) / xs.length
            ) || 1;
        return { k, m, sd };
    });
    const score = feats.map((f) =>
        stats.reduce(
            (s, { k, m, sd }) => s + (dir[k] ?? 0) * ((f[k] - m) / sd),
            0
        )
    );
    const cut = median(score);
    return score.map((s) => (s > cut ? 1 : 0));
}

/* Healthy label balance as a fraction of the labelled total, not an absolute
   count. The band derives from the old 20–28 count band over the nominal 48-row
   survey, so at n=48 it reproduces the previous thresholds, but it now scales to
   any total (a perfectly even 15/15 split is no longer flagged just for being
   small). Only the upper bound binds — the majority fraction is always ≥ 0.5. */
const NOMINAL_ROWS = 48;
const BALANCE_MAJORITY_MAX = 28 / NOMINAL_ROWS; // ≈ 0.583
const BALANCE_MAJORITY_MIN = 20 / NOMINAL_ROWS; // ≈ 0.417 (symmetric floor)

function balanceReport(rows: RealRow[]): BalanceReport {
    const owl = rows.filter((r) => r.label === 1).length;
    const early = rows.length - owl;
    const total = owl + early;
    const better = Math.max(owl, early);
    const majorityFrac = total ? better / total : 1;
    const balanced =
        majorityFrac >= BALANCE_MAJORITY_MIN &&
        majorityFrac <= BALANCE_MAJORITY_MAX;
    const features: FeatureStat[] = COLS.map((k) => {
        const c0 = rows.filter((r) => r.label === 0).map((r) => r.feats[k]);
        const c1 = rows.filter((r) => r.label === 1).map((r) => r.feats[k]);
        return {
            key: k,
            meanClass0: mean(c0),
            meanClass1: mean(c1),
            r: pointBiserial(
                rows.map((r) => r.feats[k]),
                rows.map((r) => r.label!)
            ),
        };
    });
    return {
        n: rows.length,
        ownlCount: owl,
        earlyCount: early,
        balanced,
        warning: balanced
            ? null
            : `label split ${owl}/${early} (majority ${Math.round(majorityFrac * 100)}%) outside healthy ${Math.round(
                  BALANCE_MAJORITY_MIN * 100
              )}–${Math.round(BALANCE_MAJORITY_MAX * 100)}% band`,
        features,
    };
}

/* ---------- synthetic generation (§4.3) ---------- */

export interface GenerateOpts {
    strategy?: "wedge" | "linear" | "blobs";
    sep?: number;
    noise?: number;
    mix?: number;
    flip?: number;
    seed?: number;
    reveal?: number;
    hidden?: number;
}

type Arch = "a1" | "a2" | "none";

/** archetype canonical means in z-space per strategy (spec §4.3 defaults). */
function archMeans(strategy: string): Record<Arch, [number, number]> {
    if (strategy === "linear") {
        return { a1: [1.1, 1.1], a2: [1.1, 1.1], none: [-1.0, -1.0] };
    }
    if (strategy === "blobs") {
        return { a1: [1.4, -0.6], a2: [-0.6, 1.4], none: [-0.9, -0.9] };
    }
    // wedge (OR shape): one class is two spurs, the other a single corner blob.
    return WEDGE_MEANS;
}

export interface GenResult {
    points: DataPoint[];
    report: GenerateReport;
}

/** Generate synthetic points anchored to the realRows canonical stats, then run
    the §4.4 verification harness on the hidden slice. */
export function generateSynth(
    realRows: RealRow[],
    opts: GenerateOpts = {}
): GenResult {
    const strategy = opts.strategy ?? "wedge";
    const sep = opts.sep ?? 1;
    const noise = opts.noise ?? 1.3;
    const mix = opts.mix ?? 0.55;
    const flip = opts.flip ?? 0.05;
    const seed = opts.seed ?? 7;
    const nReveal = opts.reveal ?? 100;
    const nHidden = opts.hidden ?? 400;

    // anchor canonical raw stats from the real data.
    const anchor = (k: FeatureKey) => {
        const xs = realRows.map((r) => r.feats[k]);
        const m = mean(xs);
        const sd =
            Math.sqrt(
                xs.reduce((s, v) => s + (v - m) * (v - m), 0) / xs.length
            ) || 1;
        return { m, sd };
    };
    const ax = anchor(CANONICAL_X);
    const ay = anchor(CANONICAL_Y);

    // per-feature class-conditional anchors for the non-canonical features.
    const nonCanon = COLS.filter((k) => k !== CANONICAL_X && k !== CANONICAL_Y);
    const condStats = nonCanon.map((k) => {
        const g = (lab: ClassLabel) => {
            const xs = realRows
                .filter((r) => r.label === lab)
                .map((r) => r.feats[k]);
            const m = mean(xs);
            const sd =
                Math.sqrt(
                    xs.reduce((s, v) => s + (v - m) * (v - m), 0) /
                        (xs.length || 1)
                ) || 1;
            return { m, sd };
        };
        return { k, c0: g(0), c1: g(1) };
    });

    const means = archMeans(strategy);
    const rng = createRng(seed);

    const sampleOne = (cls: ClassLabel, arch: Arch): FeatureValues => {
        const [mzx, mzy] = means[arch];
        const zx = mzx * sep + rng.gauss() * 0.55;
        const zy = mzy * sep + rng.gauss() * 0.55;
        const f = {} as FeatureValues;
        f[CANONICAL_X] = clampFeat(CANONICAL_X, ax.m + zx * ax.sd);
        f[CANONICAL_Y] = clampFeat(CANONICAL_Y, ay.m + zy * ay.sd);
        condStats.forEach(({ k, c0, c1 }) => {
            const base = cls === 1 ? c1 : c0;
            f[k] = clampFeat(k, base.m + rng.gauss() * base.sd * noise);
        });
        return f;
    };

    const mk = (n: number, hidden: boolean, idBase: string): DataPoint[] => {
        const out: DataPoint[] = [];
        for (let i = 0; i < n; i++) {
            const cls: ClassLabel = rng() < 0.5 ? 1 : 0;
            const arch: Arch = cls === 1 ? (rng() < mix ? "a1" : "a2") : "none";
            let lab: ClassLabel = cls;
            if (rng() < flip) lab = (1 - lab) as ClassLabel;
            out.push({
                id: idBase + i,
                feats: sampleOne(cls, arch),
                label: lab,
                real: false,
                hidden,
                jx: rng() - 0.5,
                jy: rng() - 0.5,
            });
        }
        return out;
    };

    const realPts: DataPoint[] = realRows.map((r) => ({
        id: r.id,
        feats: r.feats,
        label: r.label,
        real: true,
        hidden: false,
        jx: rng() - 0.5,
        jy: rng() - 0.5,
    }));
    const reveal = mk(nReveal, false, "s");
    const hidden = mk(nHidden, true, "h");
    const points = [...realPts, ...reveal, ...hidden];

    return {
        points,
        report: {
            strategy,
            seed,
            synthCount: nReveal + nHidden,
            revealCount: nReveal,
            hiddenCount: nHidden,
            ...verify(points),
        },
    };
}

/* ---------- verification harness (§4.4 subset) ---------- */

function verify(points: DataPoint[]): {
    checks: VerifyCheck[];
    passedAll: boolean;
} {
    const hidden = points.filter((p) => p.hidden);
    const land = new LossLandscape(points);

    // one-line ceiling: accuracy of the loss-minimizing (w*,b*) line on hidden.
    const oneLine = lineAccuracy(land, hidden);
    // kNN(9) on canonical 2-D (train on visible, test on hidden).
    const train = points.filter((p) => !p.hidden);
    const knn = knnAccuracy(train, hidden, 9);
    // balance on the hidden slice.
    const owl = hidden.filter((p) => p.label === 1).length;
    const bal = hidden.length ? owl / hidden.length : 0;
    // solo-feature AUC over non-canonical features.
    const nonCanon = COLS.filter((k) => k !== CANONICAL_X && k !== CANONICAL_Y);
    const aucs = nonCanon.map((k) => aucFeature(hidden, k));
    const maxAuc = Math.max(...aucs);
    const strongCount = aucs.filter((a) => a >= 0.62).length;

    const checks: VerifyCheck[] = [
        band(
            "one-line ceiling",
            oneLine,
            0.83,
            0.87,
            "tune --sep (↑ raises separation)"
        ),
        band(
            "kNN(9) ceiling",
            knn,
            0,
            oneLine + 0.08,
            "circles should not dominate the two-line ceiling"
        ),
        band("balance (owl frac)", bal, 0.46, 0.54, "adjust class mixing"),
        band(
            "max solo-feature AUC",
            maxAuc,
            0,
            0.85,
            "no non-canonical shortcut allowed"
        ),
        band(
            "signal features (AUC≥.62)",
            strongCount,
            6,
            Infinity,
            "raise per-feature separation / lower --noise"
        ),
    ];
    return { checks, passedAll: checks.every((c) => c.pass) };
}

function band(
    name: string,
    value: number,
    lo: number,
    hi: number,
    hint: string
): VerifyCheck {
    const pass = value >= lo && value <= hi;
    return {
        name,
        value: Math.round(value * 1000) / 1000,
        lo,
        hi,
        pass,
        hint: pass ? "" : hint,
    };
}

function lineAccuracy(land: LossLandscape, pts: DataPoint[]): number {
    // recover (w*,b*) argmin from the grid, then classify by sign of the margin.
    const N = land.GN;
    let am = 0;
    let mn = Infinity;
    for (let i = 0; i < land.grid.length; i++) {
        if (land.grid[i] < mn) {
            mn = land.grid[i];
            am = i;
        }
    }
    const w = -4 + (8 * (am % N)) / (N - 1);
    const b = -4 + (8 * Math.floor(am / N)) / (N - 1);
    const z = land.zStats;
    let ok = 0;
    pts.forEach((p) => {
        const x = (p.feats[CANONICAL_X] - z.mx) / z.sx;
        const y = (p.feats[CANONICAL_Y] - z.my) / z.sy;
        const pred = y - (w * x + b) > 0 ? 1 : 0;
        if (pred === p.label) ok++;
    });
    return pts.length ? ok / pts.length : 0;
}

function knnAccuracy(train: DataPoint[], test: DataPoint[], k: number): number {
    const feat = (p: DataPoint) => [p.feats[CANONICAL_X], p.feats[CANONICAL_Y]];
    // normalize by train ranges for a fair distance.
    const xr = FEATURES[CANONICAL_X].max - FEATURES[CANONICAL_X].min || 1;
    const yr = FEATURES[CANONICAL_Y].max - FEATURES[CANONICAL_Y].min || 1;
    let ok = 0;
    test.forEach((t) => {
        const [tx, ty] = feat(t);
        const near = train
            .map((p) => {
                const [px, py] = feat(p);
                return {
                    d: ((tx - px) / xr) ** 2 + ((ty - py) / yr) ** 2,
                    l: p.label!,
                };
            })
            .sort((a, b) => a.d - b.d)
            .slice(0, k);
        const owl = near.filter((n) => n.l === 1).length;
        if ((owl > k / 2 ? 1 : 0) === t.label) ok++;
    });
    return test.length ? ok / test.length : 0;
}

/** AUC of a single feature vs the label (rank statistic; direction-agnostic). */
function aucFeature(pts: DataPoint[], k: FeatureKey): number {
    const pos = pts.filter((p) => p.label === 1).map((p) => p.feats[k]);
    const neg = pts.filter((p) => p.label === 0).map((p) => p.feats[k]);
    if (!pos.length || !neg.length) return 0.5;
    let wins = 0;
    pos.forEach((a) =>
        neg.forEach((b) => (wins += a > b ? 1 : a === b ? 0.5 : 0))
    );
    const auc = wins / (pos.length * neg.length);
    return Math.max(auc, 1 - auc);
}

/* ---------- small stats helpers ---------- */

function mean(a: number[]): number {
    return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}

function pointBiserial(x: number[], y: number[]): number {
    const m = mean(x);
    const sd = Math.sqrt(mean(x.map((v) => (v - m) * (v - m)))) || 1;
    const p1 = y.filter((v) => v === 1);
    const n1 = p1.length;
    const n0 = y.length - n1;
    if (!n1 || !n0) return 0;
    const m1 = mean(x.filter((_, i) => y[i] === 1));
    const m0 = mean(x.filter((_, i) => y[i] === 0));
    const prop = (n1 / y.length) * (n0 / y.length);
    return ((m1 - m0) / sd) * Math.sqrt(prop);
}
