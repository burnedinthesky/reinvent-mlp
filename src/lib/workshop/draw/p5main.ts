/* P5 "Neuron" main view. A clone of drawMlpMain adapted to the student-chosen axes:
   the probability heatmap for the output (or a stage-2 hidden neuron), the training
   points in P2's three tiers, and the dashed zero-contour (p = 0.5 boundary) for a
   layer-1 neuron / single-neuron output. Takes a NetView so stage 1 (single neuron)
   and stage 2 (NetEngine) share one renderer. */

import { paintHeat } from "./heat";
import { drawFrame, plotGeom, pointPx } from "./scatter";
import type { NetView } from "../mlp";
import { C, CANVAS, CLASS_COLOR, classHeatRGBA, rgbCss } from "../theme";
import type { DataPoint, FeatureKey, FeatureMeta } from "../types";

export function drawP5Main(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    net: NetView,
    view: string,
    axes: { x: FeatureKey; y: FeatureKey },
    points: DataPoint[],
    features: Record<FeatureKey, FeatureMeta>,
    preview = false
) {
    const g = plotGeom(axes, W, H, features);
    if (g.pw < 40 || g.ph < 40) return;
    drawFrame(ctx, g, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.l, g.t, g.pw, g.ph);
    ctx.clip();
    paintHeat(
        ctx,
        (rawx, rawy) => net.valueAt(view, rawx, rawy),
        g.xm,
        g.ym,
        56,
        g.l,
        g.t,
        g.pw,
        g.ph,
        classHeatRGBA
    );

    // dashed zero-contour: a layer-1 neuron (h0-i) or a single-neuron output draws
    // an affine boundary in feature space — the p = 0.5 line. Ported verbatim from
    // drawMlpMain; z-scored weights → feature-space affine coefficients A2·x + B2·y + C2.
    const netW = net.weights;
    const netB = net.biases;
    let lw: { w: number[]; b: number } | null = null;
    const m = /^h0-(\d+)$/.exec(view);
    if (m && netW.length > 1) lw = { w: netW[0][+m[1]], b: netB[0][+m[1]] };
    else if (view === "out" && netW.length === 1)
        lw = { w: netW[0][0], b: netB[0][0] };
    if (lw) {
        const zs = net.stats;
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

    // P2-style point tiers: real known 4.8px colored (ring), revealed synth 3.6px,
    // unknown-label 3px grey. Jittered on ordinal axes via pointPx. In preview mode
    // (P2's dock toggle) every visible point is recolored by the neuron's predicted
    // class — p = σ(...) at its raw feature coords, thresholded at 0.5.
    points.forEach((p) => {
        if (p.hidden) return;
        const [x, y] = pointPx(p, axes, g);
        const known = p.label === 0 || p.label === 1;
        const pred =
            net.valueAt("out", p.feats[axes.x], p.feats[axes.y]) >= 0.5 ? 1 : 0;
        ctx.beginPath();
        ctx.arc(x, y, p.real ? 4.8 : known ? 3.6 : 3, 0, 7);
        ctx.fillStyle = preview
            ? CLASS_COLOR[pred]
            : known
              ? CLASS_COLOR[p.label as number]
              : CANVAS.hidden;
        ctx.fill();
        if (p.real && known) {
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = CANVAS.ptStroke;
            ctx.stroke();
        }
    });
    ctx.restore();
}
