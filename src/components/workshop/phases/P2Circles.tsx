/* P2 · Circles — hand-drawn decision regions over a scatter of the real +
   hidden test points. Lasso a free-form shape, assign each a class, submit for scoring.
   Multiple views (each its own X/Y axes + lassos) combine by majority vote; the
   drawer switches the edited view and previews the aggregate classifier. */

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useCanvas } from "#/components/workshop/canvas/useCanvas";
import {
    Dock,
    DockDivider,
    GhostButton,
    Island,
    MicroLabel,
    PrimaryButton,
    SegmentedControl,
    Select,
} from "#/components/workshop/ui";
import {
    circlesAccuracy,
    lineLoss,
    pointInPolygon,
    polygonCentroid,
    predictCirclesMulti,
    predictLine,
} from "#/lib/workshop/classifiers";
import { CIRCLE_CAP } from "#/lib/workshop/constants";
import { CANONICAL_X, CANONICAL_Y } from "#/lib/workshop/features";
import {
    drawFrame,
    plotGeom,
    pointPx,
    px2dx,
    px2dy,
    regionPathPx,
} from "#/lib/workshop/draw/scatter";
import type { PlotGeom } from "#/lib/workshop/draw/scatter";
import {
    C as PAL,
    CANVAS,
    CLASS_COLOR,
    CLASS_FILL,
    rgbCss,
} from "#/lib/workshop/theme";
import type {
    CircleRegion,
    CirclesView,
    ClassLabel,
    DataPoint,
    FeatureKey,
} from "#/lib/workshop/types";
import { useI18n } from "#/lib/i18n/context";
import { useWorkshop } from "#/state/workshop-context";

type Pt = { x: number; y: number };
type Draft = Pt[] | null; // live lasso path in feature space
type Drag =
    | { type: "new"; lpx: number; lpy: number } // last sampled pixel position
    | { type: "move"; lx: number; ly: number } // last cursor in feature space
    | null;

/* Draw the line-mode decision boundary y = wx·x + b and tint each half-plane by
   its class. Works in the normalized [0,1]² box (axes are scaled to their
   feature range) and maps to pixels — split the box polygon by the line, fill
   the above side (class 1) and the below side (class 0). */
