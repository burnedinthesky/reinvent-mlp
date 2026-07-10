/* P4 canvas isometric-3D terrain (p4-redesign-spec §5). Hand-rendered heightfield
   over the (w, b) plane: the loss grid is both the height and the color (low loss
   = hot-lime valley, high loss = grey ridge). Dimetric projection, painter's
   algorithm back-to-front, drag-to-orbit yaw. A corner top-down minimap (P3
   WBSquare style) carries the trail, current position, and the P3 ghost probes.

   No scene graph — whole frames redraw, like every other draw module. Retires
   draw/botmap.ts from P4. */

import { C, FONT_MONO, lossRamp, rgbCss } from "../theme";
import type { RunFrame } from "../types";

export interface Terrain3DState {
    /** gn×gn true loss grid (row-major, b-major), or null for a fogged stage. */
    grid: Float32Array | null;
    gn: number;
    gMin: number;
    gMax: number;
    /** camera orbit yaw, radians. */
    yaw: number;
    /** height reveal animation, 0 (flat) → 1 (full). Bowl stays at 1. */
    revealT: number;
    /** replay frames, or null before any run. */
    frames: RunFrame[] | null;
    /** current replay step index into frames. */
    step: number;
    /** P3 ghost probe dots for the Bowl minimap. */
    probes?: { w: number; b: number }[];
    /** render quality: 'full' = DS 2 (~10k quads), 'draft' = DS 4 (~2.5k) for a
      smooth orbit-drag / reveal animation. Defaults to 'full'. */
    quality?: "full" | "draft";
}

const PLANE = 4; // half-extent of the (w, b) plane
const DS = 2; // surface downsample (201 → 101) — finer quads read the ridges better
const DS_DRAFT = 4; // coarser downsample while orbiting / mid-reveal

/** normalized loss height in [0, 1] (0 = best/lowest). */
function h01(L: number, gMin: number, gMax: number): number {
    return Math.max(0, Math.min(1, (L - gMin) / (gMax - gMin || 1)));
}

/** Per-stage height gamma + relief scale. Flat data-derived surfaces (tiny loss
    range, e.g. the trappy Range) would read as a near-flat sheet at the fixed
    relief; measuring the grid's mean cell-to-cell roughness lets us deepen the
    bumpy stages and apply a gentle gamma so their subtle traps/saddles stand out
    at a distance, while the well-shaped Bowl (already full relief) is untouched.
    Returns { gamma, relief } with relief a multiplier on the base height. */
function reliefOf(
    grid: Float32Array | null,
    gn: number,
    gMin: number,
    gMax: number
): {
    gamma: number;
    relief: number;
} {
    if (!grid || gn < 2) return { gamma: 1, relief: 1 };
    // mean absolute normalized step to the right/down neighbour (~ surface slope).
    let sum = 0;
    let n = 0;
    const inv = 1 / (gMax - gMin || 1);
    for (let j = 0; j < gn - 1; j += 2) {
        for (let i = 0; i < gn - 1; i += 2) {
            const c = grid[j * gn + i];
            sum += Math.abs(grid[j * gn + (i + 1)] - c) * inv;
            sum += Math.abs(grid[(j + 1) * gn + i] - c) * inv;
            n += 2;
        }
    }
    const rough = n ? sum / n : 0;
    // smoother surfaces (small rough) get boosted relief + a <1 gamma that lifts the
    // low mid-tones; clamps keep both tasteful.
    const relief = Math.max(1, Math.min(1.8, 0.02 / (rough + 1e-4)));
    const gamma = Math.max(0.65, Math.min(1, 0.6 + rough * 12));
    return { gamma, relief };
}

