/* P4 loss-vs-epoch curve (P4 redesign §6). Bottom-left overlay: X = epoch 0..100,
   Y = stage gMin..gMax. A live jagged polyline of the batch=1 readings
   (frames[0..step].read) draws as the replay advances; once the replay reaches
   epoch 100 the smooth TRUE-loss curve (truePath) overlays in the accent color
   with a JUDGE dot at the final spot. Pure canvas via useCanvas. */

import { useCanvas } from "#/components/workshop/canvas/useCanvas";
import { C, FONT_MONO, rgbCss } from "#/lib/workshop/theme";
import type { StageRunResult } from "#/lib/workshop/types";

const PADL = 34;
const PADR = 8;
const PADT = 16;
const PADB = 16;

export function LossCurve({
    result,
    step,
    gMin,
    gMax,
}: {
    result: StageRunResult | null;
    step: number;
    gMin: number;
    gMax: number;
}) {
    const { ref } = useCanvas(
        (ctx, W, H) => {
            ctx.clearRect(0, 0, W, H);
            // frame.
            const x0 = PADL;
            const x1 = W - PADR;
            const y0 = PADT;
            const y1 = H - PADB;
            const range = gMax - gMin || 1;
            const xOf = (epoch: number) => x0 + (epoch / 100) * (x1 - x0);
            const yOf = (loss: number) =>
                y1 -
                ((Math.max(gMin, Math.min(gMax, loss)) - gMin) / range) *
                    (y1 - y0);

            // axes.
            ctx.strokeStyle = rgbCss(C.border, 0.6);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0, y1);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            ctx.fillStyle = rgbCss(C.muted);
            ctx.font = `9px ${FONT_MONO}`;
            ctx.fillText("loss", 2, y0 + 4);
            ctx.fillText("epoch", x1 - 34, H - 3);
            ctx.fillText(gMax.toFixed(1), 2, y0 + 12);
            ctx.fillText(gMin.toFixed(1), 2, y1);

            if (!result) return;
            const frames = result.frames;
            const s = Math.max(0, Math.min(step, frames.length - 1));

            // live jagged batch=1 readings up to the current step.
            ctx.strokeStyle = rgbCss(C.accent2, 0.85);
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let k = 0; k <= s; k++) {
                const p = { x: xOf(k), y: yOf(frames[k].read) };
                if (k === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();

            // at JUDGE (replay reached epoch 100), overlay the smooth true-loss curve.
            if (s >= 100 && result.truePath.length === frames.length) {
                ctx.strokeStyle = rgbCss(C.accent);
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                result.truePath.forEach((L, k) => {
                    const p = { x: xOf(k), y: yOf(L) };
                    if (k === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                ctx.stroke();
                // JUDGE dot at the final true loss.
                const jp = { x: xOf(100), y: yOf(result.trueLoss) };
                ctx.fillStyle = rgbCss(C.accent);
                ctx.beginPath();
                ctx.arc(jp.x, jp.y, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
        },
        [result, step, gMin, gMax]
    );

    return (
        <div className="pointer-events-none absolute bottom-3.5 left-3.5 h-[130px] w-[300px] rounded-md border border-border bg-bg/85 backdrop-blur-sm">
            <canvas ref={ref} className="block h-full w-full" />
        </div>
    );
}
