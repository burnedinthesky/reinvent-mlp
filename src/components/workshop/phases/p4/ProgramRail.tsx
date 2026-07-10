/* P4 program rail (v3 editor). Reads top-to-bottom as the program it is — the
   Python analogy made literal:
     👟 STEP SIZE                 — a full-width setup block (start is always random)
     🔁 REPEAT ×100 C-bracket     — header + thick spine + closing elbow
     🏁 SCORE finish strip        — judge reads the TRUE loss at the final spot
   Pure presentation over the current program + edit callbacks. During replay the
   frame's `ifs` bitmask tints each top-level If's taken then/else lane. */

import { useRef, useState } from "react";

import { LR_PRESETS } from "#/lib/workshop/blocks";
import type { Card, LrPreset, Setup, VarSlot } from "#/lib/workshop/types";

import { CardRow, SlotPill } from "./CardRow";
import { FactorPicker } from "./ParamPopover";
import type { SlotType } from "./varinfer";

/** full-opacity bracket/spine hue (the old rail-chip slate, undimmed). */
const BRACKET = "#4a6b96";

/** big value pill used by the setup blocks (a larger SlotPill skin). */
const BIG_PILL_CLASS =
    "inline-flex items-center gap-1.5 rounded-md bg-black/30 px-3 py-1.5 font-mono text-[13px] font-bold text-fg hover:bg-black/45";

/** per-preset flavor notes for the step-size popover (0.1 careful … 2.0 reckless). */
const LR_NOTES: Record<string, string> = {
    "0.1": "細心",
    "0.25": "謹慎",
    "0.5": "穩定",
    "1": "大膽",
    "2": "冒險",
};

/** one full-width setup block: icon + label + big value pill, explainer under. */
function SetupBlock({
    icon,
    label,
    suffix,
    explainer,
    pill,
    render,
}: {
    icon: string;
    label: string;
    suffix?: string;
    explainer: string;
    pill: string;
    render: (close: () => void) => React.ReactNode;
}) {
    return (
        <div className="mt-2 w-full rounded-lg border border-border/70 bg-panel px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] leading-none">{icon}</span>
                <span className="font-mono text-[11px] font-bold tracking-wider text-fg uppercase">
                    {label}
                </span>
                <SlotPill
                    label={pill}
                    pillClass={BIG_PILL_CLASS}
                    render={render}
                />
                {suffix && (
                    <span className="font-mono text-[10px] text-muted">
                        {suffix}
                    </span>
                )}
            </div>
            <div className="mt-1 text-[11px] leading-snug text-muted">
                {explainer}
            </div>
        </div>
    );
}

