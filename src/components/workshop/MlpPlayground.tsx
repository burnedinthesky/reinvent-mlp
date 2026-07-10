/* MLP Playground — a hand-rolled MLP trains live on the visible points.
   Adjust architecture/activation/LR, watch the decision surface + loss, and click
   a neuron to see the surface it draws. Purely client-side (no scoring). */

import { useEffect, useRef } from "react";

import { useCanvas } from "#/components/workshop/canvas/useCanvas";
import {
    GhostButton,
    Island,
    Kbd,
    MicroLabel,
    PillChip,
    PrimaryButton,
    Select,
} from "#/components/workshop/ui";
import { drawMlpMain } from "#/lib/workshop/draw/mlpMain";
import { drawMlpNet } from "#/lib/workshop/draw/network";
import type { NetNode } from "#/lib/workshop/draw/network";
import { drawSpark } from "#/lib/workshop/draw/spark";
import type { Activation } from "#/lib/workshop/mlp";
import { useI18n } from "#/lib/i18n/context";
import { useWorkshop } from "#/state/workshop-context";

const LRS = ["0.003", "0.01", "0.03", "0.1", "0.3", "1", "3"];

export function MlpPlayground() {
    const { config, points, service, store, patch, netEngineRef } =
        useWorkshop();
    const { t } = useI18n();
    const s = store.mlp;

    // lazily create + keep the net engine in sync (persists across remounts).
    if (config && !netEngineRef.current) {
        netEngineRef.current = service.createNetEngine(
            { layers: s.layers, n1: s.n1, n2: s.n2 },
            s.act,
            parseFloat(s.lr)
        );
    }
    const eng = netEngineRef.current;
    if (eng) {
        eng.act = s.act;
        eng.lr = parseFloat(s.lr);
    }

    const nodesRef = useRef<NetNode[]>([]);
    const frameRef = useRef(0);

    const { ref: mainRef, paint: paintMain } = useCanvas(
        (ctx, W, H) => {
            if (eng && config)
                drawMlpMain(ctx, W, H, eng, s.view, points, config.features);
        },
        [s.view, s.step, config, s.layers, s.n1, s.n2, s.act]
    );
    const { ref: netRef, paint: paintNet } = useCanvas(
        (ctx, W, H) => {
            if (eng) nodesRef.current = drawMlpNet(ctx, W, H, eng, s.view);
        },
        [s.view, s.step, s.layers, s.n1, s.n2, s.act]
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

    // training loop (~33ms, 10 steps/tick) while running.
    useEffect(() => {
        if (!s.running) return;
        const id = setInterval(() => {
            const e = netEngineRef.current;
            if (!e) return;
            for (let i = 0; i < 10; i++) e.trainStep();
            paintMain();
            paintNet();
            paintSpark();
            frameRef.current++;
            if (frameRef.current % 2 === 0)
                patch("mlp", { step: e.step, loss: e.lastLoss });
        }, 33);
        return () => clearInterval(id);
    }, [s.running, paintMain, paintNet, paintSpark, netEngineRef, patch]);

    // space toggles training.
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName || "";
            if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA")
                return;
            if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                patch("mlp", (st) => ({ running: !st.running }));
            }
        };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [patch]);

    const setArch = (
        p: Partial<{ layers: number; n1: number; n2: number }>
    ) => {
        const layers = p.layers ?? s.layers;
        const n1 = p.n1 ?? s.n1;
        const n2 = p.n2 ?? s.n2;
        eng?.reset({ layers, n1, n2 });
        patch("mlp", { ...p, step: 0, loss: null, view: "out" });
    };
    const stepOnce = () => {
        if (!eng) return;
        for (let i = 0; i < 10; i++) eng.trainStep();
        patch("mlp", { step: eng.step, loss: eng.lastLoss });
        repaint();
    };
    const reset = () => {
        eng?.reset({ layers: s.layers, n1: s.n1, n2: s.n2 });
        patch("mlp", { step: 0, loss: null });
        repaint();
    };
    const setAct = (v: Activation) => {
        if (eng) {
            eng.act = v;
            eng.reset({ layers: s.layers, n1: s.n1, n2: s.n2 });
        }
        patch("mlp", { act: v, step: 0, loss: null, view: "out" });
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
                patch("mlp", { view: nd.key });
                return;
            }
    };

    if (!config) return null;
    const vm = /^h(\d+)-(\d+)$/.exec(s.view);
    const viewLabel = vm
        ? t(
              vm[1] === "0"
                  ? "playground.view.hiddenLine"
                  : "playground.view.hidden",
              { layer: +vm[1] + 1, n: +vm[2] + 1 }
          )
        : t("playground.view.output");

    const steppers: {
        label: string;
        val: number;
        dec: () => void;
        inc: () => void;
        canDec: boolean;
        canInc: boolean;
    }[] = [
        {
            label: t("playground.arch.layers"),
            val: s.layers,
            dec: () => s.layers > 0 && setArch({ layers: s.layers - 1 }),
            inc: () => s.layers < 2 && setArch({ layers: s.layers + 1 }),
            canDec: s.layers > 0,
            canInc: s.layers < 2,
        },
    ];
    if (s.layers >= 1)
        steppers.push({
            label: t("playground.arch.neuronsL1"),
            val: s.n1,
            dec: () => s.n1 > 1 && setArch({ n1: s.n1 - 1 }),
            inc: () => s.n1 < 6 && setArch({ n1: s.n1 + 1 }),
            canDec: s.n1 > 1,
            canInc: s.n1 < 6,
        });
    if (s.layers >= 2)
        steppers.push({
            label: t("playground.arch.neuronsL2"),
            val: s.n2,
            dec: () => s.n2 > 1 && setArch({ n2: s.n2 - 1 }),
            inc: () => s.n2 < 6 && setArch({ n2: s.n2 + 1 }),
            canDec: s.n2 > 1,
            canInc: s.n2 < 6,
        });

    const stepBtnClass =
        "h-6 w-6 rounded-md border border-border bg-panel p-0 text-sm leading-none font-bold text-muted transition-colors hover:text-fg disabled:cursor-default disabled:opacity-35";

    return (
        <div className="absolute inset-0 grid grid-cols-[400px_1fr] gap-3.5 p-3.5">
            {/* bench */}
            <Island className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
                <div>
                    <div className="flex items-baseline justify-between">
                        <MicroLabel accent className="text-[11px]">
                            {t("playground.title")}
                        </MicroLabel>
                        <span className="font-mono text-xs tracking-wide text-muted uppercase">
                            {t("playground.trainPoints", {
                                count: points.filter((p) => !p.hidden).length,
                            })}
                        </span>
                    </div>
                    <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-fg">
                        {t("playground.heading")}
                    </h2>
                </div>

                {/* transport */}
                <div className="flex items-center gap-2">
                    {s.running ? (
                        <button
                            type="button"
                            onClick={() => patch("mlp", { running: false })}
                            className="flex-1 rounded-md border border-border bg-panel px-3.5 py-2.5 font-display text-sm font-bold text-muted transition-colors hover:text-fg"
                        >
                            {t("playground.transport.pause")}
                        </button>
                    ) : (
                        <PrimaryButton
                            onClick={() => patch("mlp", { running: true })}
                            className="flex-1 py-2.5 font-display font-bold"
                        >
                            {t("playground.transport.train")}
                        </PrimaryButton>
                    )}
                    <GhostButton
                        bordered
                        className="px-3 py-2.5"
                        onClick={stepOnce}
                    >
                        {t("playground.transport.step")}
                    </GhostButton>
                    <GhostButton
                        bordered
                        className="px-3 py-2.5"
                        onClick={reset}
                        title={t("playground.transport.resetTitle")}
                    >
                        {t("playground.transport.reset")}
                    </GhostButton>
                    {store.keyHints && <Kbd>SPACE</Kbd>}
                </div>

                {/* arch */}
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
                            {t("playground.arch.activation")}
                        </span>
                        <Select
                            value={s.act}
                            onChange={(e) =>
                                setAct(e.target.value as Activation)
                            }
                        >
                            <option value="tanh">tanh</option>
                            <option value="relu">ReLU</option>
                            <option value="sigmoid">sigmoid</option>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <span className="flex-1 text-xs font-semibold text-muted">
                            {t("playground.lr")}
                        </span>
                        <Select
                            value={s.lr}
                            onChange={(e) =>
                                patch("mlp", { lr: e.target.value })
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

                {/* stats */}
                <div className="flex items-center gap-4">
                    <div>
                        <MicroLabel>{t("playground.stats.steps")}</MicroLabel>
                        <div className="font-mono text-xl font-semibold text-fg">
                            {s.step}
                        </div>
                    </div>
                    <div>
                        <MicroLabel>
                            {t("playground.stats.trainLoss")}
                        </MicroLabel>
                        <div className="font-mono text-xl font-semibold text-fg">
                            {s.loss != null ? s.loss.toFixed(3) : "—"}
                        </div>
                    </div>
                    <div className="flex-1" />
                    <div className="h-9 w-28">
                        <canvas
                            ref={sparkRef}
                            className="block h-full w-full"
                        />
                    </div>
                </div>

                {/* network diagram */}
                <div>
                    <MicroLabel className="mb-1.5 block">
                        {t("playground.net.title")}
                    </MicroLabel>
                    <div className="h-[210px] overflow-hidden rounded-md border border-border/40 bg-bg">
                        <canvas
                            ref={netRef}
                            onClick={onNetClick}
                            className="block h-full w-full cursor-pointer"
                        />
                    </div>
                </div>

                <div className="flex-1" />
            </Island>

            {/* main viz */}
            <div className="relative min-h-0 overflow-hidden rounded-[18px] border border-border bg-bg">
                <canvas ref={mainRef} className="block h-full w-full" />
                <div className="absolute top-3.5 left-3.5 flex items-center gap-2">
                    <PillChip className="font-semibold text-fg">
                        {viewLabel}
                    </PillChip>
                    {vm && (
                        <button
                            type="button"
                            onClick={() => patch("mlp", { view: "out" })}
                            className="rounded-full border border-border bg-panel px-3 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:border-accent"
                        >
                            {t("playground.backToOutput")}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
