/* P6 softmax bar chart — the output layer's class probabilities as labeled
   horizontal bars, with the predicted (argmax) class and the true label marked.
   Reused (without labels) to show a deeper neuron's incoming-weight row. */

import { argmax } from "../cnn/net";
import { C, FONT_MONO, rgbCss } from "../theme";

export function drawProbBars(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    probs: ArrayLike<number>,
    classNames: string[],
    trueLabel: number | null,
    cols = 1
) {
    const n = probs.length;
    const pred = argmax(probs);
    const perCol = Math.ceil(n / cols);
    const colW = W / cols;
    const rowH = H / perCol;
    const labelW = 56;
    const gap = 6;
    const valW = 34;
    const colGap = cols > 1 ? 14 : 0;
    // scale text to the row height so labels stay legible in a short box
    const fs = Math.max(8, Math.min(11, Math.round(rowH - 1)));
    const vfs = Math.max(7, fs - 1);
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
        const col = Math.floor(i / perCol);
        const row = i % perCol;
        const x0 = col * colW;
        const cy = row * rowH + rowH / 2;
        const labelRight = x0 + labelW;
        const barX = labelRight + gap;
        const barW = colW - labelW - gap - valW - colGap;
        const p = probs[i];
        // label
        ctx.font = `${i === pred ? 700 : 500} ${fs}px ${FONT_MONO}`;
        ctx.fillStyle = i === pred ? rgbCss(C.accent) : rgbCss(C.muted);
        ctx.textAlign = "right";
        ctx.fillText(classNames[i] ?? String(i), labelRight, cy);
        // track
        ctx.fillStyle = rgbCss(C.border, 0.25);
        ctx.fillRect(barX, cy - rowH * 0.28, barW, rowH * 0.56);
        // bar
        ctx.fillStyle = i === pred ? rgbCss(C.accent) : rgbCss(C.accent, 0.4);
        ctx.fillRect(
            barX,
            cy - rowH * 0.28,
            barW * Math.max(0, Math.min(1, p)),
            rowH * 0.56
        );
        // true-label tick
        if (trueLabel === i) {
            ctx.strokeStyle = rgbCss(C.accent2);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(barX - 3, cy - rowH * 0.34);
            ctx.lineTo(barX - 3, cy + rowH * 0.34);
            ctx.stroke();
        }
        // value
        ctx.font = `500 ${vfs}px ${FONT_MONO}`;
        ctx.fillStyle = rgbCss(C.muted);
        ctx.textAlign = "left";
        ctx.fillText(`${(p * 100).toFixed(0)}%`, barX + barW + 6, cy);
    }
}

/** a plain signed-value strip (for a deeper neuron's incoming weights). */
export function drawWeightStrip(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    row: ArrayLike<number>
) {
    const n = row.length;
    let scale = 0;
    for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(row[i]));
    scale = scale || 1;
    const bw = W / n;
    const mid = H / 2;
    for (let i = 0; i < n; i++) {
        const t = row[i] / scale;
        const bh = (Math.abs(t) * H) / 2;
        ctx.fillStyle =
            t >= 0 ? rgbCss(C.accent, 0.85) : rgbCss(C.accent3, 0.85);
        ctx.fillRect(
            i * bw,
            t >= 0 ? mid - bh : mid,
            Math.max(1, bw - 0.5),
            bh
        );
    }
    ctx.strokeStyle = rgbCss(C.border, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(W, mid);
    ctx.stroke();
}
