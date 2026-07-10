/* Fog landscape drawing (ported from fogPattern / paintFog / drawFog). The (w,b)
   plane stays hidden behind a procedural fog; only queried points light up with
   their loss color + number. `paintFog` is reused by the P4 bot map; when a
   LossGrid is supplied the fog is replaced by the true heatmap. */

import { C, CANVAS, FONT_MONO, rgbCss } from "../theme";
import type { LossGrid } from "../types";

export interface FogGeom {
    l: number;
    t: number;
    pw: number;
    ph: number;
}

export function fogGeom(W: number, H: number): FogGeom {
    const l = 52;
    const r = 22;
    const t = 24;
    const b = 46;
    return { l, t, pw: W - l - r, ph: H - t - b };
}

const w2x = (w: number, g: FogGeom) => g.l + ((w + 4) / 8) * g.pw;
const b2y = (b: number, g: FogGeom) => g.t + (1 - (b + 4) / 8) * g.ph;
export const clampG = (v: number) => Math.max(-4, Math.min(4, v));

let fogPatternSrc: HTMLCanvasElement | null = null;
function fogPatternCanvas(): HTMLCanvasElement {
    if (fogPatternSrc) return fogPatternSrc;
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const x = c.getContext("2d")!;
    x.fillStyle = CANVAS.fogBase;
    x.fillRect(0, 0, 160, 160);
    let s = 987654321 >>> 0;
    const rnd = () => {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;
        s >>>= 0;
        return s / 4294967296;
    };
    for (let i = 0; i < 260; i++) {
        x.beginPath();
        x.arc(rnd() * 160, rnd() * 160, 5 + rnd() * 18, 0, 7);
        x.fillStyle = rgbCss(C.muted, 0.015 + rnd() * 0.035);
        x.fill();
    }
    fogPatternSrc = c;
    return c;
}

