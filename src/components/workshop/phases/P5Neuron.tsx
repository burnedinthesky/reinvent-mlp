/* P5 · Neuron — the stepping stone from hand-crafted classifiers to the MLP
   playground. Stage 1: hand-tune a single sigmoid neuron (w1/w2/b sliders) over
   two z-scored axes and watch the BCE loss fall as the probability heatmap and the
   σ(z) expand-plot update live. Stage 2 (gated by the p5_deep reveal): add hidden
   layers and train with gradient descent, watching loss AND live accuracy. One
   unified {axes, arch, weights} payload is scored on the ACC board (10-attempt
   pool shared across stages). Built on Phase 2's scatter + dock + island idiom. */

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
    Select,
} from "#/components/workshop/ui";
import { P5_CAP } from "#/lib/workshop/constants";
import { trainFrameOf } from "#/lib/workshop/lossgrid";
import {
    neuronAccuracy,
    neuronBce,
    neuronPointZs,
    singleNeuronView,
} from "#/lib/workshop/neuron";
import { drawNetDiagram } from "#/lib/workshop/draw/network";
import type { NetNode } from "#/lib/workshop/draw/network";
import { drawP5Main } from "#/lib/workshop/draw/p5main";
import { drawSigmoid } from "#/lib/workshop/draw/sigmoid";
import { drawSpark } from "#/lib/workshop/draw/spark";
import { classHeatRGBA } from "#/lib/workshop/theme";
import type { NetView } from "#/lib/workshop/mlp";
import type { FeatureKey } from "#/lib/workshop/types";
import { useWorkshop } from "#/state/workshop-context";

const LRS = ["0.003", "0.01", "0.03", "0.1", "0.3", "1", "3"];

const stepBtnClass =
    "h-6 w-6 rounded-md border border-border bg-panel p-0 text-sm leading-none font-bold text-muted transition-colors hover:text-fg disabled:cursor-default disabled:opacity-35";

