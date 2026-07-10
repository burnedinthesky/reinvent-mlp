/* P3 · Line — fit a single straight boundary and watch loss track accuracy.
   The left plot shows the real+hidden scatter with the live decision boundary
   for the z-scored line y_z = w·x_z + b (same parameterization as the loss
   landscape, so loss and accuracy agree). The operator reveal `p3_wb_plane`
   drives the layout:
     · off → w-only: 80/20 split, a vertical `w` slider (b locked at 0), with
       server accuracy + submission history in the right-upper panel.
     · on  → w+b: 50/50 split, the right half is a (w, b) square where you drag
       an anchor (starts centered). Each submission drops a permanent probe dot
       showing w/b/loss on hover; the anchor always shows (w=X.XX, b=X.XX).
   On submit the server returns every misclassified point id (including hidden
   test points); the frontend flashes them red, then fades — making the link
   between the boundary's loss and its accuracy tangible. */

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useCanvas } from "#/components/workshop/canvas/useCanvas";
import { Island, MicroLabel, PrimaryButton } from "#/components/workshop/ui";
import { lineLossZ, predictZ } from "#/lib/workshop/classifiers";
import { LINE_CAP } from "#/lib/workshop/constants";
import { CANONICAL_X, CANONICAL_Y } from "#/lib/workshop/features";
import { zStatsOf } from "#/lib/workshop/lossgrid";
import type { ZStats } from "#/lib/workshop/lossgrid";
import {
    drawFrame,
    drawZBoundary,
    plotGeom,
    pointPx,
} from "#/lib/workshop/draw/scatter";
import { C, CANVAS, CLASS_COLOR, rgbCss } from "#/lib/workshop/theme";
import { useWorkshop } from "#/state/workshop-context";

const CANON_VIEW = { x: CANONICAL_X, y: CANONICAL_Y };
const LIM = 4; // (w, b) live in [-4, 4] — the loss-landscape range
const FLASH_HOLD = 150; // ms held at full red before fading
const FLASH_FADE = 700; // ms fade to transparent
const FLASH_RGB = "248 81 73"; // wrong-answer red (outside the accent palette on purpose)

/** floored to 2 dp, as spec'd for the anchor readout (round *down*). */
const floor2 = (v: number) => (Math.floor(v * 100) / 100).toFixed(2);
const clampLim = (v: number) => Math.max(-LIM, Math.min(LIM, v));