export function paintFog(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = CANVAS.fogBase;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ctx.createPattern(fogPatternCanvas(), "repeat")!;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = rgbCss(C.border, 0.1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
        const gx = x + (w * i) / 8;
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + h);
    }
    for (let i = 1; i < 8; i++) {
        const gy = y + (h * i) / 8;
        ctx.moveTo(x, gy);
        ctx.lineTo(x + w, gy);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rgbCss(C.border, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/* one-per-grid offscreen heatmap, painted cell-by-cell on the loss ramp and
   cached by grid identity (mirrors the fogPatternCanvas approach). */
let heatSrc: { grid: LossGrid; canvas: HTMLCanvasElement } | null = null;
function heatCanvas(
    grid: LossGrid,
    lossColor: (L: number, alpha?: number) => string
): HTMLCanvasElement {
    if (heatSrc && heatSrc.grid === grid) return heatSrc.canvas;
    const N = grid.gn;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const x = c.getContext("2d")!;
    for (let row = 0; row < N; row++) {
        const y = N - 1 - row; // grid rows run b = -4 → +4; canvas y runs top → down
        for (let col = 0; col < N; col++) {
            x.fillStyle = lossColor(grid.grid[row * N + col], 1);
            x.fillRect(col, y, 1, 1);
        }
    }
    heatSrc = { grid, canvas: c };
    return c;
}

function paintHeat(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    grid: LossGrid,
    lossColor: (L: number, alpha?: number) => string,
    /** paint only this grid row (the 1d strip at bStar). */
    rowOnly?: number
) {
    const src = heatCanvas(grid, lossColor);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (rowOnly != null) {
        ctx.drawImage(src, 0, grid.gn - 1 - rowOnly, grid.gn, 1, x, y, w, h);
    } else {
        ctx.drawImage(src, x, y, w, h);
    }
    ctx.restore();
    ctx.strokeStyle = rgbCss(C.border, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/* Iso-loss contour overlay on the revealed landscape. Levels are spaced
   quadratically (∝ i²) so that on the bowl-shaped MSE surface the rings come out
   roughly evenly spaced in (w,b) instead of bunching against the outer rim.
   Built with marching squares into a single Path2D, cached by grid identity +
   geometry so the w-cursor redraw doesn't recompute the whole thing. */
const CONTOUR_N = 8;
const CONTOUR_STROKE = rgbCss(C.fg, 0.22);

function contourLevels(grid: LossGrid): number[] {
    const out: number[] = [];
    for (let i = 1; i <= CONTOUR_N; i++) {
        const f = (i / (CONTOUR_N + 1)) ** 2;
        out.push(grid.min + (grid.max - grid.min) * f);
    }
    return out;
}

let contourSrc: { grid: LossGrid; key: string; path: Path2D } | null = null;
function contourPath(
    grid: LossGrid,
    x: number,
    y: number,
    w: number,
    h: number
): Path2D {
    const key = `${x | 0}:${y | 0}:${w | 0}:${h | 0}`;
    if (contourSrc && contourSrc.grid === grid && contourSrc.key === key)
        return contourSrc.path;
    const N = grid.gn;
    const gd = grid.grid;
    const path = new Path2D();
    // grid col → w axis (left→right), grid row → b axis (bottom→top).
    const px = (col: number) => x + (col / (N - 1)) * w;
    const py = (row: number) => y + (1 - row / (N - 1)) * h;
    type P = [number, number];
    const seg = (p: P, q: P) => {
        path.moveTo(p[0], p[1]);
        path.lineTo(q[0], q[1]);
    };
    for (const level of contourLevels(grid)) {
        for (let row = 0; row < N - 1; row++) {
            const base = row * N;
            for (let col = 0; col < N - 1; col++) {
                const v00 = gd[base + col]; //           bottom-left
                const v10 = gd[base + col + 1]; //       bottom-right
                const v01 = gd[base + N + col]; //       top-left
                const v11 = gd[base + N + col + 1]; //   top-right
                let ci = 0;
                if (v00 < level) ci |= 1;
                if (v10 < level) ci |= 2;
                if (v11 < level) ci |= 4;
                if (v01 < level) ci |= 8;
                if (ci === 0 || ci === 15) continue;
                // edge crossings, linearly interpolated to the level
                const eb = (): P => [
                    px(col + (level - v00) / (v10 - v00)),
                    py(row),
                ];
                const et = (): P => [
                    px(col + (level - v01) / (v11 - v01)),
                    py(row + 1),
                ];
                const el = (): P => [
                    px(col),
                    py(row + (level - v00) / (v01 - v00)),
                ];
                const er = (): P => [
                    px(col + 1),
                    py(row + (level - v10) / (v11 - v10)),
                ];
                switch (ci) {
                    case 1:
                    case 14:
                        seg(el(), eb());
                        break;
                    case 2:
                    case 13:
                        seg(eb(), er());
                        break;
                    case 4:
                    case 11:
                        seg(er(), et());
                        break;
                    case 8:
                    case 7:
                        seg(el(), et());
                        break;
                    case 3:
                    case 12:
                        seg(el(), er());
                        break;
                    case 6:
                    case 9:
                        seg(eb(), et());
                        break;
                    case 5: // saddle
                        seg(el(), et());
                        seg(eb(), er());
                        break;
                    case 10: // saddle
                        seg(el(), eb());
                        seg(er(), et());
                        break;
                }
            }
        }
    }
    contourSrc = { grid, key, path };
    return path;
}

/** Contours for the 1d strip: vertical iso-loss ticks along the bStar row. */
function draw1dContours(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    grid: LossGrid,
    row: number
) {
    const N = grid.gn;
    const gd = grid.grid;
    const base = row * N;
    ctx.save();
    ctx.strokeStyle = CONTOUR_STROKE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const level of contourLevels(grid)) {
        for (let col = 0; col < N - 1; col++) {
            const a = gd[base + col];
            const b = gd[base + col + 1];
            if (a < level === b < level) continue;
            const cx = x + ((col + (level - a) / (b - a)) / (N - 1)) * w;
            ctx.moveTo(cx, y);
            ctx.lineTo(cx, y + h);
        }
    }
    ctx.stroke();
    ctx.restore();
}

export interface FogDrawState {
    round: "1d" | "2d";
    w: number;
    fog1d: { w: number; loss: number }[];
    fog2d: { w: number; b: number; loss: number }[];
    lossColor: (L: number, alpha?: number) => string;
    /** true landscape heatmap, drawn under the fog when supplied. */
    reveal?: LossGrid;
}

export function drawFog(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    st: FogDrawState
) {
    ctx.fillStyle = rgbCss(C.bg);
    ctx.fillRect(0, 0, W, H);
    const g = fogGeom(W, H);
    if (g.pw < 60 || g.ph < 60) return;

    ctx.font = `11px ${FONT_MONO}`;
    ctx.fillStyle = rgbCss(C.muted);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let v = -4; v <= 4; v += 2)
        ctx.fillText(String(v), w2x(v, g), g.t + g.ph + 9);
    ctx.font = `600 10px ${FONT_MONO}`;
    ctx.fillStyle = rgbCss(C.muted);
    ctx.fillText("W — SLOPE OF THE LINE", g.l + g.pw / 2, g.t + g.ph + 26);

    if (st.round === "1d") {
        const sh = Math.min(130, g.ph * 0.42);
        const sy = g.t + g.ph / 2 - sh / 2;
        if (st.reveal) {
            const row = Math.round(
                ((st.reveal.bStar + 4) / 8) * (st.reveal.gn - 1)
            );
            paintHeat(ctx, g.l, sy, g.pw, sh, st.reveal, st.lossColor, row);
            draw1dContours(ctx, g.l, sy, g.pw, sh, st.reveal, row);
        } else {
            paintFog(ctx, g.l, sy, g.pw, sh);
        }
        st.fog1d.forEach((q) => {
            const x = w2x(q.w, g);
            ctx.fillStyle = st.lossColor(q.loss, 0.85);
            ctx.fillRect(x - 7, sy + 1, 14, sh - 2);
            ctx.fillStyle = rgbCss(C.fg);
            ctx.font = `10.5px ${FONT_MONO}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(q.loss.toFixed(2), x, sy - 7);
        });
        const rx = w2x(clampG(st.w), g);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = rgbCss(C.fg);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rx, sy - 16);
        ctx.lineTo(rx, sy + sh + 16);
        ctx.stroke();
        ctx.setLineDash([]);
    } else {
        if (st.reveal) {
            paintHeat(ctx, g.l, g.t, g.pw, g.ph, st.reveal, st.lossColor);
            ctx.save();
            ctx.beginPath();
            ctx.rect(g.l, g.t, g.pw, g.ph);
            ctx.clip();
            ctx.strokeStyle = CONTOUR_STROKE;
            ctx.lineWidth = 1;
            ctx.stroke(contourPath(st.reveal, g.l, g.t, g.pw, g.ph));
            ctx.restore();
        } else {
            paintFog(ctx, g.l, g.t, g.pw, g.ph);
        }
        ctx.font = `11px ${FONT_MONO}`;
        ctx.fillStyle = rgbCss(C.muted);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (let v = -4; v <= 4; v += 2)
            ctx.fillText(String(v), g.l - 9, b2y(v, g));
        ctx.save();
        ctx.translate(16, g.t + g.ph / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = `600 10px ${FONT_MONO}`;
        ctx.fillStyle = rgbCss(C.muted);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("B — HEIGHT OF THE LINE", 0, 0);
        ctx.restore();

        let best: { w: number; b: number; loss: number } | null = null;
        for (const q of st.fog2d) if (!best || q.loss < best.loss) best = q;
        ctx.save();
        ctx.beginPath();
        ctx.rect(g.l, g.t, g.pw, g.ph);
        ctx.clip();
        st.fog2d.forEach((q) => {
            const x = w2x(q.w, g);
            const y = b2y(q.b, g);
            const rg = ctx.createRadialGradient(x, y, 0, x, y, 32);
            rg.addColorStop(0, st.lossColor(q.loss, 0.55));
            rg.addColorStop(1, st.lossColor(q.loss, 0));
            ctx.fillStyle = rg;
            ctx.fillRect(x - 32, y - 32, 64, 64);
            ctx.beginPath();
            ctx.arc(x, y, 3.2, 0, 7);
            ctx.fillStyle = st.lossColor(q.loss, 1);
            ctx.fill();
            ctx.fillStyle = rgbCss(C.fg);
            ctx.font = `10.5px ${FONT_MONO}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(q.loss.toFixed(2), x, y - 8);
        });
        if (best) {
            const bb = best;
            ctx.beginPath();
            ctx.arc(w2x(bb.w, g), b2y(bb.b, g), 9, 0, 7);
            ctx.strokeStyle = rgbCss(C.accent);
            ctx.lineWidth = 1.6;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }
}