export function P5Neuron() {
    const {
        config,
        points,
        service,
        store,
        patch,
        reveals,
        p5EngineRef,
        caps,
    } = useWorkshop();
    const cap = caps.P5 ?? P5_CAP;
    const s = store.p5;
    const deep = reveals?.p5_deep === true;
    // the flag switches stages directly: on = stage 2 (deep), off = stage 1.
    const stage = deep ? 2 : 1;

    const [submitting, setSubmitting] = useState(false);
    // sigmoid-expand section inside the preview island (stage 1 only, local state).
    const [expanded, setExpanded] = useState(false);
    const nodesRef = useRef<NetNode[]>([]);
    const frameRef = useRef(0);

    // P5 trains on an initial set of 100 training dots — the visible synthetic
    // slice (real: false, hidden: false) — rather than the small hand-annotated
    // real set. Falls back to the full visible slice until those 100 labels are
    // revealed (reveal100), so stage 1 is never handed an empty training frame.
    const p5Points = useMemo(() => {
        const synth = points.filter((p) => !p.real && !p.hidden);
        const labeled = synth.some((p) => p.label === 0 || p.label === 1);
        return labeled ? synth : points;
    }, [points]);

    const frame = useMemo(
        () => trainFrameOf(p5Points, s.xKey, s.yKey),
        [p5Points, s.xKey, s.yKey]
    );
    const bce = useMemo(
        () => neuronBce(frame, s.w1, s.w2, s.b),
        [frame, s.w1, s.w2, s.b]
    );
    const stage1Acc = useMemo(
        () => neuronAccuracy(frame, s.w1, s.w2, s.b),
        [frame, s.w1, s.w2, s.b]
    );
    const stageView: NetView = useMemo(
        () => singleNeuronView(frame, s.w1, s.w2, s.b),
        [frame, s.w1, s.w2, s.b]
    );
    const zPts = useMemo(
        () => neuronPointZs(frame, s.w1, s.w2, s.b),
        [frame, s.w1, s.w2, s.b]
    );

    // stage-2 engine: lazily created on entering stage 2, kept in a ref across
    // remounts. Do NOT share the MLP playground's ref. Axis change invalidates it (trainZ baked in).
    if (config && stage === 2 && !p5EngineRef.current) {
        p5EngineRef.current = service.createP5NetEngine(
            [s.xKey, s.yKey],
            { layers: s.layers, n1: s.n1, n2: s.n2 },
            parseFloat(s.lr),
            p5Points
        );
    }
    const eng = p5EngineRef.current;
    if (eng) eng.lr = parseFloat(s.lr);

    // the view the main canvas + preview render: stage 1 = the single neuron; stage
    // 2 = the trained engine (also a NetView).
    const net: NetView | null = stage === 2 ? eng : stageView;
    const inLabels: [string, string] = config
        ? [config.features[s.xKey].name, config.features[s.yKey].name]
        : ["x", "y"];

    const { ref: mainRef, paint: paintMain } = useCanvas(
        (ctx, W, H) => {
            if (net && config)
                drawP5Main(
                    ctx,
                    W,
                    H,
                    net,
                    stage === 2 ? s.view : "out",
                    { x: s.xKey, y: s.yKey },
                    p5Points,
                    config.features,
                    s.preview
                );
        },
        [
            stage,
            s.view,
            s.w1,
            s.w2,
            s.b,
            s.step,
            s.xKey,
            s.yKey,
            s.layers,
            s.n1,
            s.n2,
            s.preview,
            config,
            p5Points,
        ]
    );
    const { ref: netRef, paint: paintNet } = useCanvas(
        (ctx, W, H) => {
            if (net)
                nodesRef.current = drawNetDiagram(
                    ctx,
                    W,
                    H,
                    net,
                    stage === 2 ? s.view : "out",
                    config!.features[s.xKey],
                    config!.features[s.yKey],
                    inLabels,
                    "P(夜貓)",
                    classHeatRGBA
                );
        },
        [
            stage,
            s.view,
            s.w1,
            s.w2,
            s.b,
            s.step,
            s.xKey,
            s.yKey,
            s.layers,
            s.n1,
            s.n2,
            config,
        ]
    );
    const { ref: sigRef } = useCanvas(
        (ctx, W, H) => drawSigmoid(ctx, W, H, zPts),
        [zPts, expanded]
    );
    const { ref: sparkRef, paint: paintSpark } = useCanvas(
        (ctx, W, H) => {
            if (eng) drawSpark(ctx, W, H, eng.lossHist);
        },
        [s.step, s.loss]
    );

    const repaint = () => {
        paintMain();
        paintNet();
        paintSpark();
    };

    // stage-2 training loop (~33ms, 10 steps/tick). Paused when p5_deep retracts.
    useEffect(() => {
        if (stage !== 2 || !s.running) return;
        const id = setInterval(() => {
            const e = p5EngineRef.current;
            if (!e) return;
            for (let i = 0; i < 10; i++) e.trainStep();
            paintMain();
            paintNet();
            paintSpark();
            frameRef.current++;
            if (frameRef.current % 2 === 0)
                patch("p5", { step: e.step, loss: e.lastLoss });
        }, 33);
        return () => clearInterval(id);
    }, [stage, s.running, paintMain, paintNet, paintSpark, p5EngineRef, patch]);

    // if p5_deep retracts while training, pause (state + engine are kept for re-flip).
    useEffect(() => {
        if (!deep && s.running) patch("p5", { running: false });
    }, [deep, s.running, patch]);

    // space toggles stage-2 training (mirrors the MLP playground).
    useEffect(() => {
        if (stage !== 2) return;
        const h = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName || "";
            if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA")
                return;
            if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                patch("p5", (st) => ({ running: !st.running }));
            }
        };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [stage, patch]);

    // axis change invalidates the stage-2 engine (its trainZ is baked in).
    const setAxis = (which: "x" | "y", val: FeatureKey) => {
        p5EngineRef.current = null;
        patch("p5", {
            [which === "x" ? "xKey" : "yKey"]: val,
            running: false,
            step: 0,
            loss: null,
            view: "out",
        });
    };

    const setArch = (
        p: Partial<{ layers: number; n1: number; n2: number }>
    ) => {
        const layers = p.layers ?? s.layers;
        const n1 = p.n1 ?? s.n1;
        const n2 = p.n2 ?? s.n2;
        p5EngineRef.current?.reset({ layers, n1, n2 });
        patch("p5", { ...p, step: 0, loss: null, view: "out" });
    };
    const stepOnce = () => {
        if (!eng) return;
        for (let i = 0; i < 10; i++) eng.trainStep();
        patch("p5", { step: eng.step, loss: eng.lastLoss });
        repaint();
    };
    const reset = () => {
        eng?.reset({ layers: s.layers, n1: s.n1, n2: s.n2 });
        patch("p5", { step: 0, loss: null, view: "out" });
        repaint();
    };

    const onNetClick = (e: React.MouseEvent) => {
        const rect = (
            e.currentTarget as HTMLCanvasElement
        ).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        for (const nd of nodesRef.current)
            if (
                x >= nd.x &&
                x <= nd.x + nd.w &&
                y >= nd.y &&
                y <= nd.y + nd.h
            ) {
                // stage 1: clicking the output toggles the sigmoid-expand section.
                // stage 2: node clicks set the inspected view instead.
                if (stage === 1) {
                    if (nd.key === "out") setExpanded((v) => !v);
                } else {
                    patch("p5", { view: nd.key });
                }
                return;
            }
    };

    // live accuracy over the KNOWN-label training slice only (before reveal100,
    // visible synthetic points ship unlabeled — they must not count as misses).
    const liveAcc = useMemo(
        () =>
            stage === 2 && eng
                ? eng.accuracyOn((p) => !p.hidden && p.label != null)
                : stage1Acc,
        [stage, eng, s.step, stage1Acc]
    );

    const submit = async () => {
        if (submitting || s.attempt >= cap) return;
        setSubmitting(true);
        try {
            const sub =
                stage === 2 && eng
                    ? {
                          axes: [s.xKey, s.yKey] as [FeatureKey, FeatureKey],
                          ...eng.serialize(),
                      }
                    : {
                          axes: [s.xKey, s.yKey] as [FeatureKey, FeatureKey],
                          arch: { layers: [2, 1], act: "tanh" },
                          weights: [s.w1, s.w2, s.b],
                      };
            const res = await service.submitP5Net(sub);
            patch("p5", {
                attempt: res.attempt,
                full: res.acc_full,
                visible: res.acc_visible,
                judgedLoss: res.loss_full,
            });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "送出被拒絕");
        } finally {
            setSubmitting(false);
        }
    };

    if (!config) return null;
    const left = cap - s.attempt;

    const steppers: {
        label: string;
        val: number;
        dec: () => void;
        inc: () => void;
        canDec: boolean;
        canInc: boolean;
    }[] = [
        {
            label: "隱藏層數",
            val: s.layers,
            dec: () => s.layers > 1 && setArch({ layers: s.layers - 1 }),
            inc: () => s.layers < 2 && setArch({ layers: s.layers + 1 }),
            canDec: s.layers > 1,
            canInc: s.layers < 2,
        },
        {
            label: "神經元 · 第 1 層",
            val: s.n1,
            dec: () => s.n1 > 1 && setArch({ n1: s.n1 - 1 }),
            inc: () => s.n1 < 6 && setArch({ n1: s.n1 + 1 }),
            canDec: s.n1 > 1,
            canInc: s.n1 < 6,
        },
    ];
    if (s.layers >= 2)
        steppers.push({
            label: "神經元 · 第 2 層",
            val: s.n2,
            dec: () => s.n2 > 1 && setArch({ n2: s.n2 - 1 }),
            inc: () => s.n2 < 6 && setArch({ n2: s.n2 + 1 }),
            canDec: s.n2 > 1,
            canInc: s.n2 < 6,
        });

    const submitRow = (
        <div className="flex items-center gap-2.5">
            <PrimaryButton
                onClick={submit}
                disabled={left <= 0 || submitting}
                className="flex-1 py-2.5 font-display font-bold"
            >
                {left <= 0 ? "沒有剩餘機會" : "送出評分"}
            </PrimaryButton>
            <span className="font-mono text-[11px] tracking-wide text-muted uppercase">
                {String(s.attempt).padStart(2, "0")}/{cap}
            </span>
        </div>
    );

    // P3-style live-vs-judged readout: loss headline + accuracy secondary per column.
    const readout = (
        <Readout
            liveLoss={stage === 2 ? s.loss : bce}
            liveAcc={liveAcc}
            judgedLoss={s.judgedLoss}
            judgedAcc={s.full}
        />
    );

    return (
        <div className="absolute inset-0">
            <div className="absolute inset-3.5 overflow-hidden rounded-[14px] border border-border bg-bg">
                <canvas ref={mainRef} className="block h-full w-full" />
            </div>

            {/* top-left control island */}
            <DragPanel
                className="absolute top-6 left-6 z-20 w-[264px]"
                bodyClassName="flex flex-col gap-3 px-4 pb-4"
            >
                {stage === 1 ? (
                    <>
                        {readout}
                        <div className="flex flex-col gap-2 rounded-md border border-border/40 bg-bg px-3 py-2.5">
                            <NeuronSlider
                                label="w1"
                                value={s.w1}
                                onChange={(v) => patch("p5", { w1: v })}
                            />
                            <NeuronSlider
                                label="w2"
                                value={s.w2}
                                onChange={(v) => patch("p5", { w2: v })}
                            />
                            <NeuronSlider
                                label="b"
                                value={s.b}
                                onChange={(v) => patch("p5", { b: v })}
                            />
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted">
                            p = σ(w1·x + w2·y + b)，座標軸已做 z-score。拖曳到
                            loss 下降； 點右上角的輸出節點可以看 σ 如何壓縮 z。
                        </p>
                        {submitRow}
                    </>
                ) : (
                    <>
                        <div className="flex items-baseline justify-between">
                            <MicroLabel accent>往更深處</MicroLabel>
                            <span className="font-mono text-[10px] tracking-wide text-muted uppercase">
                                {p5Points.filter((p) => !p.hidden).length}{" "}
                                個訓練點
                            </span>
                        </div>

                        {/* transport */}
                        <div className="flex items-center gap-2">
                            {s.running ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        patch("p5", { running: false })
                                    }
                                    className="flex-1 rounded-md border border-border bg-panel px-3 py-2 font-display text-sm font-bold text-muted transition-colors hover:text-fg"
                                >
                                    ⏸ 暫停
                                </button>
                            ) : (
                                <PrimaryButton
                                    onClick={() =>
                                        patch("p5", { running: true })
                                    }
                                    className="flex-1 py-2 font-display font-bold"
                                >
                                    ▶ 訓練
                                </PrimaryButton>
                            )}
                            <GhostButton
                                bordered
                                className="px-2.5 py-2"
                                onClick={stepOnce}
                            >
                                單步 ×10
                            </GhostButton>
                            <GhostButton
                                bordered
                                className="px-2.5 py-2"
                                onClick={reset}
                                title="重新抽取隨機權重"
                            >
                                ↺
                            </GhostButton>
                        </div>

                        {/* arch + LR */}
                        <div className="flex flex-col gap-2 rounded-md border border-border/40 bg-bg px-3 py-2.5">
                            {steppers.map((st) => (
                                <div
                                    key={st.label}
                                    className="flex items-center gap-2.5"
                                >
                                    <span className="flex-1 text-xs font-semibold text-muted">
                                        {st.label}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={st.dec}
                                        disabled={!st.canDec}
                                        className={stepBtnClass}
                                    >
                                        −
                                    </button>
                                    <span className="w-5 text-center font-mono text-sm font-semibold text-fg">
                                        {st.val}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={st.inc}
                                        disabled={!st.canInc}
                                        className={stepBtnClass}
                                    >
                                        +
                                    </button>
                                </div>
                            ))}
                            <div className="flex items-center gap-2.5">
                                <span className="flex-1 text-xs font-semibold text-muted">
                                    學習率
                                </span>
                                <Select
                                    value={s.lr}
                                    onChange={(e) =>
                                        patch("p5", { lr: e.target.value })
                                    }
                                >
                                    {LRS.map((v) => (
                                        <option key={v} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>

                        {/* live-vs-judged readout + step counter/sparkline */}
                        {readout}
                        <div className="flex items-center gap-3.5 border-t border-border/40 pt-2">
                            <div>
                                <MicroLabel>步數</MicroLabel>
                                <div className="font-mono text-lg font-semibold text-fg">
                                    {s.step}
                                </div>
                            </div>
                            <div className="flex-1" />
                            <div className="h-8 w-16">
                                <canvas
                                    ref={sparkRef}
                                    className="block h-full w-full"
                                />
                            </div>
                        </div>

                        {submitRow}
                    </>
                )}
            </DragPanel>

            {/* top-right preview island — top-16 clears the fixed account chip (top-3 right-3) */}
            <DragPanel
                className="absolute top-16 right-6 z-20 w-[248px]"
                bodyClassName="flex flex-col gap-2 px-3 pb-3"
            >
                <MicroLabel className="block">
                    {stage === 1 ? "網路" : "網路 — 點擊神經元"}
                </MicroLabel>
                <div className="h-[150px] overflow-hidden rounded-md border border-border/40 bg-bg">
                    <canvas
                        ref={netRef}
                        onClick={onNetClick}
                        className="block h-full w-full cursor-pointer"
                    />
                </div>
                {stage === 1 && expanded && (
                    <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2">
                        <div className="flex items-center justify-between">
                            {/* normal-case keeps σ from uppercasing into Σ (reads as summation) */}
                            <MicroLabel>
                                <span className="normal-case">σ(z)</span> —
                                壓縮分數
                            </MicroLabel>
                            <GhostButton
                                className="px-1.5 py-0 text-[11px]"
                                onClick={() => setExpanded(false)}
                                aria-label="關閉 sigmoid 圖"
                            >
                                ✕
                            </GhostButton>
                        </div>
                        <div className="h-[140px] overflow-hidden rounded-md border border-border/40 bg-bg">
                            <canvas
                                ref={sigRef}
                                className="block h-full w-full"
                            />
                        </div>
                    </div>
                )}
            </DragPanel>

            {/* dock: axis pickers */}
            <Dock>
                <div className="flex items-center gap-1.5">
                    <MicroLabel>X</MicroLabel>
                    <Select
                        value={s.xKey}
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
                        value={s.yKey}
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
                    <MicroLabel>預覽</MicroLabel>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={s.preview}
                        aria-label="預覽預測結果"
                        onClick={() =>
                            patch("p5", (st) => ({ preview: !st.preview }))
                        }
                        title="依照神經元預測的類別重新上色"
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
            </Dock>
        </div>
    );
}

