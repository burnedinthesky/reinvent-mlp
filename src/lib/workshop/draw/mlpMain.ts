/* MLP playground main view: decision-surface heatmap for the output
   or a selected neuron, the training points, and — for a layer-1 neuron or a
   single-layer output — that neuron's zero-contour drawn as a line on the data. */

import { paintHeat } from "./heat";
import { drawFrame, plotGeom } from "./scatter";
import { CANONICAL_X, CANONICAL_Y } from "../features";
import type { NetEngine } from "../mlp";
import { C, CANVAS, CLASS_COLOR, rgbCss } from "../theme";
import type { DataPoint, FeatureKey, FeatureMeta } from "../types";

export function drawMlpMain(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    engine: NetEngine,
    view: string,
    points: DataPoint[],
    features: Record<FeatureKey, FeatureMeta>
) {
    const g = plotGeom({ x: CANONICAL_X, y: CANONICAL_Y }, W, H, features);
    if (g.pw < 40 || g.ph < 40) return;
    drawFrame(ctx, g, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.l, g.t, g.pw, g.ph);
    ctx.clip();
    paintHeat(
        ctx,
        (rawx, rawy) => engine.valueAt(view, rawx, rawy),
        g.xm,
        g.ym,
        56,
        g.l,
        g.t,
        g.pw,
        g.ph
    );

    const netW = engine.weights;
    const netB = engine.biases;
    let lw: { w: number[]; b: number } | null = null;
    const m = /^h0-(\d+)$/.exec(view);
    if (m && netW.length > 1) lw = { w: netW[0][+m[1]], b: netB[0][+m[1]] };
    else if (view === "out" && netW.length === 1)
        lw = { w: netW[0][0], b: netB[0][0] };
    if (lw) {
        const zs = engine.stats;
        const A2 = lw.w[0] / zs.sx;
        const B2 = lw.w[1] / zs.sy;
        const C2 = lw.b - (lw.w[0] * zs.mx) / zs.sx - (lw.w[1] * zs.my) / zs.sy;
        const pts: [number, number][] = [];
        const xm = g.xm;
        const ym = g.ym;
        if (Math.abs(B2) > 1e-12) {
            [xm.min, xm.max].forEach((x) => {
                const y = (-C2 - A2 * x) / B2;
                if (y >= ym.min - 1e-9 && y <= ym.max + 1e-9) pts.push([x, y]);
            });
        }
        if (Math.abs(A2) > 1e-12) {
            [ym.min, ym.max].forEach((y) => {
                const x = (-C2 - B2 * y) / A2;
                if (x > xm.min + 1e-9 && x < xm.max - 1e-9) pts.push([x, y]);
            });
        }
        if (pts.length >= 2) {
            const mp = (p: [number, number]): [number, number] => [
                g.l + ((p[0] - xm.min) / (xm.max - xm.min)) * g.pw,
                g.t + (1 - (p[1] - ym.min) / (ym.max - ym.min)) * g.ph,
            ];
            const a1 = mp(pts[0]);
            const a2 = mp(pts[1]);
            ctx.setLineDash([6, 5]);
            ctx.strokeStyle = rgbCss(C.fg, 0.7);
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(a1[0], a1[1]);
            ctx.lineTo(a2[0], a2[1]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    points.forEach((p) => {
        if (p.hidden) return;
        const x =
            g.l +
            ((p.feats[CANONICAL_X] - g.xm.min) / (g.xm.max - g.xm.min)) * g.pw;
        const y =
            g.t +
            (1 - (p.feats[CANONICAL_Y] - g.ym.min) / (g.ym.max - g.ym.min)) *
                g.ph;
        ctx.beginPath();
        ctx.arc(x, y, p.real ? 4.4 : 3.1, 0, 7);
        ctx.fillStyle = CLASS_COLOR[p.label as number];
        ctx.fill();
        if (p.real) {
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = CANVAS.ptStroke;
            ctx.stroke();
        }
    });
    ctx.restore();
}
