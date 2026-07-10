/* P4 card rows (P4 redesign §6). A placed card renders as a solid Scratch-like
   key: CAT-color fill, drag handle, glyph + name, and recessed slot pills for its
   params (each opens a ParamPopover). If cards defer to IfCardRow (header + then/
   else lanes). */

import { useState } from "react";

import {
    BLOCK_CHIP_CLASS,
    CARD_BY_TYPE,
    CAT_COLORS,
    DIR_ARROW,
    SLOT_PILL_CLASS,
    VAR_COLORS,
    blockChipStyle,
    numExprLabel,
} from "#/lib/workshop/blocks";
import type {
    Card,
    Dir8,
    DirParam,
    LrFactor,
    SetValue,
    SimpleCard,
    VarSlot,
} from "#/lib/workshop/types";

import {
    CompassRose,
    FactorPicker,
    NumExprList,
    Popover,
    SlotPicker,
    rectOf,
} from "./ParamPopover";
import { IfCardRow } from "./IfCardRow";
import { dirVarsOf, numVarsOf } from "./varinfer";
import type { SlotType } from "./varinfer";

/* ------------------------------------------------------------ slot pill */

/** A recessed param pill (value + ▾) that opens `render(close)` in a popover
    anchored to itself. `pillClass` overrides the recessed chip recipe (the
    setup blocks use a bigger variant). */
export function SlotPill({
    label,
    render,
    pillClass,
}: {
    label: React.ReactNode;
    render: (close: () => void) => React.ReactNode;
    pillClass?: string;
}) {
    const [rect, setRect] = useState<ReturnType<typeof rectOf> | null>(null);
    return (
        <>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setRect(rectOf(e.currentTarget));
                }}
                className={pillClass ?? SLOT_PILL_CLASS}
            >
                {label}
                <span className="text-[10px] opacity-70">▾</span>
            </button>
            {rect && (
                <Popover anchor={rect} onClose={() => setRect(null)}>
                    {render(() => setRect(null))}
                </Popover>
            )}
        </>
    );
}

/* ------------------------------------------------------------ param editors */

const dirLabel = (d: Dir8) => `${DIR_ARROW[d]} ${d}`;

function DirParamPill({
    value,
    allowRandom,
    slotTypes,
    onChange,
}: {
    value: DirParam;
    allowRandom: boolean;
    slotTypes: Record<VarSlot, SlotType>;
    onChange: (p: DirParam) => void;
}) {
    const label =
        value.k === "randomDir"
            ? "🎲 隨機"
            : value.k === "var"
              ? `${value.slot} ➤`
              : dirLabel(value.d);
    return (
        <SlotPill
            label={label}
            render={(close) => (
                <CompassRose
                    center="blank"
                    allowRandom={allowRandom}
                    dirVars={dirVarsOf(slotTypes)}
                    onPickDir={(d) => {
                        onChange({ k: "dir", d });
                        close();
                    }}
                    onPickRandom={() => {
                        onChange({ k: "randomDir" });
                        close();
                    }}
                    onPickVar={(slot) => {
                        onChange({ k: "var", slot });
                        close();
                    }}
                />
            )}
        />
    );
}

function slotChip(slot: VarSlot) {
    return (
        <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-[12px] font-bold text-white"
            style={{ background: VAR_COLORS[slot] }}
        >
            {slot}
        </span>
    );
}

/** the `→ 〈slot〉` binding pill on Look/Scan — opens the type-filtered
    SlotPicker (`kind` = the type this card writes; the other type's slots are
    disabled in the picker, unset slots are offered). */
function BindPill({
    slot,
    kind,
    slotTypes,
    varNames,
    onChange,
}: {
    slot: VarSlot;
    kind: "num" | "dir";
    slotTypes: Record<VarSlot, SlotType>;
    varNames?: Record<VarSlot, string>;
    onChange: (slot: VarSlot) => void;
}) {
    const allowed = (["A", "B", "C", "D"] as const).filter(
        (s) => slotTypes[s] === null || slotTypes[s] === kind
    );
    return (
        <>
            <span className="font-mono text-[12px] text-white/70">→</span>
            <SlotPill
                label={slotChip(slot)}
                render={(close) => (
                    <SlotPicker
                        allowed={allowed}
                        names={varNames}
                        onPick={(s) => {
                            onChange(s);
                            close();
                        }}
                    />
                )}
            />
        </>
    );
}