/* Draggable floating island (P3's act-2 panel pattern): grab the grip bar to
   reposition, double-click it to snap back. Each panel owns its own offset. */
function DragPanel({
    className,
    bodyClassName,
    children,
}: {
    className: string;
    bodyClassName: string;
    children: React.ReactNode;
}) {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const drag = useRef<{
        px: number;
        py: number;
        ox: number;
        oy: number;
    } | null>(null);
    const onGrip = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
        const move = (me: PointerEvent) => {
            const d = drag.current;
            if (!d) return;
            setPos({
                x: d.ox + (me.clientX - d.px),
                y: d.oy + (me.clientY - d.py),
            });
        };
        const up = () => {
            drag.current = null;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };
    return (
        <div
            className={className}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        >
            <Island className="overflow-hidden">
                <button
                    type="button"
                    aria-label="拖曳面板，點兩下重設位置"
                    onPointerDown={onGrip}
                    onDoubleClick={() => setPos({ x: 0, y: 0 })}
                    className="flex w-full touch-none cursor-grab items-center justify-center py-1.5 transition-colors hover:bg-border/30 active:cursor-grabbing"
                >
                    <span className="h-1 w-8 rounded-full bg-border" />
                </button>
                <div className={bodyClassName}>{children}</div>
            </Island>
        </div>
    );
}

