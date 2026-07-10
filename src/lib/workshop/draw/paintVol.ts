/* Paint a flat Float array as an image tile — the P6 analog of paintHeat, but
   source-indexed (blit an existing sx×sy[×depth] array) instead of sampling a
   continuous function. Three modes:
     'image'  — a picture (grayscale depth 1, or RGB depth 3), per-tile normalized
     'mag'    — a non-negative activation map (dark → accent-lime hot)
     'signed' — a weight template (purple negative ↔ dark zero ↔ lime positive)
   Shares the offscreen-canvas → drawImage upscale trick with draw/heat.ts. */

import { C } from "../theme";

export type VolMode = "image" | "mag" | "signed";

const offCanvases = new Map<string, HTMLCanvasElement>();
function off(sx: number, sy: number): CanvasRenderingContext2D {
    const key = `${sx}x${sy}`;
    let cv = offCanvases.get(key);
    if (!cv) {
        cv = document.createElement("canvas");
        cv.width = sx;
        cv.height = sy;
        offCanvases.set(key, cv);
    }
    return cv.getContext("2d")!;
}

function minMax(data: ArrayLike<number>): [number, number] {
    let mn = Infinity;
    let mx = -Infinity;
    // eslint-disable-next-line @typescript-eslint/prefer-for-of -- ArrayLike isn't iterable
    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
    }
    return [mn, mx];
}

export function paintVol(
    ctx: CanvasRenderingContext2D,
    data: ArrayLike<number>,
    sx: number,
    sy: number,
    depth: number,
    x: number,
    y: number,
    w: number,
    h: number,
    mode: VolMode = "image"
) {
    const hctx = off(sx, sy);
    const img = hctx.createImageData(sx, sy);
    const [mn, mx] = minMax(data);
    const scale = Math.max(Math.abs(mn), Math.abs(mx)) || 1;
    const range = mx - mn || 1;

    for (let py = 0; py < sy; py++) {
        for (let px = 0; px < sx; px++) {
            const di = (py * sx + px) * 4;
            if (depth === 3 && mode === "image") {
                const s = (py * sx + px) * 3;
                img.data[di] = ((data[s] - mn) / range) * 255;
                img.data[di + 1] = ((data[s + 1] - mn) / range) * 255;
                img.data[di + 2] = ((data[s + 2] - mn) / range) * 255;
                img.data[di + 3] = 255;
                continue;
            }
            const v = data[py * sx + px];
            let r: number, g: number, b: number;
            if (mode === "signed") {
                // purple (neg) ↔ near-black (0) ↔ lime (pos)
                const t = v / scale; // [-1,1]
                if (t >= 0) {
                    r = C.accent[0] * t;
                    g = C.accent[1] * t;
                    b = C.accent[2] * t;
                } else {
                    r = C.accent3[0] * -t;
                    g = C.accent3[1] * -t;
                    b = C.accent3[2] * -t;
                }
            } else if (mode === "mag") {
                const t = (v - mn) / range;
                r = C.accent[0] * t;
                g = C.accent[1] * t;
                b = C.accent[2] * t;
            } else {
                const t = (v - mn) / range;
                r = g = b = t * 255;
            }
            img.data[di] = r;
            img.data[di + 1] = g;
            img.data[di + 2] = b;
            img.data[di + 3] = 255;
        }
    }
    hctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = mode === "image";
    ctx.drawImage(hctx.canvas, x, y, w, h);
}
