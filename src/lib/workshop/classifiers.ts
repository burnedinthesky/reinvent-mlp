/* Hand-drawn classifiers: P2 circle/region voting + the P2/P3 line boundaries.
   Ported from predictPoint / lineSide. Pure — used both for the live
   visible-accuracy mirror and for server-side scoring. */

import { CANONICAL_X, CANONICAL_Y, FEATURES } from "./features";
import type { ZStats } from "./lossgrid";
import type {
    CircleRegion,
    CirclesView,
    ClassLabel,
    DataPoint,
    FeatureKey,
    LineModel,
} from "./types";

/* ---------- P2 circles ---------- */

type Pt = { x: number; y: number };

/** even-odd ray-cast point-in-polygon; coordinate-space agnostic. */
export function pointInPolygon(px: number, py: number, pts: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if (
            a.y > py !== b.y > py &&
            px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x
        ) {
            inside = !inside;
        }
    }
    return inside;
}

/** vertex average — used for tie-break distance and scroll-scaling. */
export function polygonCentroid(pts: Pt[]): Pt {
    let sx = 0;
    let sy = 0;
    pts.forEach((p) => {
        sx += p.x;
        sy += p.y;
    });
    const n = pts.length || 1;
    return { x: sx / n, y: sy / n };
}

function predictCircles(
    p: DataPoint,
    view: { x: FeatureKey; y: FeatureKey; circles: CircleRegion[] },
    defaultCls: ClassLabel
): ClassLabel {
    const vx = p.feats[view.x];
    const vy = p.feats[view.y];
    const xr = FEATURES[view.x].max - FEATURES[view.x].min;
    const yr = FEATURES[view.y].max - FEATURES[view.y].min;
    const inside = view.circles.filter((c) => pointInPolygon(vx, vy, c.pts));
    if (!inside.length) return defaultCls;
    const has1 = inside.some((c) => c.cls === 1);
    const has0 = inside.some((c) => c.cls === 0);
    if (has1 && has0) {
        let best: CircleRegion | null = null;
        let bd = Infinity;
        inside.forEach((c) => {
            const ct = polygonCentroid(c.pts);
            const d = Math.hypot((vx - ct.x) / xr, (vy - ct.y) / yr);
            if (d < bd) {
                bd = d;
                best = c;
            }
        });
        return best!.cls;
    }
    return has1 ? 1 : 0;
}

export function circlesAccuracy(
    points: DataPoint[],
    view: { x: FeatureKey; y: FeatureKey; circles: CircleRegion[] },
    defaultCls: ClassLabel,
    filter: (p: DataPoint) => boolean
): number {
    const set = points.filter(filter);
    if (!set.length) return 0;
    let ok = 0;
    set.forEach((p) => {
        if (predictCircles(p, view, defaultCls) === p.label) ok++;
    });
    return ok / set.length;
}

/** Majority vote across independent views. Each view always votes (inside a
    lasso → that class, outside all → defaultCls); the plurality wins and ties
    fall back to defaultCls. Reduces to predictCircles for a single view. */
export function predictCirclesMulti(
    p: DataPoint,
    views: CirclesView[],
    defaultCls: ClassLabel
): ClassLabel {
    if (!views.length) return defaultCls;
    let v1 = 0;
    for (const view of views) {
        if (predictCircles(p, view, defaultCls) === 1) v1++;
    }
    const v0 = views.length - v1;
    if (v1 === v0) return defaultCls;
    return v1 > v0 ? 1 : 0;
}

export function circlesMultiAccuracy(
    points: DataPoint[],
    views: CirclesView[],
    defaultCls: ClassLabel,
    filter: (p: DataPoint) => boolean
): number {
    const set = points.filter(filter);
    if (!set.length) return 0;
    let ok = 0;
    set.forEach((p) => {
        if (predictCirclesMulti(p, views, defaultCls) === p.label) ok++;
    });
    return ok / set.length;
}

/* ---------- P2 line (y = wx·x + b) ---------- */

/** Slope-intercept classifier over the two view axes, each normalized to [0,1]
    by its feature range. A point above the boundary line y = wx·x + b is class 1
    (Owl), below is class 0 (Early). Pure — shared by the client live mirror and
    server scoring. */
export function predictLine(
    p: DataPoint,
    x: FeatureKey,
    y: FeatureKey,
    line: LineModel
): ClassLabel {
    const nx =
        (p.feats[x] - FEATURES[x].min) / (FEATURES[x].max - FEATURES[x].min);
    const ny =
        (p.feats[y] - FEATURES[y].min) / (FEATURES[y].max - FEATURES[y].min);
    return ny > line.wx * nx + line.b ? 1 : 0;
}

/* ---------- P3 line (z-scored y_z = w·x_z + b) ---------- */

/** P3's slope-intercept classifier over the canonical axes standardized to the
    loss-landscape's z-scored space (x_z = (feat − mean)/std). A point above the
    boundary y_z = w·x_z + b is class 1 (Owl). Uses the SAME parameterization and
    sign convention as LossLandscape, so the client boundary/accuracy and the
    server's loss/score agree exactly. Pure — shared by both sides. */
export function predictZ(
    p: DataPoint,
    z: ZStats,
    w: number,
    b: number
): ClassLabel {
    const xz = (p.feats[CANONICAL_X] - z.mx) / z.sx;
    const yz = (p.feats[CANONICAL_Y] - z.my) / z.sy;
    return yz > w * xz + b ? 1 : 0;
}

/** Mean logistic loss for the z-scored line y_z = w·x_z + b over the given
    points. Uses the exact per-point margin + clamping as LossLandscape, so the
    client's live P3 loss reads on the same scale as the server's judged
    landscape loss. Caller passes the labeled set to score against. */
export function lineLossZ(
    points: DataPoint[],
    z: ZStats,
    w: number,
    b: number
): number {
    if (!points.length) return 0;
    let L = 0;
    for (const p of points) {
        const xz = (p.feats[CANONICAL_X] - z.mx) / z.sx;
        const yz = (p.feats[CANONICAL_Y] - z.my) / z.sy;
        const s = p.label === 1 ? 1 : -1;
        const m = s * (yz - (w * xz + b));
        L += m > 30 ? 0 : m < -30 ? -m : Math.log(1 + Math.exp(-m));
    }
    return L / points.length;
}

/** Mean logistic loss for the line model over the filtered set, on the same
    [0,1]-normalized axes predictLine uses. Margin m = s·(ny − (wx·nx + b)) with
    s = +1 (Owl) / −1 (Early); loss = softplus(−m). Matches the P3/P4 loss grid
    convention so the number a student sees here reads the same downstream. */
export function lineLoss(
    points: DataPoint[],
    x: FeatureKey,
    y: FeatureKey,
    line: LineModel,
    filter: (p: DataPoint) => boolean
): number {
    const set = points.filter(filter);
    if (!set.length) return 0;
    let L = 0;
    set.forEach((p) => {
        const nx =
            (p.feats[x] - FEATURES[x].min) /
            (FEATURES[x].max - FEATURES[x].min);
        const ny =
            (p.feats[y] - FEATURES[y].min) /
            (FEATURES[y].max - FEATURES[y].min);
        const s = p.label === 1 ? 1 : -1;
        const m = s * (ny - (line.wx * nx + line.b));
        L += m > 30 ? 0 : m < -30 ? -m : Math.log(1 + Math.exp(-m));
    });
    return L / set.length;
}
