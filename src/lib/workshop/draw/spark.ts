/* Loss sparkline (ported from drawSpark). */

import { C, rgbCss } from "../theme";

export function drawSpark(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    hist: number[]
) {
    const n = Math.min(hist.length, 400);
    if (n < 2) {
        ctx.strokeStyle = rgbCss(C.border);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(1, H / 2);
        ctx.lineTo(W - 1, H / 2);
        ctx.stroke();
        return;
    }
    const seg = hist.slice(hist.length - n);
    let mn = Infinity;
    let mx = -Infinity;
    seg.forEach((v) => {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
    });
    const rng = mx - mn || 1;
    ctx.strokeStyle = rgbCss(C.accent);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    seg.forEach((v, i) => {
        const x = (i / (n - 1)) * (W - 2) + 1;
        const y = 2 + (1 - (v - mn) / rng) * (H - 4);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
    });
    ctx.stroke();
}