export function P3Line() {
    const { config, points, reveals, service, store, patch, caps } =
        useWorkshop();
    const s = store.p3;
    // operator gate: off = slope-only (b locked at 0); on = full (w, b) plane.
    const wbMode = reveals?.p3_wb_plane === true;
    // operator gate: off (default) = scatter hidden, dots surface only on the
    // submit flash; on = show the full scatter.
    const showDots = reveals?.p3_show_dots === true;
    const bEff = wbMode ? s.b : 0;
    const [submitting, setSubmitting] = useState(false);
    const cap = caps.P3 ?? LINE_CAP;
    const left = cap - s.attempt;

    // draggable scoring panel (loss readout) — mirrors the P2/p4 grip so operators
    // can slide it off the plot. Floats top-left in both acts; content differs
    // (act 1 = readout + history, act 2 = readout + submit).
    const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });
    const panelDrag = useRef<{
        px: number;
        py: number;
        ox: number;
        oy: number;
    } | null>(null);
    const onPanelGrip = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        panelDrag.current = {
            px: e.clientX,
            py: e.clientY,
            ox: panelPos.x,
            oy: panelPos.y,
        };
        const move = (me: PointerEvent) => {
            const d = panelDrag.current;
            if (!d) return;
            setPanelPos({
                x: d.ox + (me.clientX - d.px),
                y: d.oy + (me.clientY - d.py),
            });
        };
        const up = () => {
            panelDrag.current = null;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    // standardization stats over the visible training slice — reconstructs the
    // landscape's zStats client-side (features only, no labels needed) so the
    // boundary + live accuracy match the server's loss/score exactly.
    const z = useMemo<ZStats>(
        () => zStatsOf(points.filter((p) => !p.hidden)),
        [points]
    );
    // "known" = points whose true label the student can see (real + revealed synth,
    // never the hidden test slice) — the set the live accuracy is scored against.
    const known = useMemo(
        () => points.filter((p) => !p.hidden && p.label != null),
        [points]
    );
    const visAcc = useMemo(() => {
        if (!known.length) return 0;
        let ok = 0;
        known.forEach((p) => {
            if (predictZ(p, z, s.w, bEff) === p.label) ok++;
        });
        return ok / known.length;
    }, [known, z, s.w, bEff]);
    // live loss over the known set — the primary readout (P3 is a loss phase),
    // on the same z-scored scale as the server's judged loss.
    const liveLoss = useMemo(
        () => lineLossZ(known, z, s.w, bEff),
        [known, z, s.w, bEff]
    );

    /* ---- red-flash animation for the misclassified points ---- */
    const flashRef = useRef<{ ids: Set<string>; start: number } | null>(null);
    const rafRef = useRef<number | null>(null);
    const paintRef = useRef<() => void>(() => {});
    const startFlash = (ids: string[]) => {
        if (!ids.length) return;
        flashRef.current = { ids: new Set(ids), start: performance.now() };
        const tick = () => {
            const f = flashRef.current;
            if (!f) return;
            paintRef.current();
            if (performance.now() - f.start >= FLASH_HOLD + FLASH_FADE) {
                flashRef.current = null;
                rafRef.current = null;
                paintRef.current(); // final clean frame
                return;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);
    };
    useEffect(
        () => () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        },
        []
    );

    /* ---- left plot: scatter + live boundary + flash overlay ---- */
    const { ref: leftRef, paint: paintLeft } = useCanvas(
        (ctx, W, H) => {
            if (!config) return;
            const g = plotGeom(CANON_VIEW, W, H, config.features);
            drawFrame(ctx, g, H);
            ctx.save();
            ctx.beginPath();
            ctx.rect(g.l, g.t, g.pw, g.ph);
            ctx.clip();
            drawZBoundary(ctx, g, z, s.w, bEff);
            // current flash alpha (0 when no flash is playing).
            const f = flashRef.current;
            let fa = 0;
            if (f) {
                const el = performance.now() - f.start;
                fa =
                    el < FLASH_HOLD
                        ? 1
                        : Math.max(0, 1 - (el - FLASH_HOLD) / FLASH_FADE);
            }
            // base scatter, colored by TRUE label (grey when unknown / hidden). When
            // the p3_show_dots reveal is off the data stays hidden and only fades in
            // with the flash — so ALL dots surface only on submit, never as grey.
            const ptA = showDots ? 1 : fa;
            if (ptA > 0) {
                ctx.globalAlpha = ptA;
                points.forEach((p) => {
                    const [x, y] = pointPx(p, CANON_VIEW, g);
                    const isKnown = !p.hidden && p.label != null;
                    if (p.real) {
                        ctx.beginPath();
                        ctx.arc(x, y, 4.8, 0, Math.PI * 2);
                        ctx.fillStyle = CLASS_COLOR[p.label as number];
                        ctx.fill();
                        ctx.lineWidth = 1.6;
                        ctx.strokeStyle = CANVAS.ptStroke;
                        ctx.stroke();
                    } else if (isKnown) {
                        ctx.beginPath();
                        ctx.arc(x, y, 3.6, 0, Math.PI * 2);
                        ctx.fillStyle = CLASS_COLOR[p.label as number];
                        ctx.fill();
                    } else {
                        ctx.beginPath();
                        ctx.arc(x, y, 3, 0, Math.PI * 2);
                        ctx.fillStyle = CANVAS.hidden;
                        ctx.fill();
                    }
                });
                ctx.globalAlpha = 1;
            }
            // red overlay on the misclassified points, on top of the base scatter.
            if (fa > 0 && f) {
                points.forEach((p) => {
                    if (!f.ids.has(p.id)) return;
                    const [x, y] = pointPx(p, CANON_VIEW, g);
                    ctx.beginPath();
                    ctx.arc(x, y, 6, 0, Math.PI * 2);
                    ctx.fillStyle = `rgb(${FLASH_RGB} / ${0.85 * fa})`;
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = `rgb(${FLASH_RGB} / ${fa})`;
                    ctx.stroke();
                });
            }
            ctx.restore();
        },
        [config, points, z, s.w, bEff, wbMode, showDots]
    );
    paintRef.current = paintLeft;

    const submit = async () => {
        if (left <= 0 || submitting) return;
        setSubmitting(true);
        try {
            const res = await service.submitLine({
                w: s.w,
                b: bEff,
                plane: wbMode,
            });
            patch("p3", (st) => ({
                attempt: res.attempt,
                loss: res.loss,
                full: res.acc_full,
                visible: res.acc_visible,
                probes: [
                    ...st.probes,
                    { w: s.w, b: bEff, loss: res.loss, acc: res.acc_full },
                ],
            }));
            startFlash(res.wrong);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "送出被拒絕");
        } finally {
            setSubmitting(false);
        }
    };

    if (!config) return null;

    const readout = (
        <Readout
            liveLoss={liveLoss}
            visAcc={visAcc}
            loss={s.loss}
            full={s.full}
        />
    );
    const submitRow = (
        <div className="flex items-center gap-2.5">
            <PrimaryButton
                onClick={submit}
                disabled={left <= 0 || submitting}
                className="flex-1 py-2 text-[13px]"
            >
                {submitting
                    ? "評分中…"
                    : left <= 0
                      ? "沒有剩餘機會"
                      : "送出評分"}
            </PrimaryButton>
            <span className="font-mono text-[11px] tracking-wide text-muted uppercase">
                {String(s.attempt).padStart(2, "0")}/{cap}
            </span>
        </div>
    );

    return (
        <div className="absolute inset-3.5 flex gap-3.5">
            {/* left — data plot + live boundary */}
            <div
                className="relative overflow-hidden rounded-[14px] border border-border bg-bg"
                style={{ flexGrow: wbMode ? 1 : 4, flexBasis: 0, minWidth: 0 }}
            >
                <canvas ref={leftRef} className="block h-full w-full" />
            </div>

            {/* right — controls, laid out by mode */}
            <div
                className="flex min-w-0 flex-col gap-3.5"
                style={{ flexGrow: 1, flexBasis: 0 }}
            >
                {wbMode ? (
                    // act 2: the right half is just the (w, b) square — the loss readout
                    // and submit live in the draggable floating panel below.
                    <Island className="relative min-h-0 flex-1 overflow-hidden">
                        <WBSquare
                            w={s.w}
                            b={s.b}
                            probes={s.probes}
                            onChange={(w, b) => patch("p3", { w, b })}
                        />
                    </Island>
                ) : (
                    // act 1: the readout + history live in the floating panel below; the
                    // right column is just the slope slider + submit.
                    <>
                        <Island className="min-h-0 flex-1">
                            <WSlider
                                w={s.w}
                                onChange={(w) => patch("p3", { w })}
                            />
                        </Island>
                        {submitRow}
                    </>
                )}
            </div>

            {/* draggable scoring panel, floating at the top-left (mirrors p4's grip).
          act 1 shows the readout + submission history; act 2 swaps history for
          the submit row (submit lives in the right column in act 1). */}
            <div
                className="absolute top-2 left-2 z-20 w-[248px]"
                style={{
                    transform: `translate(${panelPos.x}px, ${panelPos.y}px)`,
                }}
            >
                <Island className="overflow-hidden">
                    <button
                        type="button"
                        aria-label="拖曳面板，點兩下重設位置"
                        onPointerDown={onPanelGrip}
                        onDoubleClick={() => setPanelPos({ x: 0, y: 0 })}
                        className="flex w-full touch-none cursor-grab items-center justify-center py-1.5 transition-colors hover:bg-border/30 active:cursor-grabbing"
                    >
                        <span className="h-1 w-8 rounded-full bg-border" />
                    </button>
                    <div className="px-3.5 pt-1 pb-3">
                        {readout}
                        {wbMode ? (
                            <div className="mt-2.5 border-t border-border/40 pt-2.5">
                                {submitRow}
                            </div>
                        ) : (
                            <History probes={s.probes} />
                        )}
                    </div>
                </Island>
            </div>
        </div>
    );
}