/* P3's live-vs-judged readout: loss is the headline number in each column, its
   accuracy the small secondary line. Live = the known training slice; judged =
   the server's verdict on the full set (hidden test slice included). */
function Readout({
    liveLoss,
    liveAcc,
    judgedLoss,
    judgedAcc,
}: {
    liveLoss: number | null;
    liveAcc: number;
    judgedLoss: number | null;
    judgedAcc: number | null;
}) {
    return (
        <div className="flex items-stretch gap-3">
            <div className="flex-1">
                <MicroLabel>即時 · 訓練</MicroLabel>
                <div className="mt-0.5 font-mono text-2xl font-semibold text-fg">
                    {liveLoss == null ? "--" : liveLoss.toFixed(3)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted">
                    準確率 {liveAcc.toFixed(1)}%
                </div>
            </div>
            <div className="flex-1 border-l border-border/40 pl-3">
                <MicroLabel>評分 · 測試</MicroLabel>
                <div
                    className={`mt-0.5 font-mono text-2xl font-semibold ${
                        judgedLoss == null ? "text-muted" : "text-accent"
                    }`}
                >
                    {judgedLoss == null ? "--" : judgedLoss.toFixed(3)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted">
                    準確率{" "}
                    {judgedAcc == null ? "--" : `${judgedAcc.toFixed(1)}%`}
                </div>
            </div>
        </div>
    );
}

/* One w1/w2/b slider row, range [-4, 4] step 0.05 (P2's LineSlider pattern). */
function NeuronSlider({
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
                min={-4}
                max={4}
                step={0.05}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="h-1 min-w-0 flex-1 cursor-pointer accent-accent"
            />
            <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted">
                {(value >= 0 ? "+" : "") + value.toFixed(2)}
            </span>
        </label>
    );
}