function drawBoundary(
    ctx: CanvasRenderingContext2D,
    g: PlotGeom,
    line: { wx: number; b: number }
) {
    const n2px = (n: Pt): [number, number] => [
        g.l + n.x * g.pw,
        g.t + (1 - n.y) * g.ph,
    ];
    const corners: Pt[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
    ];
    // signed distance above the boundary line y = wx·x + b; > 0 → class 1.
    const score = (n: Pt) => n.y - (line.wx * n.x + line.b);
    const pos: Pt[] = [];
    const neg: Pt[] = [];
    const edge: Pt[] = []; // the (≤2) points where the boundary crosses the box
    for (let i = 0; i < corners.length; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % corners.length];
        const sa = score(a);
        const sb = score(b);
        if (sa >= 0) pos.push(a);
        else neg.push(a);
        if (sa > 0 !== sb > 0 && sa !== sb) {
            const t = sa / (sa - sb);
            const cx = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            pos.push(cx);
            neg.push(cx);
            edge.push(cx);
        }
    }
    const fillPoly = (poly: Pt[], cls: 0 | 1) => {
        if (poly.length < 3) return;
        ctx.beginPath();
        poly.forEach((n, i) => {
            const [x, y] = n2px(n);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = CLASS_FILL[cls];
        ctx.fill();
    };
    fillPoly(pos, 1);
    fillPoly(neg, 0);
    if (edge.length === 2) {
        const [p1, p2] = edge.map(n2px);
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.strokeStyle = CLASS_COLOR[1];
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
}

export function P2Circles() {
    const { t } = useI18n();
    const { config, points, reveals, service, store, patch, caps } =
        useWorkshop();
    const s = store.p2;
    // hard operator switch: off = lasso (default), on = line mode (y = wx·x + b).
    const lineMode = reveals?.p2_line_mode === true;
    const [draft, setDraft] = useState<Draft>(null);
    // in-flight guard so the submit button shows a judging state and can't refire.
    const [submitting, setSubmitting] = useState(false);
    const dragRef = useRef<Drag>(null);
    // line-mode drag: a boundary handle (0 = left, 1 = right) changes slope +
    // intercept; a 'bias' drag grabs the line body and shifts b vertically (slope
    // unchanged). py0/b0 anchor the vertical delta so there's no drift.
    const lineDragRef = useRef<
        | { type: "handle"; i: 0 | 1 }
        | { type: "bias"; py0: number; b0: number }
        | null
    >(null);

    // draggable aggregation panel (mirrors the Dock grip behaviour).
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

    // the view being edited (clamped in case a delete left activeView stale).
    const ai = Math.min(s.activeView, s.views.length - 1);
    const view = s.views[ai];
    // the active classifier for a single point — line mode uses the y = wx·x + b
    // boundary over the current view's axes; lasso mode the majority-vote ensemble.
    // Used for the live mirror, preview recolor, and the submitted labels alike.
    const predictP2 = (p: DataPoint): ClassLabel =>
        lineMode
            ? predictLine(p, view.x, view.y, s.line)
            : predictCirclesMulti(p, s.views, s.defaultCls);
    // the known training set the live number scores against: the real slice (shown
    // from P2) plus the synthetic slice once reveal100 ships its labels. Points
    // whose label the server still withholds are excluded so an unrevealed synthetic
    // point can't drag the accuracy down against a label the student can't see.
    const isKnown = (p: DataPoint) => !p.hidden && p.label != null;
    // headline accuracy = the metric that gets submitted, over the known set.
    const visAcc = useMemo(() => {
        if (!config) return 0;
        const set = points.filter(isKnown);
        if (!set.length) return 0;
        let ok = 0;
        set.forEach((p) => {
            if (predictP2(p) === p.label) ok++;
        });
        return ok / set.length;
    }, [
        config,
        points,
        lineMode,
        s.views,
        s.defaultCls,
        s.line,
        view.x,
        view.y,
    ]);
    // line-mode logistic loss over the same known set (only shown in line mode).
    const visLoss = useMemo(
        () =>
            config && lineMode
                ? lineLoss(points, view.x, view.y, s.line, isKnown)
                : 0,
        [config, lineMode, points, s.line, view.x, view.y]
    );
    const viewAcc = (v: CirclesView) =>
        config ? circlesAccuracy(points, v, s.defaultCls, isKnown) : 0;
    const cap = caps.P2 ?? CIRCLE_CAP;
    const left = cap - s.attempt;

    /* ---- line-mode handles (P5-style) ---- */
    // the two handles in normalized [0,1]² space: fixed x-anchors, y read off the
    // current boundary so they ride it exactly. This is what keeps the handles and
    // the wx/b sliders in sync — both render from the same line.
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const LINE_LIM = 5; // matches the slider range (−5…5)
    const HANDLE_SEP = 0.08; // min horizontal gap so the line never goes vertical
    const lineHandlesNorm = (): { x: number; y: number }[] =>
        s.lineHX.map((ax) => ({
            x: ax,
            y: clamp01(s.line.wx * ax + s.line.b),
        }));

    const geomOf = (rect: DOMRect): PlotGeom =>
        plotGeom(view, rect.width, rect.height, config!.features);

    const { ref } = useCanvas(
        (ctx, W, H) => {
            if (!config) return;
            const g = plotGeom(view, W, H, config.features);
            drawFrame(ctx, g, H);
            ctx.save();
            ctx.beginPath();
            ctx.rect(g.l, g.t, g.pw, g.ph);
            ctx.clip();
            if (lineMode) {
                drawBoundary(ctx, g, s.line);
                // two round handles riding the boundary — their y is derived from the
                // line, so they stay glued to it as the wx/b sliders (or a drag) move.
                lineHandlesNorm().forEach((n) => {
                    const hx = g.l + n.x * g.pw;
                    const hy = g.t + (1 - n.y) * g.ph;
                    ctx.beginPath();
                    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
                    ctx.fillStyle = rgbCss(PAL.panel);
                    ctx.fill();
                    ctx.lineWidth = 2.4;
                    ctx.strokeStyle = CLASS_COLOR[1];
                    ctx.stroke();
                });
            } else {
                const traceRegion = (
                    c: CircleRegion,
                    sel: boolean,
                    isDraft: boolean
                ) => {
                    const pts = regionPathPx(c, g);
                    if (pts.length < 2) return;
                    ctx.beginPath();
                    ctx.moveTo(pts[0][0], pts[0][1]);
                    for (let i = 1; i < pts.length; i++)
                        ctx.lineTo(pts[i][0], pts[i][1]);
                    ctx.closePath();
                    ctx.fillStyle = CLASS_FILL[c.cls];
                    ctx.fill();
                    ctx.strokeStyle = CLASS_COLOR[c.cls];
                    ctx.lineWidth = sel ? 2.5 : 1.6;
                    if (isDraft) ctx.setLineDash([6, 4]);
                    ctx.stroke();
                    if (isDraft) ctx.setLineDash([]);
                };
                view.circles.forEach((c, i) =>
                    traceRegion(c, i === s.selected, false)
                );
                if (draft && draft.length >= 2)
                    traceRegion({ pts: draft, cls: s.brush }, false, true);
            }
            points.forEach((p) => {
                const [x, y] = pointPx(p, view, g);
                // preview mode: recolor every point by the active classifier so the
                // decision is visible; else true labels / grey. Applies to both modes.
                const showPred = s.preview;
                // a point is a labeled training point once its label has shipped: the real
                // slice (from P2) and the synthetic slice once reveal100 flips. Hidden test
                // points — and synthetic points before reveal100 — stay grey.
                const known = !p.hidden && p.label != null;
                if (p.real) {
                    ctx.beginPath();
                    ctx.arc(x, y, 4.8, 0, Math.PI * 2);
                    ctx.fillStyle = showPred
                        ? CLASS_COLOR[predictP2(p)]
                        : CLASS_COLOR[p.label as number];
                    ctx.fill();
                    ctx.lineWidth = 1.6;
                    ctx.strokeStyle = CANVAS.ptStroke;
                    ctx.stroke();
                } else if (known) {
                    // revealed synthetic training point — smaller than a real dot, colored by
                    // its true label (or by the prediction in preview / line mode).
                    ctx.beginPath();
                    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
                    ctx.fillStyle = showPred
                        ? CLASS_COLOR[predictP2(p)]
                        : CLASS_COLOR[p.label as number];
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = showPred
                        ? CLASS_COLOR[predictP2(p)]
                        : CANVAS.hidden;
                    ctx.fill();
                }
            });
            ctx.restore();
        },
        [
            config,
            points,
            view,
            lineMode,
            s.activeView,
            s.views,
            s.selected,
            s.preview,
            s.defaultCls,
            s.line,
            s.lineHX,
            draft,
        ]
    );

    /* ---- interactions ---- */
    const evtPos = (e: React.MouseEvent): [number, number, PlotGeom] => {
        const rect = (
            e.currentTarget as HTMLCanvasElement
        ).getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top, geomOf(rect)];
    };

    /* ---- line-mode handle drag (P5-style; two-way synced with wx/b) ---- */
    const lineHit = (px: number, py: number, g: PlotGeom): 0 | 1 | null => {
        const hs = lineHandlesNorm();
        for (const i of [0, 1] as const) {
            const hx = g.l + hs[i].x * g.pw;
            const hy = g.t + (1 - hs[i].y) * g.ph;
            if (Math.hypot(px - hx, py - hy) < 13) return i;
        }
        return null;
    };

    // over the line body (but not a handle)? Used for the ns-resize affordance and
    // to start a vertical bias drag. Compares the cursor's pixel y to the line's y
    // at the cursor's x; a hit needs the line to actually cross the box there.
    const LINE_BODY_TOL = 8; // px
    const lineBodyHit = (px: number, py: number, g: PlotGeom): boolean => {
        const nx = (px - g.l) / g.pw;
        if (nx < 0 || nx > 1) return false;
        const ly = s.line.wx * nx + s.line.b;
        if (ly < 0 || ly > 1) return false;
        const lyPx = g.t + (1 - ly) * g.ph;
        return Math.abs(py - lyPx) < LINE_BODY_TOL;
    };

    const onLineDown = (e: React.PointerEvent) => {
        const [px, py, g] = evtPos(e);
        const hit = lineHit(px, py, g);
        if (hit != null) {
            lineDragRef.current = { type: "handle", i: hit };
            // keep the handle drag alive past the canvas edge / overlays until release.
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
        }
        if (lineBodyHit(px, py, g)) {
            lineDragRef.current = { type: "bias", py0: py, b0: s.line.b };
            e.currentTarget.setPointerCapture(e.pointerId);
        }
    };

    const onLineMove = (e: React.MouseEvent) => {
        const [px, py, g] = evtPos(e);
        const d = lineDragRef.current;
        if (d == null) {
            const overHandle = lineHit(px, py, g) != null;
            const overLine = !overHandle && lineBodyHit(px, py, g);
            (e.currentTarget as HTMLCanvasElement).style.cursor = overHandle
                ? "grab"
                : overLine
                  ? "ns-resize"
                  : "default";
            return;
        }
        if (d.type === "bias") {
            // vertical drag → shift the intercept; positive when moving up (pixel y
            // grows downward). Slope and handle x-anchors stay put.
            const dny = (d.py0 - py) / g.ph;
            patch("p2", (st) => ({
                line: {
                    ...st.line,
                    b: Math.max(-LINE_LIM, Math.min(LINE_LIM, d.b0 + dny)),
                },
            }));
            return;
        }
        // cursor → normalized target for the dragged handle.
        const nx = clamp01((px - g.l) / g.pw);
        const ny = clamp01(1 - (py - g.t) / g.ph);
        patch("p2", (st) => {
            const other = d.i === 0 ? 1 : 0;
            const axOther = st.lineHX[other];
            const yOther = clamp01(st.line.wx * axOther + st.line.b);
            // keep the handle on its own side, a min gap away, so slope stays finite.
            let ax = nx;
            if (Math.abs(ax - axOther) < HANDLE_SEP)
                ax = clamp01(
                    axOther + (ax >= axOther ? HANDLE_SEP : -HANDLE_SEP)
                );
            if (Math.abs(ax - axOther) < HANDLE_SEP) return {};
            // the line through the dragged point and the anchored other handle,
            // clamped to the slider range so both stay reachable from the sliders.
            const wx = Math.max(
                -LINE_LIM,
                Math.min(LINE_LIM, (ny - yOther) / (ax - axOther))
            );
            const b = Math.max(
                -LINE_LIM,
                Math.min(LINE_LIM, yOther - wx * axOther)
            );
            const hx: [number, number] = [...st.lineHX];
            hx[d.i] = ax;
            return { line: { wx, b }, lineHX: hx };
        });
    };

    const onLineUp = () => {
        lineDragRef.current = null;
    };

    // map over the circles of the currently-active view only.
    const setCircles = (fn: (cs: CircleRegion[]) => CircleRegion[]) =>
        patch("p2", (st) => {
            const i = Math.min(st.activeView, st.views.length - 1);
            return {
                views: st.views.map((v, j) =>
                    j === i ? { ...v, circles: fn(v.circles) } : v
                ),
            };
        });

    // hit-test a region's pixel polygon under the cursor.
    const hitRegion = (px: number, py: number, g: PlotGeom): number => {
        for (let i = view.circles.length - 1; i >= 0; i--) {
            const path = regionPathPx(view.circles[i], g).map(([x, y]) => ({
                x,
                y,
            }));
            if (pointInPolygon(px, py, path)) return i;
        }
        return -1;
    };

    const onDown = (e: React.PointerEvent) => {
        const [px, py, g] = evtPos(e);
        // capture the pointer so the lasso keeps tracking even when the cursor moves
        // over an overlay (dock, scoring panel) or off the canvas — ends on release.
        e.currentTarget.setPointerCapture(e.pointerId);
        const hit = hitRegion(px, py, g);
        if (hit >= 0) {
            dragRef.current = {
                type: "move",
                lx: px2dx(px, g),
                ly: px2dy(py, g),
            };
            patch("p2", { selected: hit });
            return;
        }
        dragRef.current = { type: "new", lpx: px, lpy: py };
        setDraft([{ x: px2dx(px, g), y: px2dy(py, g) }]);
        patch("p2", { selected: -1 });
    };

    const onMove = (e: React.MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const [px, py, g] = evtPos(e);
        if (drag.type === "new") {
            // sample a vertex only once the cursor has moved a few pixels.
            if (Math.hypot(px - drag.lpx, py - drag.lpy) < 4) return;
            drag.lpx = px;
            drag.lpy = py;
            setDraft((d) => [
                ...(d ?? []),
                { x: px2dx(px, g), y: px2dy(py, g) },
            ]);
        } else {
            const dx = px2dx(px, g);
            const dy = px2dy(py, g);
            const mx = dx - drag.lx;
            const my = dy - drag.ly;
            drag.lx = dx;
            drag.ly = dy;
            setCircles((cs) =>
                cs.map((c, j) =>
                    j === s.selected
                        ? {
                              ...c,
                              pts: c.pts.map((p) => ({
                                  x: p.x + mx,
                                  y: p.y + my,
                              })),
                          }
                        : c
                )
            );
        }
    };

    const bbox = (pts: Pt[]) => {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        pts.forEach((p) => {
            x0 = Math.min(x0, p.x);
            y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x);
            y1 = Math.max(y1, p.y);
        });
        return { w: x1 - x0, h: y1 - y0 };
    };

    const onUp = (e: React.MouseEvent) => {
        const drag = dragRef.current;
        if (drag && drag.type === "new") {
            const [, , g] = evtPos(e);
            const minW = (g.xm.max - g.xm.min) * 0.015;
            const minH = (g.ym.max - g.ym.min) * 0.015;
            if (draft && draft.length >= 3) {
                const bb = bbox(draft);
                if (bb.w >= minW && bb.h >= minH) {
                    const region = { pts: draft, cls: s.brush };
                    patch("p2", (st) => {
                        const i = Math.min(st.activeView, st.views.length - 1);
                        return {
                            views: st.views.map((v, j) =>
                                j === i
                                    ? { ...v, circles: [...v.circles, region] }
                                    : v
                            ),
                            selected: st.views[i].circles.length,
                        };
                    });
                }
            }
            setDraft(null);
        }
        dragRef.current = null;
    };

    // safe-abort path if the browser revokes pointer capture mid-drag
    // (pointercancel). Normal completion goes through onUp / onLineUp.
    const onCancel = () => {
        if (dragRef.current && dragRef.current.type === "new") setDraft(null);
        dragRef.current = null;
        lineDragRef.current = null;
    };

    const onWheel = (e: React.WheelEvent) => {
        if (s.selected < 0) return;
        const f = 1 - e.deltaY * 0.0016;
        setCircles((cs) =>
            cs.map((c, j) => {
                if (j !== s.selected) return c;
                const ct = polygonCentroid(c.pts);
                return {
                    ...c,
                    pts: c.pts.map((p) => ({
                        x: ct.x + (p.x - ct.x) * f,
                        y: ct.y + (p.y - ct.y) * f,
                    })),
                };
            })
        );
    };

    const setBrushOrRecolor = (cls: ClassLabel) => {
        if (s.selected >= 0) {
            patch("p2", (st) => {
                const i = Math.min(st.activeView, st.views.length - 1);
                return {
                    views: st.views.map((v, j) =>
                        j === i
                            ? {
                                  ...v,
                                  circles: v.circles.map((c, k) =>
                                      k === st.selected ? { ...c, cls } : c
                                  ),
                              }
                            : v
                    ),
                    brush: cls,
                };
            });
        } else patch("p2", { brush: cls });
    };
    const deleteSelected = () => {
        if (s.selected < 0) return;
        patch("p2", (st) => {
            const i = Math.min(st.activeView, st.views.length - 1);
            return {
                views: st.views.map((v, j) =>
                    j === i
                        ? {
                              ...v,
                              circles: v.circles.filter(
                                  (_, k) => k !== st.selected
                              ),
                          }
                        : v
                ),
                selected: -1,
            };
        });
    };

    // keyboard: A/B recolor-or-brush, Del/Backspace remove.
    const kbd = useRef<(e: KeyboardEvent) => void>(() => {});
    kbd.current = (e) => {
        const tag = (e.target as HTMLElement | null)?.tagName || "";
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        const k = e.key.toLowerCase();
        if (k === "a") setBrushOrRecolor(1);
        else if (k === "b") setBrushOrRecolor(0);
        else if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
    };
    useEffect(() => {
        const h = (e: KeyboardEvent) => kbd.current(e);
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, []);

    /* ---- view management ---- */
    const addView = () =>
        patch("p2", (st) => ({
            views: [
                ...st.views,
                { x: CANONICAL_X, y: CANONICAL_Y, circles: [] },
            ],
            activeView: st.views.length,
            selected: -1,
        }));
    const deleteView = (i: number) =>
        patch("p2", (st) => {
            if (st.views.length <= 1) return {};
            const views = st.views.filter((_, j) => j !== i);
            const activeView = Math.min(
                st.activeView > i ? st.activeView - 1 : st.activeView,
                views.length - 1
            );
            return { views, activeView, selected: -1 };
        });
    const selectView = (i: number) =>
        patch("p2", { activeView: i, selected: -1 });

    const submit = async () => {
        if (left <= 0 || submitting) return;
        setSubmitting(true);
        try {
            // run the active classifier over every point and submit the predicted
            // labels; the server scores them against the ground truth it holds.
            const labels: Record<string, ClassLabel> = {};
            points.forEach((p) => {
                labels[p.id] = predictP2(p);
            });
            const res = await service.submitLabels({
                labels,
                // line mode carries the boundary so the server can score its loss.
                ...(lineMode
                    ? { line: { model: s.line, x: view.x, y: view.y } }
                    : {}),
            });
            patch("p2", {
                attempt: res.attempt,
                full: res.acc_full,
                visible: res.acc_visible,
                lossFull: res.loss_full ?? null,
                lossVisible: res.loss_visible ?? null,
            });
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : t("p2.toast.rejected")
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (!config) return null;
    const setAxis = (axis: "x" | "y", val: FeatureKey) =>
        patch("p2", (st) => {
            const i = Math.min(st.activeView, st.views.length - 1);
            return {
                views: st.views.map((v, j) =>
                    j === i ? { ...v, [axis]: val, circles: [] } : v
                ),
                selected: -1,
            };
        });
    const clearActive = () =>
        patch("p2", (st) => {
            const i = Math.min(st.activeView, st.views.length - 1);
            return {
                views: st.views.map((v, j) =>
                    j === i ? { ...v, circles: [] } : v
                ),
                selected: -1,
            };
        });

    return (
        <div className="absolute inset-0">
            <div className="absolute inset-3.5 overflow-hidden rounded-[14px] border border-border bg-bg">
                <canvas
                    ref={ref}
                    onPointerDown={lineMode ? onLineDown : onDown}
                    onPointerMove={lineMode ? onLineMove : onMove}
                    onPointerUp={lineMode ? onLineUp : onUp}
                    onPointerCancel={onCancel}
                    onWheel={lineMode ? undefined : onWheel}
                    className={`block h-full w-full ${
                        lineMode ? "cursor-default" : "cursor-crosshair"
                    }`}
                />
            </div>

            {/* aggregation panel — top left, draggable */}
            <div
                className="absolute top-6 left-6 z-20 w-[248px]"
                style={{
                    transform: `translate(${panelPos.x}px, ${panelPos.y}px)`,
                }}
            >
                <Island className="overflow-hidden">
                    <button
                        type="button"
                        aria-label={t("p2.panel.grip")}
                        onPointerDown={onPanelGrip}
                        onDoubleClick={() => setPanelPos({ x: 0, y: 0 })}
                        className="flex w-full touch-none cursor-grab items-center justify-center py-1.5 transition-colors hover:bg-border/30 active:cursor-grabbing"
                    >
                        <span className="h-1 w-8 rounded-full bg-border" />
                    </button>
                    <div className="px-3.5 pt-1 pb-3">
                        {/* known (live, client-scored) vs test set (server-judged, --% until
              the first submission comes back). */}
                        <div className="flex items-stretch gap-3">
                            <div className="flex-1">
                                <MicroLabel>{t("p2.panel.known")}</MicroLabel>
                                <div className="mt-0.5 font-mono text-2xl font-semibold text-fg">
                                    {(visAcc * 100).toFixed(1)}%
                                </div>
                                {lineMode && (
                                    <div className="mt-1 flex items-baseline gap-1.5">
                                        <MicroLabel>Loss</MicroLabel>
                                        <span className="font-mono text-sm font-semibold text-muted">
                                            {visLoss.toFixed(3)}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 border-l border-border/40 pl-3">
                                <MicroLabel>{t("p2.panel.test")}</MicroLabel>
                                <div
                                    className={`mt-0.5 font-mono text-2xl font-semibold ${
                                        s.full == null
                                            ? "text-muted"
                                            : "text-accent"
                                    }`}
                                >
                                    {s.full == null
                                        ? "--%"
                                        : `${s.full.toFixed(1)}%`}
                                </div>
                                {lineMode && (
                                    <div className="mt-1 flex items-baseline gap-1.5">
                                        <MicroLabel>Loss</MicroLabel>
                                        <span className="font-mono text-sm font-semibold text-muted">
                                            {s.lossFull == null
                                                ? "--"
                                                : s.lossFull.toFixed(3)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {!lineMode && (
                            <div className="mt-2.5 flex flex-col gap-1.5 border-t border-border/40 pt-2.5">
                                {s.views.map((v, i) => {
                                    const active = i === ai;
                                    return (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => selectView(i)}
                                            className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                                                active
                                                    ? "border-accent bg-accent/10"
                                                    : "border-border bg-panel hover:border-muted"
                                            }`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono text-[11px] font-bold text-fg">
                                                        {t("p2.view.name", {
                                                            n: i + 1,
                                                        })}
                                                    </span>
                                                    <span className="truncate text-[10px] text-muted">
                                                        {
                                                            config.features[v.x]
                                                                .name
                                                        }{" "}
                                                        ×{" "}
                                                        {
                                                            config.features[v.y]
                                                                .name
                                                        }
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 flex items-center gap-2.5 text-[10px] text-muted">
                                                    <span>
                                                        {t("p2.view.regions", {
                                                            count: v.circles
                                                                .length,
                                                        })}
                                                    </span>
                                                    <span className="font-mono">
                                                        {(
                                                            viewAcc(v) * 100
                                                        ).toFixed(0)}
                                                        %
                                                    </span>
                                                </div>
                                            </div>
                                            {s.views.length > 1 && (
                                                <span
                                                    role="button"
                                                    tabIndex={-1}
                                                    aria-label={t(
                                                        "p2.view.delete",
                                                        { n: i + 1 }
                                                    )}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteView(i);
                                                    }}
                                                    className="rounded px-1 text-sm text-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
                                                >
                                                    ✕
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                                <GhostButton
                                    bordered
                                    onClick={addView}
                                    className="flex w-full justify-center py-1.5 text-[11px] font-semibold"
                                >
                                    {t("p2.view.add")}
                                </GhostButton>
                            </div>
                        )}

                        {/* line-mode slope/intercept sliders (y = wx·x + b) */}
                        {lineMode && (
                            <div className="mt-2.5 flex flex-col gap-2 border-t border-border/40 pt-2.5">
                                <LineSlider
                                    label="wx"
                                    value={s.line.wx}
                                    onChange={(wx) =>
                                        patch("p2", (st) => ({
                                            line: { ...st.line, wx },
                                        }))
                                    }
                                />
                                <LineSlider
                                    label="b"
                                    value={s.line.b}
                                    onChange={(b) =>
                                        patch("p2", (st) => ({
                                            line: { ...st.line, b },
                                        }))
                                    }
                                />
                            </div>
                        )}

                        {/* submit for scoring */}
                        <div className="mt-2.5 flex items-center gap-2.5 border-t border-border/40 pt-2.5">
                            <PrimaryButton
                                onClick={submit}
                                disabled={left <= 0 || submitting}
                                className="flex-1 py-2 text-[13px]"
                            >
                                {submitting
                                    ? t("p2.submit.judging")
                                    : left <= 0
                                      ? t("p2.submit.noAttempts")
                                      : t("p2.submit.go")}
                            </PrimaryButton>
                            <span className="font-mono text-[11px] tracking-wide text-muted uppercase">
                                {String(s.attempt).padStart(2, "0")}/{cap}
                            </span>
                        </div>
                    </div>
                </Island>
            </div>

            {/* control dock */}
            <Dock>
                {!lineMode && (
                    <>
                        <SegmentedControl
                            ariaLabel={t("p2.brush.aria")}
                            value={String(s.brush)}
                            onChange={(v) =>
                                setBrushOrRecolor(Number(v) as ClassLabel)
                            }
                            options={[
                                {
                                    value: "1",
                                    label: t("p2.class.owl"),
                                    dotClass: "bg-accent3",
                                },
                                {
                                    value: "0",
                                    label: t("p2.class.early"),
                                    dotClass: "bg-accent2",
                                },
                            ]}
                        />
                        <DockDivider />
                        <div className="flex items-center gap-1.5">
                            <MicroLabel>{t("p2.default.label")}</MicroLabel>
                            <SegmentedControl
                                size="sm"
                                ariaLabel={t("p2.default.aria")}
                                value={String(s.defaultCls)}
                                onChange={(v) =>
                                    patch("p2", {
                                        defaultCls: Number(v) as ClassLabel,
                                    })
                                }
                                options={[
                                    { value: "1", label: t("p2.class.owl") },
                                    { value: "0", label: t("p2.class.early") },
                                ]}
                            />
                        </div>
                        <DockDivider />
                    </>
                )}
                <div className="flex items-center gap-1.5">
                    <MicroLabel>X</MicroLabel>
                    <Select
                        value={view.x}
                        onChange={(e) =>
                            setAxis("x", e.target.value as FeatureKey)
                        }
                    >
                        {config.axisKeys.map((k) => (
                            <option key={k} value={k}>
                                {config.features[k].name}
                            </option>
                        ))}
                    </Select>
                    <MicroLabel className="ml-1">Y</MicroLabel>
                    <Select
                        value={view.y}
                        onChange={(e) =>
                            setAxis("y", e.target.value as FeatureKey)
                        }
                    >
                        {config.axisKeys.map((k) => (
                            <option key={k} value={k}>
                                {config.features[k].name}
                            </option>
                        ))}
                    </Select>
                </div>
                <DockDivider />
                <div className="flex items-center gap-2">
                    <MicroLabel>{t("p2.preview.label")}</MicroLabel>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={s.preview}
                        aria-label={t("p2.preview.aria")}
                        onClick={() =>
                            patch("p2", (st) => ({ preview: !st.preview }))
                        }
                        title={
                            lineMode
                                ? t("p2.preview.titleLine")
                                : t("p2.preview.titleLasso")
                        }
                        className={`relative inline-flex h-[18px] w-[30px] shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                            s.preview ? "bg-accent" : "bg-border"
                        }`}
                    >
                        <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                s.preview
                                    ? "translate-x-[14px]"
                                    : "translate-x-[2px]"
                            }`}
                        />
                    </button>
                </div>
                {!lineMode && (
                    <>
                        <DockDivider />
                        <GhostButton onClick={clearActive}>
                            {t("p2.clear")}
                        </GhostButton>
                    </>
                )}
            </Dock>
        </div>
    );
}

/* One weight/bias slider row for line mode (−5…5). Native range input styled to
   match the workshop dock; the numeric value is shown mono on the right. */
function LineSlider({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <label className="flex items-center gap-2.5">
            <span className="w-5 font-mono text-[11px] font-bold text-fg">
                {label}
            </span>
            <input
                type="range"
                min={-5}
                max={5}
                step={0.1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-accent"
            />
            <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted">
                {(value >= 0 ? "+" : "") + value.toFixed(1)}
            </span>
        </label>
    );
}