export function ProgramRail({
    loop,
    setup,
    slotTypes,
    varNames,
    ifsMask,
    onSetup,
    onChangeCard,
    onRemoveCard,
    onReorder,
}: {
    loop: Card[];
    setup: Setup;
    slotTypes: Record<VarSlot, SlotType>;
    varNames?: Record<VarSlot, string>;
    /** the on-screen replay frame's If-trace bitmask (undefined = no run). */
    ifsMask?: number;
    onSetup: (s: Setup) => void;
    onChangeCard: (i: number, c: Card) => void;
    onRemoveCard: (i: number) => void;
    onReorder: (from: number, to: number) => void;
}) {
    const rowRefs = useRef<(HTMLElement | null)[]>([]);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dropIdx, setDropIdx] = useState<number | null>(null);

    const startReorder = (i: number, e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        setDragIdx(i);
        setDropIdx(i);
        const move = (me: PointerEvent) => {
            let target = loop.length;
            for (let k = 0; k < loop.length; k++) {
                const el = rowRefs.current[k];
                if (!el) continue;
                const r = el.getBoundingClientRect();
                if (me.clientY < r.top + r.height / 2) {
                    target = k;
                    break;
                }
            }
            setDropIdx(target);
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            setDragIdx((from) => {
                setDropIdx((to) => {
                    if (from != null && to != null && from !== to)
                        onReorder(from, to);
                    return null;
                });
                return null;
            });
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    // running top-level If index, for mapping loop cards onto ifs-bitmask bits.
    let ifIdx = -1;

    return (
        <div className="rounded-[14px] border border-border/40 bg-bg px-3 pt-1 pb-3">
            {/* ---- setup block: step size (start is always random — no picker) ---- */}
            <SetupBlock
                icon="👟"
                label="步長"
                suffix="(= 學習率)"
                explainer="每個 epoch 中，一次移動會走多遠"
                pill={String(setup.lr)}
                render={(close) => (
                    <div>
                        <FactorPicker
                            options={LR_PRESETS}
                            format={(lr) =>
                                `${lr}  ${LR_NOTES[String(lr)] ?? ""}`
                            }
                            onPick={(lr: LrPreset) => {
                                onSetup({ ...setup, lr });
                                close();
                            }}
                        />
                        <div className="mt-1.5 max-w-[170px] border-t border-border/50 pt-1.5 text-[9px] leading-tight text-muted">
                            <em>步長</em>就是 ML 裡所說的{" "}
                            <strong>學習率</strong>
                        </div>
                    </div>
                )}
            />

            {/* ---- the REPEAT C-bracket: header, thick spine, closing elbow ---- */}
            <div className="mt-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <span
                        className="font-mono text-[12px] font-bold tracking-wider"
                        style={{ color: BRACKET }}
                    >
                        🔁 重複 ×100
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                        — 跑一輪 = 一個 epoch
                    </span>
                </div>
                <div
                    className="mt-1 ml-[5px] border-l-4 pt-1 pb-2 pl-3"
                    style={{ borderColor: BRACKET }}
                >
                    {loop.length === 0 && (
                        <div className="mt-1 rounded-md border-[1.5px] border-dashed border-border py-3 text-center font-mono text-[10px] text-muted">
                            迴圈是空的，從下方新增卡片
                        </div>
                    )}
                    {loop.map((card, i) => {
                        const thisIfIdx = card.t === "if" ? ++ifIdx : ifIdx;
                        const takenThen =
                            card.t === "if" && ifsMask !== undefined
                                ? (ifsMask & (1 << thisIfIdx)) !== 0
                                : undefined;
                        return (
                            <div
                                key={i}
                                ref={(el) => {
                                    rowRefs.current[i] = el;
                                }}
                                className={`mt-2 ${dragIdx === i ? "opacity-40" : ""} ${
                                    dropIdx === i && dragIdx !== i
                                        ? "border-t-2 border-accent pt-1"
                                        : ""
                                }`}
                            >
                                <CardRow
                                    card={card}
                                    slotTypes={slotTypes}
                                    varNames={varNames}
                                    takenThen={takenThen}
                                    onChange={(c) => onChangeCard(i, c)}
                                    onRemove={() => onRemoveCard(i)}
                                    onReorder={(e) => startReorder(i, e)}
                                />
                            </div>
                        );
                    })}
                </div>
                <div className="ml-[5px] flex items-center">
                    <span
                        className="h-3 w-3 shrink-0 rounded-bl-md border-b-4 border-l-4"
                        style={{ borderColor: BRACKET }}
                        aria-hidden
                    />
                    <span className="ml-2 font-mono text-[10px] font-semibold text-muted">
                        ↺ 回到最上方，進入下一個 epoch
                    </span>
                </div>
            </div>

            {/* ---- finish strip: terminal marker, not a card ---- */}
            <div className="mt-3 border-t border-border/70 pt-2">
                <div className="font-mono text-[11px] leading-snug">
                    <span className="font-bold tracking-wider text-fg">
                        🏁 評分
                    </span>
                    <span className="text-muted">
                        {" "}
                        — 裁判會讀取你終點位置的
                        <span className="font-semibold text-accent">
                            真實 loss
                        </span>
                    </span>
                </div>
            </div>
        </div>
    );
}
