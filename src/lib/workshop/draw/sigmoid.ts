/* Sigmoid-expand plot for P5 stage 1. The σ(z) curve over z ∈ [−8, 8], with each
   known training point drawn as a dot at (z, σ(z)) in its class color. As the
   student drags the w1/w2/b sliders the two classes get pushed toward opposite
   ends of the S-curve — the "squashing a score into a probability" payoff. */

import { C, CLASS_COLOR, FONT_MONO, rgbCss } from "../theme";

const Z_MIN = -8;
const Z_MAX = 8;
const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export function drawSigmoid(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    pts: { z: number; cls: 0 | 1 }[]
) {
    const pad = { l: 8, r: 8, t: 10, b: 16 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    if (pw < 10 || ph < 10) return;

    const xOf = (z: number) => pad.l + ((z - Z_MIN) / (Z_MAX - Z_MIN)) * pw;
    const yOf = (p: number) => pad.t + (1 - p) * ph;

    // z = 0 vertical + p = 0.5 horizontal guide lines (dashed).
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = rgbCss(C.border, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xOf(0), pad.t);
    ctx.lineTo(xOf(0), pad.t + ph);
    ctx.moveTo(pad.l, yOf(0.5));
    ctx.lineTo(pad.l + pw, yOf(0.5));
    ctx.stroke();
    ctx.setLineDash([]);

    // the σ(z) curve in the lime accent.
    ctx.strokeStyle = rgbCss(C.accent);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
        const z = Z_MIN + ((Z_MAX - Z_MIN) * i) / steps;
        const x = xOf(z);
        const y = yOf(sigmoid(z));
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
    }
    ctx.stroke();

    // known points at (z, σ(z)), clamped to the plotted z-range, in class colors.
    pts.forEach((p) => {
        const z = Math.max(Z_MIN, Math.min(Z_MAX, p.z));
        ctx.beginPath();
        ctx.arc(xOf(z), yOf(sigmoid(z)), 2.6, 0, 7);
        ctx.fillStyle = CLASS_COLOR[p.cls];
        ctx.fill();
    });

    // z-axis micro-labels.
    ctx.fillStyle = rgbCss(C.muted);
    ctx.font = `9px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("z=0", xOf(0), pad.t + ph + 3);
}
