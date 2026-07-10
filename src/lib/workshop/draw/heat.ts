/* Decision-surface heatmap painting (ported from paintHeat). Samples a value
   function over a grid into an offscreen canvas, then scales it up. The
   cyan ↔ grey ↔ purple diverging ramp itself lives in ../theme (heatRGBA). */

import { heatRGBA } from "../theme";
import type { FeatureMeta } from "../types";

const heatCanvases: Partial<Record<number, HTMLCanvasElement>> = {};

export function paintHeat(
    ctx: CanvasRenderingContext2D,
    valueAt: (rawx: number, rawy: number) => number,
    xm: FeatureMeta,
    ym: FeatureMeta,
    res: number,
    x: number,
    y: number,
    w: number,
    h: number,
    ramp: (t: number) => [number, number, number, number] = heatRGBA
) {
    let hc = heatCanvases[res];
    if (!hc) {
        hc = document.createElement("canvas");
        hc.width = hc.height = res;
        heatCanvases[res] = hc;
    }
    const hctx = hc.getContext("2d")!;
    const img = hctx.createImageData(res, res);
    for (let gy = 0; gy < res; gy++) {
        const rawy = ym.min + (1 - (gy + 0.5) / res) * (ym.max - ym.min);
        for (let gx = 0; gx < res; gx++) {
            const rawx = xm.min + ((gx + 0.5) / res) * (xm.max - xm.min);
            const t = Math.max(0, Math.min(1, valueAt(rawx, rawy)));
            const c = ramp(t);
            const idx = (gy * res + gx) * 4;
            img.data[idx] = c[0];
            img.data[idx + 1] = c[1];
            img.data[idx + 2] = c[2];
            img.data[idx + 3] = c[3];
        }
    }
    hctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(hc, x, y, w, h);
}
