/* P6 · Playground — a free NN playground over four bundled image datasets. Pick a
   dataset on the left, train a small dense net live (in a Web Worker), and hover
   a neuron in the diagram to see what it looks for. No scoring, no leaderboard.
   Mirrors the MLP playground's bench/canvas layout and engine-in-a-ref pattern, but the engine
   is an MlpNetClient wrapping the training worker. */

import { useEffect, useReducer, useRef, useState } from "react";

import { ActivationPicker } from "#/components/workshop/ActivationPicker";
import type { ActKind } from "#/components/workshop/ActivationPicker";
import { useCanvas } from "#/components/workshop/canvas/useCanvas";
import {
    GhostButton,
    Island,
    MicroLabel,
    PrimaryButton,
    SegmentedControl,
    Select,
} from "#/components/workshop/ui";
import { MlpNetClient } from "#/lib/workshop/cnn/client";
import { DATASET_IDS, DATASET_LABEL } from "#/lib/workshop/cnn/dataset";
import type { DatasetId } from "#/lib/workshop/cnn/dataset";
import { keyFor, widthsOf } from "#/lib/workshop/cnn/presets";
import type {
    LayerCount,
    LayerWidth,
    PresetKey,
    TrainOpts,
} from "#/lib/workshop/cnn/presets";
import { drawMlpDiagram, hitNode } from "#/lib/workshop/draw/mlpDiagram";
import type { DiagramNode } from "#/lib/workshop/draw/mlpDiagram";
import { paintVol } from "#/lib/workshop/draw/paintVol";
import { drawProbBars, drawWeightStrip } from "#/lib/workshop/draw/probBars";
import { drawSpark } from "#/lib/workshop/draw/spark";
import { C, FONT_MONO, rgbCss } from "#/lib/workshop/theme";
import { useI18n, type TranslateFn } from "#/lib/i18n/context";
import { useWorkshop } from "#/state/workshop-context";

const LRS = ["0.01", "0.02", "0.05", "0.1", "0.2", "0.5"];
const BATCHES = [8, 16, 32, 64];

type Neuron = { layer: number; idx: number };

function optsOf(s: {
    lr: string;
    batchSize: number;
    act: ActKind;
    lrDecay: boolean;
}): TrainOpts {
    return {
        lr: parseFloat(s.lr),
        momentum: 0.9,
        batchSize: s.batchSize,
        act: s.act,
        lrDecay: s.lrDecay,
    };
}

/** a labeled 32|64 width selector for one hidden layer. */
function WidthRow({
    label,
    value,
    onChange,
}: {
    label: string;
    value: LayerWidth;
    onChange: (w: LayerWidth) => void;
}) {
    return (
        <div className="flex items-center gap-2.5">
            <span className="flex-1 text-xs font-semibold text-muted">
                {label}
            </span>
            <SegmentedControl<string>
                size="sm"
                mono
                ariaLabel={label}
                value={String(value)}
                options={[
                    { value: "32", label: "32" },
                    { value: "64", label: "64" },
                ]}
                onChange={(v) => onChange(Number(v) as LayerWidth)}
            />
        </div>
    );
}

