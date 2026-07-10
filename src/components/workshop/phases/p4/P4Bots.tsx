/* P4 · Expedition — assemble a training-loop card program from primitives and run
   it over a fixed 100-epoch loop. A sidebar selector picks the surface: Practice
   Bowl (free, unscored) or, once the terrains are revealed, one of the two scored
   submission surfaces — Foothill (mlp_a, medium) or Range (mlp_b, hard). Each
   Submit scores that one terrain and draws from a shared attempt pool. Watch it
   descend the loss landscape in canvas iso-3D under batch=1 reading noise; a live
   loss-vs-epoch curve jags below-left and the true curve reveals at JUDGE. Revealed
   terrain fades in (revealT 0→1) and survives a reload via getTerrain. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useCanvas } from "#/components/workshop/canvas/useCanvas";
import {
    Island,
    MicroLabel,
    PrimaryButton,
    Select,
} from "#/components/workshop/ui";
import {
    BLOCK_CHIP_CLASS,
    CARDS,
    CAT_COLORS,
    CAT_NAME,
    CAT_ORDER,
    blockChipStyle,
    makeCard,
} from "#/lib/workshop/blocks";
import type { CardDef } from "#/lib/workshop/blocks";
import { BOT_CAP, SCORED_STAGES, STAGE_META } from "#/lib/workshop/constants";
import { drawTerrain3D } from "#/lib/workshop/draw/terrain3d";
import type {
    Card,
    CardType,
    StageId,
    StageRunResult,
} from "#/lib/workshop/types";
import type { BowlGrid } from "#/lib/workshop/data-service";
import { useWorkshop } from "#/state/workshop-context";

import { LossCurve } from "./LossCurve";
import { rectOf } from "./ParamPopover";
import { ProgramRail } from "./ProgramRail";
import { VarLegend } from "./VarLegend";
import { VarWatchPanel } from "./VarWatchPanel";
import { inferSlotTypes, usedSlotsOf } from "./varinfer";

const MAX_CARDS = 20;

/** Sidebar surface options, most-approachable first. The two MLP stages appear
    only once the operator reveals `p4_terrains`. */
const SURFACES: { id: StageId; label: string }[] = [
    { id: "bowl", label: "練習 · 碗形 · 簡單" },
    { id: "mlp_a", label: "送出 · 丘陵 · 中等" },
    { id: "mlp_b", label: "送出 · 山脈 · 困難" },
];

