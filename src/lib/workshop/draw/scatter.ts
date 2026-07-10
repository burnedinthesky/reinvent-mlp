/* Shared scatter-plot geometry + frame drawing (ported from viewGeom /
   drawPlotFrame / regionPx / ptPix). Feature-space ↔ pixel-space conversions and
   the gridded axes frame are reused by P2, P5 and the MLP playground. */

import type { ZStats } from "../lossgrid";
import { CANVAS, CLASS_COLOR, CLASS_FILL, FONT_MONO } from "../theme";
import type {
    CircleRegion,
    DataPoint,
    FeatureKey,
    FeatureMeta,
} from "../types";

export interface PlotGeom {
    l: number;
    r: number;
    t: number;
    b: number;
    pw: number;
    ph: number;
    xm: FeatureMeta;
    ym: FeatureMeta;
}

export function plotGeom(
    view: { x: FeatureKey; y: FeatureKey },
    W: number,
    H: number,
    features: Record<FeatureKey, FeatureMeta>
): PlotGeom {
    const l = 58;
    const r = 20;
    const t = 20;
    const b = 48;
    return {
        l,
        r,
        t,
        b,
        pw: W - l - r,
        ph: H - t - b,
        xm: features[view.x],
        ym: features[view.y],
    };
}

const dx2px = (v: number, g: PlotGeom) =>
    g.l + ((v - g.xm.min) / (g.xm.max - g.xm.min)) * g.pw;
const dy2px = (v: number, g: PlotGeom) =>
    g.t + (1 - (v - g.ym.min) / (g.ym.max - g.ym.min)) * g.ph;
export const px2dx = (x: number, g: PlotGeom) =>
    g.xm.min + ((x - g.l) / g.pw) * (g.xm.max - g.xm.min);
export const px2dy = (y: number, g: PlotGeom) =>
    g.ym.min + (1 - (y - g.t) / g.ph) * (g.ym.max - g.ym.min);

/** pixel polygon of a feature-space region (bottom-left origin → top-left pixels). */
export function regionPathPx(c: CircleRegion, g: PlotGeom): [number, number][] {
    return c.pts.map((p) => [dx2px(p.x, g), dy2px(p.y, g)]);
}

/** point pixel position, with deterministic jitter on ordinal (cnt7) axes. */
export function pointPx(
    p: DataPoint,
    view: { x: FeatureKey; y: FeatureKey },
    g: PlotGeom
): [number, number] {
    let vx = p.feats[view.x];
    let vy = p.feats[view.y];
    if (g.xm.cnt7) vx += p.jx * 0.34;
    if (g.ym.cnt7) vy += p.jy * 0.34;
    return [dx2px(vx, g), dy2px(vy, g)];
}

/* P3 decision boundary for the z-scored line y_z = w·x_z + b (x_z = (feat−mean)/
   std). The boundary is affine in feature space, so we split the plot rect by
   the sign of the canonical score (>0 = owl / class 1), tint each half-plane and
   stroke the boundary. Scored through px2dx/px2dy + zStats so it lands exactly on
   predictZ's decisions. Mirrors P2's drawBoundary but in z-space over fixed axes. */
export function drawZBoundary(
    ctx: CanvasRenderingContext2D,
    g: PlotGeom,
    z: ZStats,
    w: number,
    b: number
) {
    const scorePx = (px: number, py: number): number => {
        const xz = (px2dx(px, g) - z.mx) / z.sx;
        const yz = (px2dy(py, g) - z.my) / z.sy;
        return yz - (w * xz + b);
    };
    const corners: [number, number][] = [
        [g.l, g.t],
        [g.l + g.pw, g.t],
        [g.l + g.pw, g.t + g.ph],
        [g.l, g.t + g.ph],
    ];
    const pos: [number, number][] = []; // class 1 (owl) side
    const neg: [number, number][] = []; // class 0 (early) side
    const edge: [number, number][] = []; // ≤2 points where the boundary crosses the box
    for (let i = 0; i < corners.length; i++) {
        const a = corners[i];
        const c = corners[(i + 1) % corners.length];
        const sa = scorePx(a[0], a[1]);
        const sc = scorePx(c[0], c[1]);
        if (sa >= 0) pos.push(a);
        else neg.push(a);
        if (sa > 0 !== sc > 0 && sa !== sc) {
            const t = sa / (sa - sc);
            const cx: [number, number] = [
                a[0] + (c[0] - a[0]) * t,
                a[1] + (c[1] - a[1]) * t,
            ];
            pos.push(cx);
            neg.push(cx);
            edge.push(cx);
        }
    }
    const fill = (poly: [number, number][], cls: 0 | 1) => {
        if (poly.length < 3) return;
        ctx.beginPath();
        poly.forEach((pt, i) =>
            i === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1])
        );
        ctx.closePath();
        ctx.fillStyle = CLASS_FILL[cls];
        ctx.fill();
    };
    fill(pos, 1);
    fill(neg, 0);
    if (edge.length === 2) {
        ctx.beginPath();
        ctx.moveTo(edge[0][0], edge[0][1]);
        ctx.lineTo(edge[1][0], edge[1][1]);
        ctx.strokeStyle = CLASS_COLOR[1];
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
}

/** gridded axes frame with tick labels + axis names. */
export function drawFrame(
    ctx: CanvasRenderingContext2D,
    g: PlotGeom,
    H: number
) {
    ctx.fillStyle = CANVAS.plotBg;
    ctx.fillRect(g.l, g.t, g.pw, g.ph);
    ctx.strokeStyle = CANVAS.grid;
    ctx.lineWidth = 1;
    const nx = 8;
    const ny = 6;
    ctx.beginPath();
    for (let i = 0; i <= nx; i++) {
        const x = g.l + (g.pw * i) / nx;
        ctx.moveTo(x, g.t);
        ctx.lineTo(x, g.t + g.ph);
    }
    for (let i = 0; i <= ny; i++) {
        const y = g.t + (g.ph * i) / ny;
        ctx.moveTo(g.l, y);
        ctx.lineTo(g.l + g.pw, y);
    }
    ctx.stroke();
    ctx.fillStyle = CANVAS.axis;
    ctx.font = `10px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= nx; i++) {
        const v = g.xm.min + ((g.xm.max - g.xm.min) * i) / nx;
        ctx.fillText(
            String(Math.round(v)),
            g.l + (g.pw * i) / nx,
            g.t + g.ph + 7
        );
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= ny; i++) {
        const v = g.ym.min + (g.ym.max - g.ym.min) * (1 - i / ny);
        ctx.fillText(String(Math.round(v)), g.l - 8, g.t + (g.ph * i) / ny);
    }
    // axis names: mono uppercase micro-label idiom (design-system §4)
    ctx.fillStyle = CANVAS.axisName;
    ctx.font = `600 10px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const axisLabel = (m: FeatureMeta) =>
        (m.name + (m.unit ? " (" + m.unit + ")" : "")).toUpperCase();
    ctx.fillText(axisLabel(g.xm), g.l + g.pw / 2, H - 2);
    ctx.save();
    ctx.translate(14, g.t + g.ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(axisLabel(g.ym), 0, 0);
    ctx.restore();
}
