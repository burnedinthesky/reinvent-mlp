/* P4 If card (P4 redesign §6). A header row (A 〈</>〉 B) plus indented then/else
   lanes: each lane has a colored left rail, its simple cards, and a `+ card`
   adder (disabled at 3). No nesting — branch cards are always simple. */

import {
    BLOCK_CHIP_CLASS,
    CARDS,
    CAT_COLORS,
    COMPARES,
    blockChipStyle,
    makeCard,
    numExprLabel,
} from "#/lib/workshop/blocks";
import type {
    Card,
    Compare,
    NumExpr,
    SimpleCard,
    VarSlot,
} from "#/lib/workshop/types";

import { FactorPicker, NumExprList } from "./ParamPopover";
import { SlotPill, SimpleParams } from "./CardRow";
import { numVarsOf } from "./varinfer";
import type { SlotType } from "./varinfer";

type IfCard = Extract<Card, { t: "if" }>;

/** the simple card types available inside a branch (everything but If). */
const BRANCH_CARDS = CARDS.filter((c) => c.t !== "if");

function CmpPill({
    value,
    onChange,
}: {
    value: Compare;
    onChange: (c: Compare) => void;
}) {
    return (
        <SlotPill
            label={value}
            render={(close) => (
                <FactorPicker
                    options={COMPARES}
                    onPick={(c) => {
                        onChange(c);
                        close();
                    }}
                />
            )}
        />
    );
}

function NumExprPill({
    value,
    slotTypes,
    onChange,
}: {
    value: NumExpr;
    slotTypes: Record<VarSlot, SlotType>;
    onChange: (e: NumExpr) => void;
}) {
    return (
        <SlotPill
            label={numExprLabel(value)}
            render={(close) => (
                <NumExprList
                    numVars={numVarsOf(slotTypes)}
                    onPick={(e) => {
                        onChange(e);
                        close();
                    }}
                />
            )}
        />
    );
}

function BranchLane({
    which,
    cards,
    slotTypes,
    varNames,
    active,
    onChange,
}: {
    which: "then" | "else";
    cards: SimpleCard[];
    slotTypes: Record<VarSlot, SlotType>;
    varNames?: Record<VarSlot, string>;
    /** replay tint: true = this lane ran this epoch, false = the other did,
      undefined = no run on screen. */
    active?: boolean;
    onChange: (cards: SimpleCard[]) => void;
}) {
    const railColor = which === "then" ? "#3f6f52" : "#7a3f3f";
    const full = cards.length >= 3;
    const update = (i: number, c: SimpleCard) =>
        onChange(cards.map((x, k) => (k === i ? c : x)));
    const remove = (i: number) => onChange(cards.filter((_, k) => k !== i));
    const add = (t: SimpleCard["t"]) =>
        onChange([...cards, makeCard(t) as SimpleCard]);
    return (
        <div
            className={`mt-1 ml-3 rounded-r border-l-2 pl-2.5 transition-opacity ${
                active === false ? "opacity-40" : ""
            }`}
            style={{
                borderColor: railColor,
                background: active ? "rgba(255,255,255,.06)" : undefined,
            }}
        >
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-muted uppercase">
                {which === "then" ? "then 分支" : "else 分支"}
                {active && (
                    <span className="rounded bg-accent/20 px-1 font-semibold text-accent normal-case">
                        本輪有執行
                    </span>
                )}
            </div>
            {cards.map((c, i) => {
                const col = CAT_COLORS[CARDS.find((d) => d.t === c.t)!.cat];
                return (
                    <div
                        key={i}
                        className={`${BLOCK_CHIP_CLASS} mb-1 w-full cursor-default`}
                        style={blockChipStyle(col)}
                    >
                        <span className="text-[15px] leading-none">
                            {CARDS.find((d) => d.t === c.t)!.g}
                        </span>
                        <span className="text-[12px] font-bold">
                            {CARDS.find((d) => d.t === c.t)!.n}
                        </span>
                        <div className="flex flex-1 flex-wrap items-center gap-1">
                            <SimpleParams
                                card={c}
                                slotTypes={slotTypes}
                                varNames={varNames}
                                onChange={(nc) => update(i, nc)}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => remove(i)}
                            className="-my-2 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center text-sm text-white/50 hover:text-white"
                        >
                            ×
                        </button>
                    </div>
                );
            })}
            <div className="flex flex-wrap gap-1">
                {BRANCH_CARDS.map((def) => (
                    <button
                        key={def.t}
                        type="button"
                        disabled={full}
                        onClick={() => add(def.t as SimpleCard["t"])}
                        className={`min-h-8 rounded border border-border/60 bg-bg px-2 py-1 font-mono text-[12px] ${
                            full
                                ? "cursor-not-allowed text-muted/40"
                                : "text-muted hover:border-accent hover:text-fg"
                        }`}
                        title={
                            full ? "分支已滿（最多 3 張卡）" : `新增${def.n}`
                        }
                    >
                        + {def.n}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function IfCardRow({
    card,
    slotTypes,
    varNames,
    takenThen,
    onChange,
    onRemove,
    onReorder,
}: {
    card: IfCard;
    slotTypes: Record<VarSlot, SlotType>;
    varNames?: Record<VarSlot, string>;
    /** replay tint: which branch this If took this epoch (undefined = no tint). */
    takenThen?: boolean;
    onChange: (c: Card) => void;
    onRemove: () => void;
    onReorder: (e: React.PointerEvent) => void;
}) {
    const col = CAT_COLORS.logic;
    return (
        <div
            className="w-full rounded-md"
            style={{ background: "rgba(63,111,82,.1)" }}
        >
            <div
                className={`${BLOCK_CHIP_CLASS} w-full cursor-default`}
                style={blockChipStyle(col)}
            >
                <span
                    onPointerDown={onReorder}
                    className="cursor-grab touch-none px-0.5 text-sm leading-none text-white/50 select-none"
                    title="拖曳重新排序"
                >
                    ⠿
                </span>
                <span className="text-[16px] leading-none">⑂</span>
                <span className="text-[13px] font-bold">If</span>
                <div className="flex flex-1 flex-wrap items-center gap-1">
                    <NumExprPill
                        value={card.a}
                        slotTypes={slotTypes}
                        onChange={(a) => onChange({ ...card, a })}
                    />
                    <CmpPill
                        value={card.cmp}
                        onChange={(cmp) => onChange({ ...card, cmp })}
                    />
                    <NumExprPill
                        value={card.b}
                        slotTypes={slotTypes}
                        onChange={(b) => onChange({ ...card, b })}
                    />
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    className="-my-2 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center text-sm text-white/50 hover:text-white"
                >
                    ×
                </button>
            </div>
            <div className="px-2 pb-2">
                <BranchLane
                    which="then"
                    cards={card.then}
                    slotTypes={slotTypes}
                    varNames={varNames}
                    active={takenThen === undefined ? undefined : takenThen}
                    onChange={(then) => onChange({ ...card, then })}
                />
                <BranchLane
                    which="else"
                    cards={card.else}
                    slotTypes={slotTypes}
                    varNames={varNames}
                    active={takenThen === undefined ? undefined : !takenThen}
                    onChange={(els) => onChange({ ...card, else: els })}
                />
            </div>
        </div>
    );
}