export function P4Bots() {
    const { service, store, patch, points, terrainStatus, reveals, caps } =
        useWorkshop();
    const s = store.p4;
    // Foothill + Range share one budget; an operator grant raises it for this student.
    const cap = caps.P4 ?? BOT_CAP;
    // Operator-driven reveal: with the flag off, the Foothill & Range submission
    // surfaces are hidden entirely; only the free Practice Bowl shows.
    const showTerrains = reveals?.p4_terrains === true;
    const surfaces = showTerrains
        ? SURFACES
        : SURFACES.filter((su) => su.id === "bowl");
    const isSubmission = s.sel !== "bowl";
    const prog = s.prog;
    const loop = prog.loop;
    const slotTypes = useMemo(() => inferSlotTypes(loop), [loop]);
    const replayRef = useRef<number | null>(null);
    const [dragging, setDragging] = useState(false);
    const terrainReady = terrainStatus?.state === "ready";
    const terrainBuilding =
        terrainStatus?.state === "building" || terrainStatus?.state === "error";

    useEffect(
        () => () => {
            if (replayRef.current) clearInterval(replayRef.current);
        },
        []
    );

    /* ---- flag retracts: snap back to the Practice Bowl so no one is stranded on a
     now-hidden submission surface ---- */
    useEffect(() => {
        if (showTerrains) return;
        if (s.sel === "bowl" && s.view.stage === "bowl") return;
        patch("p4", (st) => ({
            sel: "bowl" as const,
            view: { run: -1, stage: "bowl" as StageId, step: st.view.step },
        }));
    }, [showTerrains, s.sel, s.view.stage]);

    /* ---- the Bowl grid, reconstructed once the dataset is loaded ---- */
    const bowl = useMemo(
        () => (points.length ? service.bowlGrid() : null),
        [service, points]
    );

    /* ---- scored-stage grids, resolved async and cached by stage ---- */
    const [stageGrids, setStageGrids] = useState<
        Partial<Record<StageId, BowlGrid>>
    >({});
    const stage = s.view.stage;
    const revealed = s.revealed.includes(stage);
    useEffect(() => {
        if (stage === "bowl" || !revealed || stageGrids[stage]) return;
        let alive = true;
        service
            .getTerrain(stage)
            .then((g) => {
                if (alive) setStageGrids((prev) => ({ ...prev, [stage]: g }));
            })
            .catch(() => {
                /* not yet earned / offline — the fogged plane renders until it arrives */
            });
        return () => {
            alive = false;
        };
    }, [service, stage, revealed, stageGrids, terrainReady]);

    /* ---- reload recovery: re-reveal any scored stage this student has earned ---- */
    useEffect(() => {
        if (!points.length) return;
        let alive = true;
        for (const st of SCORED_STAGES) {
            service
                .getTerrain(st)
                .then((g) => {
                    if (!alive) return;
                    setStageGrids((prev) => ({ ...prev, [st]: g }));
                    patch("p4", (p) =>
                        p.revealed.includes(st)
                            ? {}
                            : { revealed: [...p.revealed, st as StageId] }
                    );
                })
                .catch(() => {
                    /* 0 submissions ⇒ terrain still locked; leave the tab locked */
                });
        }
        return () => {
            alive = false;
        };
        // Probe once on dataset load, and again once the background build completes
        // (terrainReady). Intentionally not keyed on `patch` (whose identity changes
        // each store update); the hooks-deps rule is not enforced in this config.
    }, [service, points.length, terrainReady]);

    const activeGrid: BowlGrid | null =
        stage === "bowl" ? bowl : (stageGrids[stage] ?? null);

    /* ---- terrain reveal animation ---- */
    const [revealT, setRevealT] = useState(1);
    const revealAnimRef = useRef<number | null>(null);
    useEffect(() => {
        if (revealAnimRef.current) window.clearInterval(revealAnimRef.current);
        if (stage === "bowl" || !activeGrid) {
            setRevealT(1);
            return;
        }
        setRevealT(0);
        const t0 = Date.now();
        revealAnimRef.current = window.setInterval(() => {
            const t = Math.min(1, (Date.now() - t0) / 700);
            setRevealT(t);
            if (t >= 1 && revealAnimRef.current) {
                window.clearInterval(revealAnimRef.current);
                revealAnimRef.current = null;
            }
        }, 16);
    }, [stage, activeGrid]);
    useEffect(
        () => () => {
            if (revealAnimRef.current)
                window.clearInterval(revealAnimRef.current);
        },
        []
    );

    /* ---- which run/stage is on screen ---- */
    const activeResult: StageRunResult | null =
        s.view.run === -1 ? s.sandboxRun : (s.runs[s.view.run]?.result ?? null);

    // the program whose variables the watch panel reflects (viewed run, or the
    // working program for the live sandbox run).
    const viewedProg =
        s.view.run === -1 ? s.prog : (s.runs[s.view.run]?.prog ?? s.prog);
    const viewedSlotTypes = useMemo(
        () => inferSlotTypes(viewedProg.loop),
        [viewedProg]
    );
    const viewedUsed = useMemo(
        () => usedSlotsOf(viewedProg.loop),
        [viewedProg]
    );

    const { ref } = useCanvas(
        (ctx, W, H) =>
            drawTerrain3D(ctx, W, H, {
                grid: activeGrid?.grid ?? null,
                gn: activeGrid?.gn ?? 201,
                gMin: activeGrid?.gMin ?? 0,
                gMax: activeGrid?.gMax ?? 1,
                yaw: s.camYaw,
                revealT,
                frames: activeResult?.frames ?? null,
                step: s.view.step,
                probes:
                    stage === "bowl"
                        ? store.p3.probes.map((p) => ({ w: p.w, b: p.b }))
                        : undefined,
                quality: dragging || revealT < 1 ? "draft" : "full",
            }),
        [
            activeGrid,
            revealT,
            s.camYaw,
            s.view,
            s.sandboxRun,
            s.runs,
            store.p3.probes,
            stage,
            dragging,
        ]
    );

    /* ---- replay ---- */
    const startReplay = () => {
        if (replayRef.current) clearInterval(replayRef.current);
        patch("p4", (st) => ({ view: { ...st.view, step: 0 } }));
        replayRef.current = window.setInterval(() => {
            patch("p4", (st) => {
                if (st.view.step >= 100) {
                    if (replayRef.current) {
                        clearInterval(replayRef.current);
                        replayRef.current = null;
                    }
                    return {};
                }
                return { view: { ...st.view, step: st.view.step + 1 } };
            });
        }, 45);
    };

    /* ---- editing the program ---- */
    const setLoop = (fn: (l: Card[]) => Card[]) =>
        patch("p4", (st) => ({ prog: { ...st.prog, loop: fn(st.prog.loop) } }));
    const updateCard = (i: number, card: Card) =>
        setLoop((l) => l.map((c, k) => (k === i ? card : c)));
    const removeCard = (i: number) =>
        setLoop((l) => l.filter((_, k) => k !== i));
    const reorderCard = (from: number, to: number) =>
        setLoop((l) => {
            const arr = [...l];
            const [card] = arr.splice(from, 1);
            arr.splice(to > from ? to - 1 : to, 0, card);
            return arr;
        });
    const appendCard = (t: CardType) => {
        if (loop.length >= MAX_CARDS) {
            toast.error(
                `迴圈已滿，最多 ${MAX_CARDS} 張卡。移除一張後才能新增。`
            );
            return;
        }
        setLoop((l) => [...l, makeCard(t)]);
    };

    /* ---- deploy ---- */
    const atCap = s.runs.length >= cap;
    const canDeploy = loop.length > 0 && (!isSubmission || !atCap);
    // The bot always spawns at a random spot; normalize on the way out so any
    // program persisted before the picker was removed still starts randomly.
    const randomStart = (p: typeof prog) => ({
        ...p,
        setup: { ...p.setup, start: "random" as const },
    });
    const deploySandbox = async () => {
        let res: StageRunResult;
        try {
            res = await service.botSandbox(randomStart(prog));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "執行被拒絕");
            return;
        }
        patch("p4", (st) => ({
            sandboxRun: res,
            sandboxHistory: [...st.sandboxHistory, res].slice(-3),
            view: { run: -1, stage: "bowl" as StageId, step: 0 },
        }));
        startReplay();
    };
    const deploySubmit = async (target: "mlp_a" | "mlp_b") => {
        let res: Awaited<ReturnType<typeof service.submitBot>>;
        try {
            res = await service.submitBot(randomStart(prog), target);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "執行被拒絕");
            return;
        }
        patch("p4", (st) => {
            const name = st.botName.trim() || `bot-${st.runs.length + 1}`;
            const runs = [
                ...st.runs,
                {
                    name,
                    prog: st.prog,
                    stage: target,
                    result: res.result,
                    loss: res.loss,
                },
            ];
            return {
                runs,
                revealed: Array.from(new Set([...st.revealed, target])),
                view: { run: runs.length - 1, stage: target, step: 0 },
            };
        });
        startReplay();
    };
    const deploy = async () => {
        if (!canDeploy) return;
        if (s.sel === "bowl") await deploySandbox();
        else await deploySubmit(s.sel);
    };

    /* ---- camera orbit ---- */
    const SNAP = Math.PI / 12;
    const yawDrag = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        setDragging(true);
        const base = s.camYaw;
        const ox = e.clientX;
        const move = (me: PointerEvent) => {
            const raw = base + (me.clientX - ox) * 0.01;
            patch("p4", { camYaw: Math.round(raw / SNAP) * SNAP });
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            setDragging(false);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    const fr = activeResult
        ? activeResult.frames[
              Math.min(s.view.step, activeResult.frames.length - 1)
          ]
        : null;
    const done = s.view.step >= 100;

    // If-lane tint: pass the frame's If-trace bits only while the rail still shows
    // the program that produced the on-screen run (a submitted run keeps its prog
    // reference until the next edit; the live sandbox views the working program).
    const railIfs =
        fr && (s.view.run === -1 || s.runs[s.view.run]?.prog === s.prog)
            ? fr.ifs
            : undefined;

    return (
        <div className="absolute inset-0 grid grid-cols-[480px_1fr] gap-3.5 p-3.5">
            {terrainBuilding && <TerrainBuildOverlay status={terrainStatus} />}

            {/* editor */}
            <Island className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
                <div>
                    <div className="flex items-baseline justify-between">
                        <MicroLabel accent className="text-[11px]">
                            Phase 04 · 遠征
                        </MicroLabel>
                        <span className="font-mono text-xs tracking-wide text-muted uppercase">
                            執行 {String(s.runs.length).padStart(2, "0")}/
                            {String(cap).padStart(2, "0")}
                        </span>
                    </div>
                    <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-fg">
                        組出訓練迴圈
                    </h2>
                </div>

                {/* surface selector — Practice Bowl vs the two scored submission surfaces */}
                <div>
                    <MicroLabel className="mb-1 block">地形</MicroLabel>
                    <Select
                        value={s.sel}
                        onChange={(e) => {
                            const sel = e.target.value as StageId;
                            patch("p4", {
                                sel,
                                view: { run: -1, stage: sel, step: 0 },
                            });
                        }}
                        aria-label="P4 地形"
                        className="w-full py-2 text-sm"
                    >
                        {surfaces.map((su) => (
                            <option key={su.id} value={su.id}>
                                {su.label}
                            </option>
                        ))}
                    </Select>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {s.sel === "bowl"
                            ? "你可以在碗形練習場自由練習；執行不會計分，也不會送出。"
                            : `送出後會評分${STAGE_META[s.sel].label}。丘陵和山脈共用 ${cap} 次機會。`}
                    </p>
                </div>

                {/* variable legend */}
                <div>
                    <MicroLabel className="mb-1 block">
                        變數 · 點擊可重新命名
                    </MicroLabel>
                    <VarLegend
                        slotTypes={slotTypes}
                        names={s.varNames}
                        onRename={(slot, name) =>
                            patch("p4", (st) => ({
                                varNames: { ...st.varNames, [slot]: name },
                            }))
                        }
                    />
                </div>

                {/* program rail */}
                <ProgramRail
                    loop={loop}
                    setup={prog.setup}
                    slotTypes={slotTypes}
                    varNames={s.varNames}
                    ifsMask={railIfs}
                    onSetup={(setup) =>
                        patch("p4", (st) => ({ prog: { ...st.prog, setup } }))
                    }
                    onChangeCard={updateCard}
                    onRemoveCard={removeCard}
                    onReorder={reorderCard}
                />

                {/* crate — grouped by category, with the loop-budget meter */}
                <div>
                    <div className="mb-1 flex items-baseline justify-between">
                        <MicroLabel>
                            卡片箱 · 點擊新增 · 滑過查看說明
                        </MicroLabel>
                        <span
                            className={`font-mono text-[10px] tracking-wide ${
                                loop.length >= MAX_CARDS
                                    ? "font-bold text-warning"
                                    : "text-muted"
                            }`}
                        >
                            卡片 {loop.length}/{MAX_CARDS}
                        </span>
                    </div>
                    <div className="flex flex-col gap-2">
                        {CAT_ORDER.map((cat) => {
                            const cards = CARDS.filter((c) => c.cat === cat);
                            const col = CAT_COLORS[cat];
                            return (
                                <div key={cat}>
                                    <div
                                        className="mb-1 font-mono text-[9px] font-bold tracking-wider uppercase"
                                        style={{ color: col.c }}
                                    >
                                        {CAT_NAME[cat]}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {cards.map((def) => (
                                            <CrateChip
                                                key={def.t}
                                                def={def}
                                                col={col}
                                                onAdd={() => appendCard(def.t)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1" />

                <div className="flex gap-2">
                    <input
                        value={s.botName}
                        onChange={(e) =>
                            patch("p4", { botName: e.target.value })
                        }
                        placeholder="替機器人命名"
                        maxLength={14}
                        className="w-[150px] rounded-md border border-border bg-bg px-3 py-2.5 font-mono text-xs text-fg outline-none placeholder:text-muted/60 focus:border-accent"
                    />
                    <PrimaryButton
                        onClick={deploy}
                        disabled={!canDeploy}
                        className="flex-1 font-display font-bold"
                    >
                        {loop.length === 0
                            ? "先填入迴圈"
                            : !isSubmission
                              ? "執行模擬"
                              : atCap
                                ? `${cap} 次已用完`
                                : "送出"}
                    </PrimaryButton>
                </div>
            </Island>

            {/* 3D map */}
            <div className="relative min-h-0 overflow-hidden rounded-[18px] border border-border bg-bg">
                <canvas
                    ref={ref}
                    onPointerDown={yawDrag}
                    onDoubleClick={() => patch("p4", { camYaw: 0.6 })}
                    className="block h-full w-full cursor-grab touch-none"
                />

                {/* top strip: current-surface caption (the surface is chosen in the sidebar) */}
                <div className="pointer-events-none absolute top-3.5 left-3.5 flex items-center gap-2 rounded-md border border-border bg-bg/80 px-3 py-1.5 backdrop-blur-sm">
                    <span className="font-mono text-[11px] tracking-wide text-muted uppercase">
                        {STAGE_META[s.view.stage].kind === "practice"
                            ? "練習"
                            : "送出"}
                    </span>
                    <span className="font-display text-sm font-semibold text-fg">
                        {STAGE_META[s.view.stage].label}
                    </span>
                    {isSubmission && !s.revealed.includes(s.sel) && (
                        <span
                            className="text-[13px] leading-none"
                            title="送出後揭開這個地形"
                        >
                            🔒
                        </span>
                    )}
                </div>

                {/* HUD */}
                {fr && (
                    <div className="pointer-events-none absolute top-16 left-3.5 flex gap-5 rounded-md border border-border bg-bg/80 px-4 py-2 backdrop-blur-sm">
                        <Hud label="EPOCH" value={`${s.view.step}/100`} />
                        <Hud
                            label="讀數 · 1 位同學"
                            value={fr.read.toFixed(3)}
                        />
                        <Hud label="步長 (LR)" value={fr.lr.toFixed(2)} />
                        {done && activeResult && (
                            <Hud
                                label="裁判 · 全班"
                                value={activeResult.trueLoss.toFixed(3)}
                                hot
                            />
                        )}
                    </div>
                )}

                {/* variable watch panel (below HUD, replay-time) */}
                {activeResult && viewedUsed.length > 0 && (
                    <div className="pointer-events-none absolute top-32 left-3.5 w-[220px]">
                        <VarWatchPanel
                            result={activeResult}
                            step={s.view.step}
                            usedSlots={viewedUsed}
                            slotTypes={viewedSlotTypes}
                            names={s.varNames}
                        />
                    </div>
                )}

                {/* live loss-vs-epoch curve */}
                {activeResult && activeGrid && (
                    <LossCurve
                        result={activeResult}
                        step={s.view.step}
                        gMin={activeGrid.gMin}
                        gMax={activeGrid.gMax}
                    />
                )}

                {/* chip row: Practice runs on the Bowl, or this surface's scored submissions */}
                {!isSubmission && s.sandboxHistory.length > 0 && (
                    <div className="absolute right-3.5 bottom-3.5 flex flex-wrap justify-end gap-2">
                        {s.sandboxHistory.map((run, i) => {
                            const isCur =
                                s.view.run === -1 && run === s.sandboxRun;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                        patch("p4", {
                                            sandboxRun: run,
                                            view: {
                                                run: -1,
                                                stage: "bowl" as StageId,
                                                step: 0,
                                            },
                                        });
                                        startReplay();
                                    }}
                                    className={`group inline-flex items-center gap-2 rounded-full border bg-bg/80 px-3.5 py-1.5 font-display text-xs font-semibold text-fg backdrop-blur-sm transition-colors ${
                                        isCur
                                            ? "border-accent shadow-[0_0_8px_1px] shadow-accent/40"
                                            : "border-border/60 hover:border-border"
                                    }`}
                                >
                                    <span>練習 {i + 1}</span>
                                    <span className="font-mono text-[11px] text-accent">
                                        {run.trueLoss.toFixed(3)}
                                    </span>
                                    <span
                                        className="text-[13px] leading-none text-muted transition-colors group-hover:text-fg"
                                        title="重播這次執行"
                                        aria-hidden
                                    >
                                        ↻
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
                {isSubmission && s.runs.some((r) => r.stage === s.sel) && (
                    <div className="absolute right-3.5 bottom-3.5 flex flex-wrap justify-end gap-2">
                        {s.runs
                            .flatMap((run, i) =>
                                run.stage === s.sel ? [{ run, i }] : []
                            )
                            .map(({ run, i }) => {
                                const isCur = s.view.run === i;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => {
                                            patch("p4", {
                                                view: {
                                                    run: i,
                                                    stage: run.stage,
                                                    step: 0,
                                                },
                                            });
                                            startReplay();
                                        }}
                                        className={`inline-flex items-center gap-2 rounded-full border bg-bg/80 px-3.5 py-1.5 font-display text-xs font-semibold text-fg backdrop-blur-sm transition-colors ${
                                            isCur
                                                ? "border-accent shadow-[0_0_8px_1px] shadow-accent/40"
                                                : "border-border/60 hover:border-border"
                                        }`}
                                    >
                                        <span>{run.name}</span>
                                        <span className="font-mono text-[11px] text-accent">
                                            {run.loss.toFixed(3)}
                                        </span>
                                    </button>
                                );
                            })}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------ sub-components */

function TerrainBuildOverlay({
    status,
}: {
    status: {
        state: "idle" | "building" | "ready" | "error";
        progress: number;
    };
}) {
    const errored = status.state === "error";
    const pct = Math.max(0, Math.min(100, Math.round(status.progress * 100)));
    return (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/85 backdrop-blur-sm">
            <div className="mx-6 w-[400px] max-w-full rounded-[18px] border border-border bg-panel px-8 py-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-accent/40">
                    <span className="h-2.5 w-2.5 rounded-full bg-accent motion-safe:animate-pulse" />
                </div>
                <h2 className="font-display text-lg font-semibold text-fg">
                    正在雕刻遠征地形
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    伺服器正在為今天的資料集建立兩個隱藏 loss
                    地形；每次匯入只會做一次。 準備好後，這個階段會自動開啟。
                </p>
                {errored ? (
                    <p className="mt-4 font-mono text-xs text-warning">
                        請稍等，建立過程遇到問題，正在重試。
                    </p>
                ) : (
                    <div className="mt-5">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                            <div
                                className="h-full rounded-full bg-accent transition-[width] duration-1000"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <div className="mt-2 text-right font-mono text-[11px] text-muted">
                            {pct}%
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/** A crate card key that adds its card on tap and shows the card's description
    in a portal popover while hovered (replaces the old fixed "card info" strip). */
function CrateChip({
    def,
    col,
    onAdd,
}: {
    def: CardDef;
    col: { c: string; d: string };
    onAdd: () => void;
}) {
    const [rect, setRect] = useState<ReturnType<typeof rectOf> | null>(null);
    return (
        <>
            <button
                type="button"
                onClick={onAdd}
                onMouseEnter={(e) => setRect(rectOf(e.currentTarget))}
                onMouseLeave={() => setRect(null)}
                className={`${BLOCK_CHIP_CLASS} cursor-pointer`}
                style={blockChipStyle(col)}
            >
                <span className="text-[16px] leading-none">{def.g}</span>
                {def.n}
            </button>
            {rect && <CardHint text={def.d} anchor={rect} />}
        </>
    );
}

/** hover-tooltip for a crate card: a fixed, portal-rendered panel anchored under
    the chip, flipping above / clamping so it never spills off-screen. */
function CardHint({
    text,
    anchor,
}: {
    text: string;
    anchor: ReturnType<typeof rectOf>;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState({
        top: anchor.top + anchor.height + 8,
        left: anchor.left,
    });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        let top = anchor.top + anchor.height + 8;
        let left = anchor.left;
        if (top + r.height > window.innerHeight - 8)
            top = anchor.top - r.height - 8;
        if (left + r.width > window.innerWidth - 8)
            left = window.innerWidth - 8 - r.width;
        if (left < 8) left = 8;
        if (top < 8) top = 8;
        setPos({ top, left });
    }, [anchor]);
    return createPortal(
        <div
            ref={ref}
            style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                zIndex: 60,
            }}
            className="pointer-events-none w-[280px] rounded-lg border border-border bg-panel px-3 py-2.5 text-xs leading-relaxed text-fg/90 shadow-xl motion-safe:animate-pop-in"
        >
            {text}
        </div>,
        document.body
    );
}

function Hud({
    label,
    value,
    hot,
}: {
    label: string;
    value: string;
    hot?: boolean;
}) {
    return (
        <div>
            <div
                className={`font-mono text-[9px] font-semibold tracking-wide uppercase ${
                    hot ? "text-accent" : "text-muted"
                }`}
            >
                {label}
            </div>
            <div
                className={`font-mono text-[15px] font-semibold ${hot ? "text-accent" : "text-fg"}`}
            >
                {value}
            </div>
        </div>
    );
}
