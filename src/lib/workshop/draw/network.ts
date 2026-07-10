/* Network diagram. Nodes render as little decision-surface
   thumbnails; edges are colored/weighted by sign & magnitude. Returns clickable
   node boxes so the caller can map a click to a neuron key. */

import { paintHeat } from "./heat";
import { FEATURES } from "../features";
import type { NetView } from "../mlp";
import { C as PAL, FONT_MONO, edgeStyle, rgbCss } from "../theme";
import type { FeatureMeta } from "../types";

export interface NetNode {
    key: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

function rr(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Generalized network diagram. Renders input nodes (labeled `inLabels`), hidden
    neurons (each a decision-surface thumbnail over the `xm`/`ym` axes), and the
    output (labeled `outLabel`). Returns clickable node boxes. `drawMlpNet` wraps
    this with the canonical features so the MLP playground is untouched. */
export function drawNetDiagram(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    net: NetView,
    selectedKey: string,
    xm: FeatureMeta,
    ym: FeatureMeta,
    inLabels: [string, string],
    outLabel = "P(夜貓)",
    ramp?: (t: number) => [number, number, number, number]
): NetNode[] {
    const sizes = net.sizes;
    const netW = net.weights;
    const C = sizes.length;
    const colX: number[] = [];
    for (let c = 0; c < C; c++)
        colX.push(38 + (W - 76) * (C === 1 ? 0 : c / (C - 1)));
    const ys = sizes.map((n) => {
        const gp = n > 1 ? Math.min(46, (H - 54) / (n - 1)) : 0;
        return Array.from(
            { length: n },
            (_, i) => H / 2 + (i - (n - 1) / 2) * gp
        );
    });

    for (let l = 0; l < netW.length; l++) {
        for (let o = 0; o < netW[l].length; o++) {
            for (let i = 0; i < netW[l][o].length; i++) {
                const es = edgeStyle(netW[l][o][i]);
                ctx.strokeStyle = es.stroke;
                ctx.lineWidth = es.width;
                ctx.beginPath();
                ctx.moveTo(colX[l], ys[l][i]);
                ctx.lineTo(colX[l + 1], ys[l + 1][o]);
                ctx.stroke();
            }
        }
    }

    const nodes: NetNode[] = [];
    ys[0].forEach((y, i) => {
        ctx.beginPath();
        ctx.arc(colX[0], y, 9, 0, 7);
        ctx.fillStyle = rgbCss(PAL.panel);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgbCss(PAL.border);
        ctx.stroke();
        ctx.fillStyle = rgbCss(PAL.muted);
        ctx.font = `600 9.5px ${FONT_MONO}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(inLabels[i], colX[0], y + 13);
    });

    for (let c = 1; c < C; c++) {
        const isOut = c === C - 1;
        const n = sizes[c];
        const gp = n > 1 ? Math.min(46, (H - 54) / (n - 1)) : 999;
        const Sz = isOut ? 40 : Math.min(36, Math.max(22, gp - 4));
        ys[c].forEach((y, i) => {
            const x0 = colX[c] - Sz / 2;
            const y0 = y - Sz / 2;
            const key = isOut ? "out" : "h" + (c - 1) + "-" + i;
            const sel = selectedKey === key;
            ctx.save();
            rr(ctx, x0, y0, Sz, Sz, 7);
            ctx.clip();
            ctx.fillStyle = rgbCss(PAL.bg);
            ctx.fillRect(x0, y0, Sz, Sz);
            paintHeat(
                ctx,
                (rawx, rawy) => net.valueAt(key, rawx, rawy),
                xm,
                ym,
                16,
                x0,
                y0,
                Sz,
                Sz,
                ramp
            );
            ctx.restore();
            rr(ctx, x0, y0, Sz, Sz, 7);
            ctx.lineWidth = sel ? 2.4 : 1.2;
            ctx.strokeStyle = sel ? rgbCss(PAL.accent) : rgbCss(PAL.border);
            ctx.stroke();
            nodes.push({ key, x: x0, y: y0, w: Sz, h: Sz });
        });
        if (isOut) {
            ctx.fillStyle = rgbCss(PAL.muted);
            ctx.font = `600 9.5px ${FONT_MONO}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(outLabel, colX[c], ys[c][0] + Sz / 2 + 6);
        }
    }
    return nodes;
}

/** The MLP playground's network diagram — a thin wrapper over drawNetDiagram
    pinning the canonical axes + input labels, so MlpPlayground stays diff-free. */
export function drawMlpNet(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    net: NetView,
    selectedKey: string
): NetNode[] {
    return drawNetDiagram(
        ctx,
        W,
        H,
        net,
        selectedKey,
        FEATURES.SCREEN_AVG,
        FEATURES.CAFFEINE,
        ["螢幕", "咖啡因"]
    );
}
