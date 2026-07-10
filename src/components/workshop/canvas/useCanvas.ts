/* Canvas sizing hook: DPR scaling + ResizeObserver on the parent, matching the
   prototype's ref-callback + observer pattern. `draw(ctx, w, h)` receives logical
   (CSS-pixel) dimensions and a pre-scaled, pre-cleared context. Returns the
   canvas ref and a `paint()` for manual redraws (animation loops, replays). */

import { useCallback, useEffect, useRef } from "react";

export type DrawFn = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
) => void;

export function useCanvas(draw: DrawFn, deps: unknown[]) {
    const ref = useRef<HTMLCanvasElement | null>(null);
    const drawRef = useRef(draw);
    drawRef.current = draw;

    const paint = useCallback(() => {
        const cv = ref.current;
        const parent = cv?.parentElement;
        if (!cv || !parent) return;
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        if (w < 1 || h < 1) return;
        const dpr = window.devicePixelRatio || 1;
        const W = Math.round(w * dpr);
        const H = Math.round(h * dpr);
        if (cv.width !== W || cv.height !== H) {
            cv.width = W;
            cv.height = H;
        }
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        drawRef.current(ctx, w, h);
    }, []);

    // observe the parent for size changes (mount once).
    useEffect(() => {
        const cv = ref.current;
        const parent = cv?.parentElement;
        if (!parent) return;
        const ro = new ResizeObserver(() => paint());
        ro.observe(parent);
        paint();
        return () => ro.disconnect();
    }, [paint]);

    // repaint when the caller's dependencies change.
    useEffect(() => paint(), [paint, ...deps]);

    return { ref, paint };
}

/** current logical size of a canvas element (CSS pixels of its parent box). */
export function canvasSize(cv: HTMLCanvasElement | null): {
    w: number;
    h: number;
} {
    const parent = cv?.parentElement;
    return { w: parent?.clientWidth ?? 0, h: parent?.clientHeight ?? 0 };
}