/* Loss-primary readout (P3 is a loss phase): live loss + last judged loss are
   the headline numbers, each with its accuracy as the small secondary line. */
function Readout({
    liveLoss,
    visAcc,
    loss,
    full,
}: {
    liveLoss: number;
    visAcc: number;
    loss: number | null;
    full: number | null;
}) {
    return (
        <div className="flex items-stretch gap-3">
            <div className="flex-1">
                <MicroLabel>即時 · loss</MicroLabel>
                <div className="mt-0.5 font-mono text-2xl font-semibold text-fg">
                    {liveLoss.toFixed(3)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted">
                    準確率 {(visAcc * 100).toFixed(1)}%
                </div>
            </div>
            <div className="flex-1 border-l border-border/40 pl-3">
                <MicroLabel>評分 loss</MicroLabel>
                <div
                    className={`mt-0.5 font-mono text-2xl font-semibold ${
                        loss == null ? "text-muted" : "text-accent"
                    }`}
                >
                    {loss == null ? "--" : loss.toFixed(3)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted">
                    準確率 {full == null ? "--" : `${full.toFixed(1)}%`}
                </div>
            </div>
        </div>
    );
}

/* Submission history — most recent first (w+b mode shows this as probe dots). */
function History({
    probes,
}: {
    probes: { w: number; b: number; loss: number; acc: number }[];
}) {
    if (!probes.length) return null;
    return (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-border/40 pt-2.5">
            <MicroLabel>歷史紀錄</MicroLabel>
            <div className="mt-0.5 flex max-h-40 flex-col gap-0.5 overflow-auto">
                {probes
                    .map((p, i) => ({ p, i }))
                    .reverse()
                    .map(({ p, i }) => (
                        <div
                            key={i}
                            className="flex items-center justify-between font-mono text-[11px] text-muted"
                        >
                            <span className="text-fg">
                                #{String(i + 1).padStart(2, "0")}
                            </span>
                            <span>loss {p.loss.toFixed(3)}</span>
                            <span>{p.acc.toFixed(1)}%</span>
                        </div>
                    ))}
            </div>
        </div>
    );
}

/* Vertical slope slider (w ∈ [-4, 4]); b stays locked at 0 in this mode. */
function WSlider({
    w,
    onChange,
}: {
    w: number;
    onChange: (w: number) => void;
}) {
    return (
        <div className="flex h-full flex-col items-center gap-2 px-3 py-3.5">
            <MicroLabel>w · 斜率</MicroLabel>
            <span className="font-mono text-lg font-semibold text-fg">
                {(w >= 0 ? "+" : "") + w.toFixed(2)}
            </span>
            <div className="flex min-h-0 flex-1 items-center">
                <input
                    type="range"
                    min={-LIM}
                    max={LIM}
                    step={0.01}
                    value={w}
                    onChange={(e) => onChange(Number(e.target.value))}
                    aria-label="斜率 w"
                    className="cursor-pointer accent-accent"
                    style={{
                        writingMode: "vertical-lr",
                        direction: "rtl",
                        height: "100%",
                        width: 22,
                    }}
                />
            </div>
            <div className="flex w-full justify-between font-mono text-[10px] text-muted">
                <span>−{LIM}</span>
                <span>+{LIM}</span>
            </div>
        </div>
    );
}

/* ---------- (w, b) square with a draggable anchor + permanent probe dots ---------- */
type Probe = { w: number; b: number; loss: number; acc: number };

function WBSquare({
    w,
    b,
    probes,
    onChange,
}: {
    w: number;
    b: number;
    probes: Probe[];
    onChange: (w: number, b: number) => void;
}) {
    const dragRef = useRef(false);
    const geomRef = useRef<{ l: number; t: number; pw: number; ph: number }>({
        l: 0,
        t: 0,
        pw: 0,
        ph: 0,
    });
    const [hover, setHover] = useState<{
        x: number;
        y: number;
        p: Probe;
    } | null>(null);

    const sq = (W: number, H: number) => {
        const m = 30;
        return { l: m, t: m, pw: W - 2 * m, ph: H - 2 * m };
    };
    const toPx = (
        pw_: number,
        pb: number,
        g: { l: number; t: number; pw: number; ph: number }
    ): [number, number] => [
        g.l + ((pw_ + LIM) / (2 * LIM)) * g.pw,
        g.t + (1 - (pb + LIM) / (2 * LIM)) * g.ph,
    ];
    const toVal = (
        px: number,
        py: number,
        g: { l: number; t: number; pw: number; ph: number }
    ): [number, number] => [
        clampLim(((px - g.l) / g.pw) * 2 * LIM - LIM),
        clampLim((1 - (py - g.t) / g.ph) * 2 * LIM - LIM),
    ];

    const { ref, paint } = useCanvas(
        (ctx, W, H) => {
            const g = sq(W, H);
            geomRef.current = g;
            // plate
            ctx.fillStyle = rgbCss(C.bg);
            ctx.fillRect(g.l, g.t, g.pw, g.ph);
            // grid every 2 units
            ctx.strokeStyle = rgbCss(C.border, 0.22);
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let v = -LIM; v <= LIM; v += 2) {
                const [gx] = toPx(v, 0, g);
                const [, gy] = toPx(0, v, g);
                ctx.moveTo(gx, g.t);
                ctx.lineTo(gx, g.t + g.ph);
                ctx.moveTo(g.l, gy);
                ctx.lineTo(g.l + g.pw, gy);
            }
            ctx.stroke();
            // centre axes (w=0, b=0)
            ctx.strokeStyle = rgbCss(C.border, 0.6);
            ctx.beginPath();
            const [cx] = toPx(0, 0, g);
            const [, cy] = toPx(0, 0, g);
            ctx.moveTo(cx, g.t);
            ctx.lineTo(cx, g.t + g.ph);
            ctx.moveTo(g.l, cy);
            ctx.lineTo(g.l + g.pw, cy);
            ctx.stroke();
            // axis names
            ctx.fillStyle = CANVAS.axisName;
            ctx.font = `600 10px ${"IBM Plex Mono, monospace"}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText("W · 斜率", g.l + g.pw / 2, g.t + g.ph + 10);
            ctx.save();
            ctx.translate(g.l - 12, g.t + g.ph / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText("B · 高度", 0, 0);
            ctx.restore();
            // permanent probe dots
            probes.forEach((p) => {
                const [x, y] = toPx(p.w, p.b, g);
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = rgbCss(C.accent2, 0.85);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = rgbCss(C.bg);
                ctx.stroke();
            });
            // hovered probe ring
            if (hover) {
                const [x, y] = toPx(hover.p.w, hover.p.b, g);
                ctx.beginPath();
                ctx.arc(x, y, 7, 0, Math.PI * 2);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = rgbCss(C.accent2);
                ctx.stroke();
            }
            // anchor (the focused/hot thing → lime)
            const [ax, ay] = toPx(w, b, g);
            ctx.beginPath();
            ctx.arc(ax, ay, 8, 0, Math.PI * 2);
            ctx.fillStyle = rgbCss(C.panel);
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = rgbCss(C.accent);
            ctx.stroke();
            // anchor readout (w=…, b=…)
            const label = `(w=${floor2(w)}, b=${floor2(b)})`;
            ctx.font = `600 11px ${"IBM Plex Mono, monospace"}`;
            ctx.textBaseline = "bottom";
            const flip = ax > g.l + g.pw - 90;
            ctx.textAlign = flip ? "right" : "left";
            ctx.fillStyle = rgbCss(C.fg);
            ctx.fillText(label, ax + (flip ? -12 : 12), ay - 10);
        },
        [w, b, probes, hover]
    );

    const evtPx = (e: React.MouseEvent): [number, number] => {
        const rect = (
            e.currentTarget as HTMLCanvasElement
        ).getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    };
    const onDown = (e: React.MouseEvent) => {
        dragRef.current = true;
        const [px, py] = evtPx(e);
        const [nw, nb] = toVal(px, py, geomRef.current);
        onChange(nw, nb);
        setHover(null);
    };
    const onMove = (e: React.MouseEvent) => {
        const [px, py] = evtPx(e);
        const g = geomRef.current;
        if (dragRef.current) {
            const [nw, nb] = toVal(px, py, g);
            onChange(nw, nb);
            return;
        }
        // hover: nearest probe within 10px
        let best: { x: number; y: number; p: Probe } | null = null;
        let bestD = 11;
        probes.forEach((p) => {
            const [x, y] = toPx(p.w, p.b, g);
            const d = Math.hypot(px - x, py - y);
            if (d < bestD) {
                bestD = d;
                best = { x, y, p };
            }
        });
        setHover(best);
    };
    const end = () => {
        dragRef.current = false;
    };
    useEffect(() => {
        paint();
    }, [paint]);

    return (
        <div className="absolute inset-0">
            <canvas
                ref={ref}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={end}
                onMouseLeave={() => {
                    end();
                    setHover(null);
                }}
                className="block h-full w-full cursor-crosshair"
            />
            {hover && (
                <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-panel px-2 py-1 font-mono text-[10px] whitespace-nowrap text-fg shadow-lg"
                    style={{ left: hover.x, top: hover.y - 10 }}
                >
                    w={floor2(hover.p.w)} · b={floor2(hover.p.b)} · loss{" "}
                    {hover.p.loss.toFixed(3)}
                </div>
            )}
        </div>
    );
}