export function P6Playground() {
    const { store, patch, cnnEngineRef } = useWorkshop();
    const { t } = useI18n();
    const s = store.p6;
    const [, bump] = useReducer((x: number) => x + 1, 0);
    const [hover, setHover] = useState<Neuron | null>(null);
    const nodesRef = useRef<DiagramNode[]>([]);
    const repaintRef = useRef<() => void>(() => {});
    const patchTick = useRef(0);

    // create the worker-backed client once, client-side (SSR-safe: not in render).
    useEffect(() => {
        let client = cnnEngineRef.current;
        const fresh = !client;
        if (!client) {
            client = new MlpNetClient();
            cnnEngineRef.current = client;
        }
        const c = client;
        c.onEvent = (ev) => {
            if (ev === "ready") {
                patch("p6", { currentInput: c.ready?.firstVal ?? 0 });
            }
            if (ev === "metrics") {
                // throttle store writes (stat text) but always repaint the canvases.
                if (++patchTick.current % 3 === 0)
                    patch("p6", {
                        step: c.step,
                        loss: c.loss,
                        acc: c.acc,
                        valAcc: c.valAcc,
                    });
            }
            repaintRef.current();
        };
        if (fresh) {
            c.init(s.dataset, s.arch, optsOf(s));
            if (s.running) c.start();
        } else {
            bump();
        }
        return () => {
            c.onEvent = null;
        };
    }, []);

    const client = cnnEngineRef.current;
    const ready = client?.ready ?? null;
    const snap = client?.snapshot ?? null;

    /* ---------------- canvases ---------------- */
    // the detail popover follows the *hovered* neuron (a click pins it so it stays
    // when the pointer leaves).
    const inspect = hover ?? s.selectedNeuron;

    const { ref: diagramRef, paint: paintDiagram } = useCanvas(
        (ctx, W, H) => {
            if (!ready) return;
            nodesRef.current = drawMlpDiagram(
                ctx,
                W,
                H,
                ready.layers,
                snap?.acts ?? null,
                s.selectedNeuron,
                hover
            );
        },
        [ready, snap, s.selectedNeuron, hover]
    );

    const { ref: detailRef, paint: paintDetail } = useCanvas(
        (ctx, W, H) => {
            drawDetail(ctx, W, H, inspect, client, ready, t);
        },
        [inspect, ready, snap, t]
    );

    const { ref: softmaxRef, paint: paintSoftmax } = useCanvas(
        (ctx, W, H) => {
            if (!ready || !snap) return;
            drawProbBars(
                ctx,
                W,
                H,
                snap.probs,
                ready.classNames,
                snap.label,
                2
            );
        },
        [ready, snap]
    );

    const { ref: thumbRef, paint: paintThumb } = useCanvas(
        (ctx, W, H) => {
            if (!ready || !snap) return;
            paintVol(
                ctx,
                snap.input,
                ready.tile,
                ready.tile,
                ready.depth,
                0,
                0,
                W,
                H,
                "image"
            );
        },
        [ready, snap]
    );

    const { ref: lossRef, paint: paintLoss } = useCanvas(
        (ctx, W, H) => client && drawSpark(ctx, W, H, client.lossHist),
        [s.step]
    );
    const { ref: accRef, paint: paintAcc } = useCanvas(
        (ctx, W, H) => client && drawSpark(ctx, W, H, client.accHist),
        [s.step]
    );

    // keep the live-repaint closure current so the worker's onEvent can drive it.
    repaintRef.current = () => {
        paintDiagram();
        paintDetail();
        paintSoftmax();
        paintThumb();
        paintLoss();
        paintAcc();
    };

    /* ---------------- controls ---------------- */
    const setRunning = (run: boolean) => {
        if (!client) return;
        run ? client.start() : client.pause();
        patch("p6", { running: run });
    };
    const stepOnce = () => {
        client?.stepOnce();
    };
    const reset = () => {
        client?.reset();
        patch("p6", {
            running: false,
            step: 0,
            loss: null,
            acc: null,
            valAcc: null,
        });
    };
    const pickDataset = (dataset: DatasetId) => {
        if (!client || dataset === s.dataset) return;
        // stop the old net immediately — decoding the new dataset (esp. CIFAR) can
        // take seconds, and we must not keep training the previous data meanwhile.
        client.pause();
        client.setDataset(dataset, s.arch, optsOf(s));
        patch("p6", {
            dataset,
            running: false,
            step: 0,
            loss: null,
            acc: null,
            valAcc: null,
            selectedNeuron: null,
        });
    };
    const pickArch = (arch: PresetKey) => {
        if (!client || arch === s.arch) return;
        client.setArch(arch, optsOf(s));
        patch("p6", {
            arch,
            running: false,
            step: 0,
            loss: null,
            acc: null,
            valAcc: null,
            selectedNeuron: null,
        });
    };
    const setLr = (lr: string) => {
        patch("p6", { lr });
        client?.setOpts(optsOf({ ...s, lr }));
    };
    const setDecay = (lrDecay: boolean) => {
        patch("p6", { lrDecay });
        client?.setOpts(optsOf({ ...s, lrDecay }));
    };
    const setBatch = (batchSize: number) => {
        patch("p6", { batchSize });
        client?.setOpts(optsOf({ ...s, batchSize }));
    };
    const setAct = (act: ActKind) => {
        // activation change re-inits weights (derivative differs) — reset for clarity.
        if (!client) return;
        patch("p6", {
            act,
            running: false,
            step: 0,
            loss: null,
            acc: null,
            valAcc: null,
        });
        client.setArch(s.arch, optsOf({ ...s, act }));
    };
    // architecture is chosen via a layer-count toggle plus one width selector per
    // hidden layer (each layer's width is independent).
    const archWidths = widthsOf(s.arch);
    const archLayers = archWidths.length as LayerCount;
    const setLayers = (layers: LayerCount) => {
        const next: LayerWidth[] =
            layers === 1
                ? [archWidths[0]]
                : [archWidths[0], archWidths[1] ?? archWidths[0]];
        pickArch(keyFor(next));
    };
    const setWidthAt = (i: number, width: LayerWidth) => {
        const next = [...archWidths];
        next[i] = width;
        pickArch(keyFor(next));
    };
    const cycleInput = (delta: number) => {
        if (!client || !ready) return;
        const total = ready.trainN + ready.valN;
        const next = (s.currentInput + delta + total) % total;
        client.setInput(next);
        patch("p6", { currentInput: next });
    };
    const randomInput = () => {
        if (!client || !ready) return;
        const total = ready.trainN + ready.valN;
        const next = Math.floor(Math.random() * total);
        client.setInput(next);
        patch("p6", { currentInput: next });
    };

    const onDiagramMove = (e: React.MouseEvent) => {
        const rect = (
            e.currentTarget as HTMLCanvasElement
        ).getBoundingClientRect();
        const nd = hitNode(
            nodesRef.current,
            e.clientX - rect.left,
            e.clientY - rect.top
        );
        const next = nd ? { layer: nd.layer, idx: nd.idx } : null;
        if (
            (next?.layer ?? null) !== (hover?.layer ?? null) ||
            (next?.idx ?? null) !== (hover?.idx ?? null)
        ) {
            setHover(next);
            if (nd && nd.kind !== "input") client?.reqWeights(nd.layer, nd.idx);
        }
    };
    const onDiagramClick = (e: React.MouseEvent) => {
        const rect = (
            e.currentTarget as HTMLCanvasElement
        ).getBoundingClientRect();
        const nd = hitNode(
            nodesRef.current,
            e.clientX - rect.left,
            e.clientY - rect.top
        );
        if (!nd) {
            patch("p6", { selectedNeuron: null });
            return;
        }
        if (nd.kind !== "input") client?.reqWeights(nd.layer, nd.idx);
        patch("p6", { selectedNeuron: { layer: nd.layer, idx: nd.idx } });
    };

    // SPACE toggles training (like the MLP playground).
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName || "";
            if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA")
                return;
            if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                if (loading) return; // can't train a dataset that's still loading
                setRunning(!s.running);
            }
        };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    });

    // while training, cycle the previewed input image so the activations + class
    // probabilities are shown for a variety of examples rather than one frozen
    // image. Goes through setInput so the store's currentInput stays in sync (and
    // prev/next keep working once paused).
    useEffect(() => {
        if (!client || !ready || !s.running) return;
        const total = ready.trainN + ready.valN;
        const id = setInterval(() => {
            const next = Math.floor(Math.random() * total);
            client.setInput(next);
            patch("p6", { currentInput: next });
        }, 600);
        return () => clearInterval(id);
    }, [client, ready, s.running]);

    const loading = !ready || client?.loadingDataset != null;
    const inspectLabel = describeInspect(inspect, ready, t);

    return (
        <div className="absolute inset-0 grid grid-cols-[380px_1fr] gap-3.5 p-3.5">
            {/* bench */}
            <Island className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
                <div>
                    <div className="flex items-baseline justify-between">
                        <MicroLabel accent className="text-[11px]">
                            {t("p6.header.phase")}
                        </MicroLabel>
                        <span className="font-mono text-xs tracking-wide text-muted uppercase">
                            {t("p6.header.noScore")}
                        </span>
                    </div>
                    <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-fg">
                        {t("p6.header.title")}
                    </h2>
                </div>

                {/* dataset picker */}
                <div>
                    <MicroLabel className="mb-1.5 block">
                        {t("p6.dataset")}
                    </MicroLabel>
                    <div className="grid grid-cols-2 gap-2">
                        {DATASET_IDS.map((id) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => pickDataset(id)}
                                className={
                                    "rounded-md border px-3 py-2 text-left font-display text-sm font-semibold transition-colors " +
                                    (s.dataset === id
                                        ? "border-accent bg-accent/10 text-fg"
                                        : "border-border bg-panel text-muted hover:text-fg")
                                }
                            >
                                {DATASET_LABEL[id]}
                            </button>
                        ))}
                    </div>
                </div>

                {/* transport */}
                <div className="flex items-center gap-2">
                    {s.running ? (
                        <button
                            type="button"
                            onClick={() => setRunning(false)}
                            disabled={loading}
                            className="flex-1 rounded-md border border-border bg-panel px-3.5 py-2.5 font-display text-sm font-bold text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {t("p6.transport.pause")}
                        </button>
                    ) : (
                        <PrimaryButton
                            onClick={() => setRunning(true)}
                            disabled={loading}
                            className="flex-1 py-2.5 font-display font-bold"
                        >
                            {t("p6.transport.train")}
                        </PrimaryButton>
                    )}
                    <GhostButton
                        bordered
                        className="px-3 py-2.5"
                        onClick={stepOnce}
                        disabled={loading}
                    >
                        {t("p6.transport.step")}
                    </GhostButton>
                    <GhostButton
                        bordered
                        className="px-3 py-2.5"
                        onClick={reset}
                        disabled={loading}
                        title={t("p6.transport.resetTitle")}
                    >
                        {t("p6.transport.reset")}
                    </GhostButton>
                </div>

                {/* arch + hyperparams */}
                <div className="flex flex-col gap-2.5 rounded-md border border-border/40 bg-bg px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                        <span className="flex-1 text-xs font-semibold text-muted">
                            {t("p6.arch.layers")}
                        </span>
                        <SegmentedControl<string>
                            size="sm"
                            mono
                            ariaLabel={t("p6.arch.layers")}
                            value={String(archLayers)}
                            options={[
                                { value: "1", label: "1" },
                                { value: "2", label: "2" },
                            ]}
                            onChange={(v) => setLayers(Number(v) as LayerCount)}
                        />
                    </div>
                    {archLayers === 1 ? (
                        <WidthRow
                            label={t("p6.arch.width")}
                            value={archWidths[0]}
                            onChange={(w) => setWidthAt(0, w)}
                        />
                    ) : (
                        <>
                            <WidthRow
                                label={t("p6.arch.widthL1")}
                                value={archWidths[0]}
                                onChange={(w) => setWidthAt(0, w)}
                            />
                            <WidthRow
                                label={t("p6.arch.widthL2")}
                                value={archWidths[1]}
                                onChange={(w) => setWidthAt(1, w)}
                            />
                        </>
                    )}
                    <div>
                        <span className="mb-1.5 block text-xs font-semibold text-muted">
                            {t("p6.arch.activation")}
                        </span>
                        <ActivationPicker value={s.act} onChange={setAct} />
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className="flex-1 text-xs font-semibold text-muted">
                            {t("p6.lr")}
                        </span>
                        <Select
                            value={s.lr}
                            onChange={(e) => setLr(e.target.value)}
                        >
                            {LRS.map((v) => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className="flex-1 text-xs font-semibold text-muted">
                            {t("p6.lrDecay")}
                        </span>
                        <SegmentedControl<string>
                            size="sm"
                            mono
                            ariaLabel={t("p6.lrDecay")}
                            value={s.lrDecay ? "on" : "off"}
                            options={[
                                { value: "off", label: t("p6.toggle.off") },
                                { value: "on", label: t("p6.toggle.on") },
                            ]}
                            onChange={(v) => setDecay(v === "on")}
                        />
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className="flex-1 text-xs font-semibold text-muted">
                            {t("p6.batchSize")}
                        </span>
                        <Select
                            value={String(s.batchSize)}
                            onChange={(e) => setBatch(parseInt(e.target.value))}
                        >
                            {BATCHES.map((v) => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </Select>
                    </div>
                </div>

                {/* stats */}
                <div className="flex items-center gap-4">
                    <div>
                        <MicroLabel>{t("p6.stats.steps")}</MicroLabel>
                        <div className="font-mono text-lg font-semibold text-fg">
                            {s.step}
                        </div>
                    </div>
                    <div>
                        <MicroLabel>Loss</MicroLabel>
                        <div className="font-mono text-lg font-semibold text-fg">
                            {s.loss != null ? s.loss.toFixed(3) : "—"}
                        </div>
                    </div>
                    <div>
                        <MicroLabel>{t("p6.stats.train")}</MicroLabel>
                        <div className="font-mono text-lg font-semibold text-fg">
                            {s.acc != null
                                ? (s.acc * 100).toFixed(0) + "%"
                                : "—"}
                        </div>
                    </div>
                    <div>
                        <MicroLabel>{t("p6.stats.val")}</MicroLabel>
                        <div className="font-mono text-lg font-semibold text-accent">
                            {s.valAcc != null
                                ? (s.valAcc * 100).toFixed(0) + "%"
                                : "—"}
                        </div>
                    </div>
                </div>

                {/* sparklines */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <MicroLabel className="mb-1 block">loss</MicroLabel>
                        <div className="h-10 rounded-md border border-border/40 bg-bg">
                            <canvas
                                ref={lossRef}
                                className="block h-full w-full"
                            />
                        </div>
                    </div>
                    <div>
                        <MicroLabel className="mb-1 block">
                            {t("p6.spark.accuracy")}
                        </MicroLabel>
                        <div className="h-10 rounded-md border border-border/40 bg-bg">
                            <canvas
                                ref={accRef}
                                className="block h-full w-full"
                            />
                        </div>
                    </div>
                </div>
            </Island>

            {/* main viz — one box that reads input → network → output */}
            <Island className="relative flex min-h-0 flex-col gap-3 p-4">
                {/* network preview */}
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-[14px] border border-border bg-bg">
                    <canvas
                        ref={diagramRef}
                        onMouseMove={onDiagramMove}
                        onMouseLeave={() => setHover(null)}
                        onClick={onDiagramClick}
                        className="block h-full w-full cursor-pointer"
                    />
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-bg/70">
                            <div className="flex flex-col items-center gap-2 text-muted">
                                <span className="h-2.5 w-2.5 rounded-full bg-accent motion-safe:animate-pulse" />
                                <span className="font-mono text-[11px] tracking-[.2em] uppercase">
                                    {t("p6.loading", {
                                        dataset: DATASET_LABEL[s.dataset],
                                    })}
                                </span>
                            </div>
                        </div>
                    )}
                    {/* neuron detail — a popover that follows the hovered neuron (click pins) */}
                    {inspect && (
                        <div className="absolute top-2 right-2 w-[190px] rounded-md border border-border bg-panel/95 p-2 shadow-lg backdrop-blur">
                            <div className="flex items-center justify-between">
                                <MicroLabel accent>{inspectLabel}</MicroLabel>
                                <button
                                    type="button"
                                    onClick={() =>
                                        patch("p6", { selectedNeuron: null })
                                    }
                                    aria-label={t("p6.detail.closeAria")}
                                    className="px-1 text-muted transition-colors hover:text-fg"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="mt-1.5 h-[128px] overflow-hidden rounded bg-bg">
                                <canvas
                                    ref={detailRef}
                                    className="block h-full w-full"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* bottom strip: the input image feeds in, the probabilities come out */}
                <div className="grid grid-cols-[auto_1fr] gap-4">
                    <div>
                        <MicroLabel className="mb-1.5 block">
                            {t("p6.input.label")}{" "}
                            {ready && snap
                                ? `· ${ready.classNames[snap.label] ?? snap.label}`
                                : ""}
                        </MicroLabel>
                        <div className="flex items-center gap-3">
                            <div className="h-20 w-20 overflow-hidden rounded-md border border-border/40 bg-bg">
                                <canvas
                                    ref={thumbRef}
                                    className="block h-full w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <GhostButton
                                        bordered
                                        className="px-2.5 py-1.5 text-xs"
                                        onClick={() => cycleInput(-1)}
                                    >
                                        {t("p6.input.prev")}
                                    </GhostButton>
                                    <GhostButton
                                        bordered
                                        className="px-2.5 py-1.5 text-xs"
                                        onClick={() => cycleInput(1)}
                                    >
                                        {t("p6.input.next")}
                                    </GhostButton>
                                </div>
                                <GhostButton
                                    bordered
                                    className="px-2.5 py-1.5 text-xs"
                                    onClick={randomInput}
                                >
                                    {t("p6.input.random")}
                                </GhostButton>
                            </div>
                        </div>
                    </div>
                    <div className="flex min-w-0 flex-col">
                        <MicroLabel accent className="mb-1.5 block">
                            {t("p6.output.probs")}
                        </MicroLabel>
                        <div className="h-[calc(84px_+_10vh)] overflow-hidden rounded-md bg-bg">
                            <canvas
                                ref={softmaxRef}
                                className="block h-full w-full"
                            />
                        </div>
                    </div>
                </div>
            </Island>
        </div>
    );
}

/* ---------------- detail-panel painter ---------------- */
function drawDetail(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    inspect: Neuron | null,
    client: MlpNetClient | null,
    ready: MlpNetClient["ready"] | null,
    t: TranslateFn
) {
    ctx.fillStyle = rgbCss(C.muted, 0.6);
    ctx.font = `500 11px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (!ready || !client) {
        ctx.fillText("…", W / 2, H / 2);
        return;
    }
    const snap = client.snapshot;
    // input node → the current image
    if (inspect == null || inspect.layer === -1) {
        if (snap) {
            const side = Math.min(W, H) - 8;
            paintVol(
                ctx,
                snap.input,
                ready.tile,
                ready.tile,
                ready.depth,
                (W - side) / 2,
                (H - side) / 2,
                side,
                side,
                "image"
            );
        } else ctx.fillText(t("p6.detail.hoverHint"), W / 2, H / 2);
        return;
    }
    const w = client.weights.get(`${inspect.layer}:${inspect.idx}`);
    const act = snap ? snap.acts[inspect.layer + 1]?.[inspect.idx] : undefined;
    if (inspect.layer === 0 && w) {
        // first hidden neuron → weight template as an image
        const side = Math.min(W, H - 22) - 6;
        paintVol(
            ctx,
            w.row,
            w.tile,
            w.tile,
            w.depth,
            (W - side) / 2,
            4,
            side,
            side,
            "signed"
        );
        ctx.fillStyle = rgbCss(C.muted);
        ctx.font = `500 10px ${FONT_MONO}`;
        ctx.fillText(
            act != null
                ? t("p6.detail.activation", { value: act.toFixed(2) })
                : t("p6.detail.weightTemplate"),
            W / 2,
            H - 9
        );
    } else if (w) {
        // deeper neuron → incoming-weight strip + activation value
        drawWeightStrip(ctx, W, H - 22, w.row);
        ctx.fillStyle = rgbCss(C.muted);
        ctx.font = `500 10px ${FONT_MONO}`;
        ctx.fillText(
            act != null
                ? t("p6.detail.activation", { value: act.toFixed(2) })
                : t("p6.detail.weight"),
            W / 2,
            H - 9
        );
    } else {
        ctx.fillText("…", W / 2, H / 2);
    }
}

function describeInspect(
    inspect: Neuron | null,
    ready: MlpNetClient["ready"] | null,
    t: TranslateFn
): string {
    if (!ready || inspect == null || inspect.layer === -1)
        return t("p6.inspect.input");
    const L = ready.layers.length;
    const isOutput = inspect.layer === L - 2; // fc L-1 maps to output column
    if (inspect.layer === 0)
        return t("p6.inspect.hidden1", { n: inspect.idx + 1 });
    if (isOutput) return t("p6.inspect.output", { n: inspect.idx + 1 });
    return t("p6.inspect.hiddenN", {
        layer: inspect.layer + 1,
        n: inspect.idx + 1,
    });
}