/** the param pills for a simple card. */
function SimpleParams({
    card,
    slotTypes,
    varNames,
    onChange,
}: {
    card: SimpleCard;
    slotTypes: Record<VarSlot, SlotType>;
    varNames?: Record<VarSlot, string>;
    onChange: (c: SimpleCard) => void;
}) {
    switch (card.t) {
        case "look": {
            const label =
                card.at === "here"
                    ? "這裡"
                    : card.at.k === "var"
                      ? `${card.at.slot} ➤`
                      : dirLabel(card.at.d);
            return (
                <>
                    <SlotPill
                        label={label}
                        render={(close) => (
                            <div>
                                <CompassRose
                                    center="here"
                                    allowRandom={false}
                                    dirVars={dirVarsOf(slotTypes)}
                                    onPickHere={() => {
                                        onChange({ ...card, at: "here" });
                                        close();
                                    }}
                                    onPickDir={(d) => {
                                        onChange({
                                            ...card,
                                            at: { k: "dir", d },
                                        });
                                        close();
                                    }}
                                    onPickVar={(slot) => {
                                        onChange({
                                            ...card,
                                            at: { k: "var", slot },
                                        });
                                        close();
                                    }}
                                />
                                <div className="mt-1.5 max-w-[150px] text-[9px] leading-tight text-muted">
                                    偷看一步外的位置，但不會移動你
                                </div>
                            </div>
                        )}
                    />
                    <BindPill
                        slot={card.slot}
                        kind="num"
                        slotTypes={slotTypes}
                        varNames={varNames}
                        onChange={(slot) => onChange({ ...card, slot })}
                    />
                </>
            );
        }
        case "scan":
            return (
                <BindPill
                    slot={card.slot}
                    kind="dir"
                    slotTypes={slotTypes}
                    varNames={varNames}
                    onChange={(slot) => onChange({ t: "scan", slot })}
                />
            );
        case "set":
            return (
                <>
                    {slotChip(card.slot)}
                    <SlotPill
                        label={card.slot}
                        render={(close) => (
                            <FactorPicker
                                options={["A", "B", "C", "D"] as const}
                                onPick={(slot) => {
                                    onChange({ ...card, slot });
                                    close();
                                }}
                            />
                        )}
                    />
                    <span className="font-mono text-[12px] text-white/70">
                        =
                    </span>
                    <SetValuePill
                        value={card.v}
                        slotTypes={slotTypes}
                        onChange={(v) => onChange({ ...card, v })}
                    />
                </>
            );
        case "move":
            return (
                <DirParamPill
                    value={card.dir}
                    allowRandom
                    slotTypes={slotTypes}
                    onChange={(dir) => onChange({ t: "move", dir })}
                />
            );
        case "jump":
            return null;
        case "lr":
            return (
                <SlotPill
                    label={String(card.f)}
                    render={(close) => (
                        <FactorPicker
                            options={[0.5, 0.9, 0.95, 1, 1.1, 2] as const}
                            format={(f) => `×${f}`}
                            onPick={(f: LrFactor) => {
                                onChange({ t: "lr", f });
                                close();
                            }}
                        />
                    )}
                />
            );
    }
}

/** the value pill for a Set card — a number expr, direction, or random dir. */
function SetValuePill({
    value,
    slotTypes,
    onChange,
}: {
    value: SetValue;
    slotTypes: Record<VarSlot, SlotType>;
    onChange: (v: SetValue) => void;
}) {
    const label =
        value.k === "dir"
            ? dirLabel(value.d)
            : value.k === "randomDir"
              ? "🎲 隨機方向"
              : numExprLabel(value);
    return (
        <SlotPill
            label={label}
            render={(close) => (
                <div className="w-[196px]">
                    <NumExprList
                        numVars={numVarsOf(slotTypes)}
                        onPick={(e) => {
                            onChange(e);
                            close();
                        }}
                    />
                    <div className="mt-2 border-t border-border/50 pt-2">
                        <div className="mb-1 font-mono text-[9px] tracking-wide text-muted uppercase">
                            方向
                        </div>
                        <CompassRose
                            center="blank"
                            allowRandom
                            dirVars={dirVarsOf(slotTypes)}
                            onPickDir={(d) => {
                                onChange({ k: "dir", d });
                                close();
                            }}
                            onPickRandom={() => {
                                onChange({ k: "randomDir" });
                                close();
                            }}
                            onPickVar={(slot) => {
                                onChange({ k: "var", slot });
                                close();
                            }}
                        />
                    </div>
                </div>
            )}
        />
    );
}

/* ------------------------------------------------------------ card row */

export function CardRow({
    card,
    slotTypes,
    varNames,
    onChange,
    onRemove,
    onReorder,
    takenThen,
}: {
    card: Card;
    slotTypes: Record<VarSlot, SlotType>;
    varNames?: Record<VarSlot, string>;
    onChange: (c: Card) => void;
    onRemove: () => void;
    onReorder: (e: React.PointerEvent) => void;
    /** during replay: this If's branch this epoch (true = then, false = else;
      undefined = no run on screen — no tint). */
    takenThen?: boolean;
}) {
    if (card.t === "if") {
        return (
            <IfCardRow
                card={card}
                slotTypes={slotTypes}
                varNames={varNames}
                takenThen={takenThen}
                onChange={onChange}
                onRemove={onRemove}
                onReorder={onReorder}
            />
        );
    }

    const def = CARD_BY_TYPE[card.t];
    const col = CAT_COLORS[def.cat];
    return (
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
            <span className="text-[16px] leading-none">{def.g}</span>
            <span className="text-[13px] font-bold">{def.n}</span>
            <div className="flex flex-1 flex-wrap items-center gap-1">
                <SimpleParams
                    card={card}
                    slotTypes={slotTypes}
                    varNames={varNames}
                    onChange={onChange}
                />
            </div>
            <button
                type="button"
                onClick={onRemove}
                title="移除"
                className="-my-2 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center text-sm text-white/50 hover:text-white"
            >
                ×
            </button>
        </div>
    );
}

export { SimpleParams };