export function drawTerrain3D(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    st: Terrain3DState
): void {
    ctx.fillStyle = rgbCss(C.bg);
    ctx.fillRect(0, 0, W, H);

    const { grid, gn, gMin, gMax, yaw, revealT } = st;
    const cx = W / 2;
    const cy = H * 0.72;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const scale = Math.min(W, H) * 0.16;
    // per-stage relief: deepen flat surfaces so their subtle traps read at distance.
    const { gamma, relief } = reliefOf(grid, gn, gMin, gMax);
    const heightPx = Math.min(W, H) * 0.22 * relief;

    // normalized height with the per-stage gamma applied (elevation + shading both
    // read this, so the surface and the markers/trail stay on the same curve).
    const elevOf = (L: number) => Math.pow(h01(L, gMin, gMax), gamma);

    // (w, b, loss) → screen. Elevation lifts the point off the base diamond.
    const project = (w: number, b: number, elev: number) => {
        const u = w / PLANE;
        const v = b / PLANE;
        const ur = u * cos - v * sin;
        const vr = u * sin + v * cos;
        const x = cx + (ur - vr) * scale;
        const y = cy + (ur + vr) * scale * 0.5 - elev * heightPx * revealT;
        return { x, y };
    };
    // (depth/wOf now live in paintSurface — the surface pass is offscreen-cached.)
    const gridLoss = (w: number, b: number): number => {
        if (!grid) return gMin;
        const wi = Math.round(((w + PLANE) / (2 * PLANE)) * (gn - 1));
        const bi = Math.round(((b + PLANE) / (2 * PLANE)) * (gn - 1));
        const ci = Math.max(0, Math.min(gn - 1, wi));
        const cj = Math.max(0, Math.min(gn - 1, bi));
        return grid[cj * gn + ci];
    };

    /* ---- surface (offscreen-cached: the ~9,800-quad build + depth-sort + fill is
         the whole cost, and it only changes when grid/yaw/revealT/quality/size
         change — so cache it to an offscreen canvas keyed on those and blit on the
         hot paths (replay ticks, trail-only repaints). trail/peeks/marker/minimap
         below stay per-frame). ---- */
    const ds = st.quality === "draft" ? DS_DRAFT : DS;
    const surfCanvas = getSurface(W, H, st, ds);
    ctx.drawImage(surfCanvas, 0, 0, W, H);

    /* ---- bot trail, marker, peeks, jumps ---- */
    const frames = st.frames;
    if (frames && frames.length) {
        const step = Math.max(0, Math.min(st.step, frames.length - 1));
        const surf = (w: number, b: number) =>
            project(w, b, grid ? elevOf(gridLoss(w, b)) : 0);

        // trail ribbon (breaks across jumps; jump drawn as a dashed arc).
        for (let k = 1; k <= step; k++) {
            const prev = frames[k - 1];
            const cur = frames[k];
            const a = surf(prev.w, prev.b);
            const c = surf(cur.w, cur.b);
            if (cur.jumped) {
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = rgbCss(C.accent2, 0.5);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                const mx = (a.x + c.x) / 2;
                const my = Math.min(a.y, c.y) - 40;
                ctx.quadraticCurveTo(mx, my, c.x, c.y);
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                const fade = Math.max(0.12, 1 - (step - k) * 0.02);
                ctx.strokeStyle = rgbCss(C.accent, 0.85 * fade);
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(c.x, c.y);
                ctx.stroke();
            }
        }

        // looks this step — brief radar pings at their sample spots.
        const f = frames[step];
        for (const pk of f.looks) {
            const p = surf(pk.w, pk.b);
            ctx.strokeStyle = rgbCss(C.accent2, 0.7);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // current position: drop line to the base plane + pulsing marker.
        const cur = surf(f.w, f.b);
        const base = project(f.w, f.b, 0);
        ctx.strokeStyle = rgbCss(C.fg, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
        const pulse = 5 + (step % 2 === 0 ? 1.2 : 0);
        ctx.fillStyle = lossRamp(h01(gridLoss(f.w, f.b), gMin, gMax), 1);
        ctx.beginPath();
        ctx.arc(cur.x, cur.y, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgbCss(C.fg);
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    /* ---- minimap (P3 WBSquare style) ---- */
    drawMinimap(ctx, W, H, st);
}

/* ---- offscreen surface cache ------------------------------------------------
   The surface (heightfield quads: build + depth-sort + fill + stroke) is the
   whole per-frame cost, and it's a pure function of grid identity, gn, gMin/gMax,
   yaw, revealT, quality (ds), and the canvas size. Replay ticks and trail-only
   repaints don't touch any of those, so we render the surface once into an
   offscreen canvas and blit it thereafter. The cache holds a single entry (there
   is one P4 canvas); any mismatch rebuilds it. */
interface SurfaceCache {
    canvas: HTMLCanvasElement;
    grid: Float32Array | null;
    gn: number;
    gMin: number;
    gMax: number;
    yaw: number;
    revealT: number;
    W: number;
    H: number;
    dpr: number;
    ds: number;
}
let surfaceCache: SurfaceCache | null = null;

/** Return an offscreen canvas holding the painted surface for `st`, rebuilding it
    only when a cache key changes. `grid` is compared BY REFERENCE (the client
    caches each stage's grid as a stable Float32Array, so identity is a valid,
    cheap key). Sized W·dpr × H·dpr and blitted at logical W×H by the caller. */
function getSurface(
    W: number,
    H: number,
    st: Terrain3DState,
    ds: number
): HTMLCanvasElement {
    const { grid, gn, gMin, gMax, yaw, revealT } = st;
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    const c = surfaceCache;
    if (
        c &&
        c.grid === grid &&
        c.gn === gn &&
        c.gMin === gMin &&
        c.gMax === gMax &&
        c.yaw === yaw &&
        c.revealT === revealT &&
        c.W === W &&
        c.H === H &&
        c.dpr === dpr &&
        c.ds === ds
    ) {
        return c.canvas;
    }

    const canvas = c?.canvas ?? document.createElement("canvas");
    const pw = Math.max(1, Math.round(W * dpr));
    const ph = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
    }
    const octx = canvas.getContext("2d")!;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, W, H);
    paintSurface(octx, W, H, st, ds);

    surfaceCache = {
        canvas,
        grid,
        gn,
        gMin,
        gMax,
        yaw,
        revealT,
        W,
        H,
        dpr,
        ds,
    };
    return canvas;
}

/** Paint just the terrain surface (heightfield quads or the fogged diamond) onto
    `ctx` in logical coordinates — the expensive pass, extracted so it can render
    into the offscreen cache. `ds` is the surface downsample stride. */
function paintSurface(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    st: Terrain3DState,
    ds: number
): void {
    const { grid, gn, gMin, gMax, yaw, revealT } = st;
    const cx = W / 2;
    const cy = H * 0.72;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const scale = Math.min(W, H) * 0.16;
    const { gamma, relief } = reliefOf(grid, gn, gMin, gMax);
    const heightPx = Math.min(W, H) * 0.22 * relief;
    const elevOf = (L: number) => Math.pow(h01(L, gMin, gMax), gamma);
    const project = (w: number, b: number, elev: number) => {
        const u = w / PLANE;
        const v = b / PLANE;
        const ur = u * cos - v * sin;
        const vr = u * sin + v * cos;
        const x = cx + (ur - vr) * scale;
        const y = cy + (ur + vr) * scale * 0.5 - elev * heightPx * revealT;
        return { x, y };
    };
    const depth = (w: number, b: number) => {
        const u = w / PLANE;
        const v = b / PLANE;
        const ur = u * cos - v * sin;
        const vr = u * sin + v * cos;
        return ur + vr;
    };
    const wOf = (i: number) => -PLANE + (2 * PLANE * i) / (gn - 1);

    if (grid) {
        interface Quad {
            pts: { x: number; y: number }[];
            t: number;
            d: number;
            /** local height relief across the quad (0..1) — drives ridgeline emphasis. */
            steep: number;
        }
        const quads: Quad[] = [];
        for (let j = 0; j + ds < gn; j += ds) {
            for (let i = 0; i + ds < gn; i += ds) {
                const corners = [
                    [i, j],
                    [i + ds, j],
                    [i + ds, j + ds],
                    [i, j + ds],
                ] as const;
                let tSum = 0;
                let eMin = Infinity;
                let eMax = -Infinity;
                const pts = corners.map(([ci, cj]) => {
                    const w = wOf(ci);
                    const b = wOf(cj);
                    const L = grid[cj * gn + ci];
                    tSum += h01(L, gMin, gMax);
                    const e = elevOf(L);
                    if (e < eMin) eMin = e;
                    if (e > eMax) eMax = e;
                    return project(w, b, e);
                });
                const t = tSum / 4;
                const wc = wOf(i + ds / 2);
                const bc = wOf(j + ds / 2);
                quads.push({ pts, t, d: depth(wc, bc), steep: eMax - eMin });
            }
        }
        // painter's algorithm: far (small depth) first.
        quads.sort((a, b) => a.d - b.d);
        for (const q of quads) {
            ctx.beginPath();
            ctx.moveTo(q.pts[0].x, q.pts[0].y);
            for (let k = 1; k < 4; k++) ctx.lineTo(q.pts[k].x, q.pts[k].y);
            ctx.closePath();
            ctx.fillStyle = lossRamp(q.t, 1);
            ctx.fill();
            // ridgeline emphasis: steep quads (ridges/saddle walls) get a brighter,
            // slightly thicker fg stroke; flat quads keep the faint bg hairline. This
            // draws the terrain's edges where the ground actually breaks, instead of a
            // uniform wireframe that flattens the read.
            const edge = Math.min(1, q.steep * 6);
            if (edge > 0.05) {
                ctx.strokeStyle = rgbCss(C.fg, 0.1 + 0.4 * edge);
                ctx.lineWidth = 0.5 + edge;
            } else {
                ctx.strokeStyle = rgbCss(C.bg, 0.35);
                ctx.lineWidth = 0.5;
            }
            ctx.stroke();
        }
    } else {
        // fogged stage — a flat, dim diamond.
        const corners = [
            project(-PLANE, -PLANE, 0),
            project(PLANE, -PLANE, 0),
            project(PLANE, PLANE, 0),
            project(-PLANE, PLANE, 0),
        ];
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let k = 1; k < 4; k++) ctx.lineTo(corners[k].x, corners[k].y);
        ctx.closePath();
        ctx.fillStyle = rgbCss(C.panel);
        ctx.fill();
        ctx.strokeStyle = rgbCss(C.border, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

function drawMinimap(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    st: Terrain3DState
): void {
    const size = Math.max(96, Math.min(W, H) * 0.26);
    const pad = 14;
    const x0 = W - size - pad;
    const y0 = H - size - pad;
    const toPx = (w: number, b: number) => ({
        x: x0 + ((w + PLANE) / (2 * PLANE)) * size,
        // b axis up-positive.
        y: y0 + ((PLANE - b) / (2 * PLANE)) * size,
    });

    ctx.fillStyle = rgbCss(C.bg, 0.72);
    ctx.strokeStyle = rgbCss(C.border);
    ctx.lineWidth = 1;
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeRect(x0, y0, size, size);

    // grid every 2 units + center axes.
    ctx.strokeStyle = rgbCss(C.border, 0.4);
    ctx.lineWidth = 0.5;
    for (let g = -PLANE + 2; g < PLANE; g += 2) {
        const vx = toPx(g, 0).x; // vertical line at w = g
        const hy = toPx(0, g).y; // horizontal line at b = g
        ctx.beginPath();
        ctx.moveTo(vx, y0);
        ctx.lineTo(vx, y0 + size);
        ctx.moveTo(x0, hy);
        ctx.lineTo(x0 + size, hy);
        ctx.stroke();
    }
    const ctr = toPx(0, 0);
    ctx.strokeStyle = rgbCss(C.border, 0.7);
    ctx.beginPath();
    ctx.moveTo(ctr.x, y0);
    ctx.lineTo(ctr.x, y0 + size);
    ctx.moveTo(x0, ctr.y);
    ctx.lineTo(x0 + size, ctr.y);
    ctx.stroke();

    // P3 ghost probes.
    if (st.probes) {
        ctx.fillStyle = rgbCss(C.muted, 0.5);
        for (const pr of st.probes) {
            const p = toPx(pr.w, pr.b);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // trail + current position.
    const frames = st.frames;
    if (frames && frames.length) {
        const step = Math.max(0, Math.min(st.step, frames.length - 1));
        ctx.strokeStyle = rgbCss(C.accent, 0.8);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let pen = false;
        for (let k = 0; k <= step; k++) {
            const p = toPx(frames[k].w, frames[k].b);
            if (!pen || frames[k].jumped) {
                ctx.moveTo(p.x, p.y);
                pen = true;
            } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        const cur = toPx(frames[step].w, frames[step].b);
        ctx.fillStyle = rgbCss(C.accent);
        ctx.beginPath();
        ctx.arc(cur.x, cur.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = rgbCss(C.muted);
    ctx.font = `9px ${FONT_MONO}`;
    ctx.fillText("(w, b)", x0 + 4, y0 + 11);
}
