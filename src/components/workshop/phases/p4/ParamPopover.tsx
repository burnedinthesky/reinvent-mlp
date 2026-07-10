/* P4 param popovers (P4 redesign §6) — replaces tap-to-cycle. One shared anchored
   popover, positioned `fixed` from the trigger's getBoundingClientRect so the
   rail's overflow can't clip it, closing on outside-pointerdown / Esc / scroll.
   Variants: CompassRose (8 arrows + here/random/dir-var footer), ChipList
   (telemetry + type-filtered var chips + number entry), NumberPad (preset grid),
   FactorPicker (Step× factors, reused for setup), SlotPicker (Look/Scan slot
   bindings — type-filtered A–D chips with rename labels). */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
    DIR8,
    DIR_ARROW,
    DIR_CELL,
    NUM_CHIPS,
    NUM_PRESETS,
    VAR_COLORS,
    VAR_SLOTS,
} from "#/lib/workshop/blocks";
import type { Dir8, NumExpr, VarSlot } from "#/lib/workshop/types";

/* ------------------------------------------------------------ popover shell */

interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}

/** A generic anchored popover panel. Renders into a portal at document.body,
    positioned below the anchor (flipping above if it would overflow the viewport).
    Closes on outside pointerdown, Esc, or any scroll. */
export function Popover({
    anchor,
    onClose,
    children,
}: {
    anchor: Rect;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number }>({
        top: anchor.top + anchor.height + 6,
        left: anchor.left,
    });

    // measure + flip/clamp once mounted so the panel never spills off-screen.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        let top = anchor.top + anchor.height + 6;
        let left = anchor.left;
        if (top + r.height > window.innerHeight - 8)
            top = anchor.top - r.height - 6;
        if (left + r.width > window.innerWidth - 8)
            left = window.innerWidth - 8 - r.width;
        if (left < 8) left = 8;
        if (top < 8) top = 8;
        setPos({ top, left });
    }, [anchor]);

    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node))
                onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        const onScroll = () => onClose();
        window.addEventListener("pointerdown", onDown, true);
        window.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onScroll, true);
        return () => {
            window.removeEventListener("pointerdown", onDown, true);
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={ref}
            role="dialog"
            style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                zIndex: 60,
            }}
            className="rounded-lg border border-border bg-panel p-2 shadow-xl motion-safe:animate-pop-in"
        >
            {children}
        </div>,
        document.body
    );
}

/** Read an element's viewport rect for anchoring a popover. */
export function rectOf(el: HTMLElement | null): Rect {
    const r = el?.getBoundingClientRect();
    return {
        top: r?.top ?? 0,
        left: r?.left ?? 0,
        width: r?.width ?? 0,
        height: r?.height ?? 0,
    };
}

/* ------------------------------------------------------------ compass rose */

/** 3×3 grid of arrow keys. `center` = 'here' (a here key) | 'blank' (disabled).
    Footer offers 🎲 random (Move only) + direction-typed variable chips. One
    click commits and closes. */
export function CompassRose({
    center,
    allowRandom,
    dirVars,
    onPickDir,
    onPickHere,
    onPickRandom,
    onPickVar,
}: {
    center: "here" | "blank";
    allowRandom: boolean;
    /** slots inferred to hold directions, offered as chips. */
    dirVars: VarSlot[];
    onPickDir: (d: Dir8) => void;
    onPickHere?: () => void;
    onPickRandom?: () => void;
    onPickVar?: (slot: VarSlot) => void;
}) {
    const cell = (r: number, c: number) => {
        if (r === 1 && c === 1) {
            if (center === "here") {
                return (
                    <button
                        key="here"
                        type="button"
                        onClick={onPickHere}
                        className="flex h-9 w-9 items-center justify-center rounded bg-black/30 font-mono text-[10px] font-bold text-white hover:bg-accent hover:text-accent-fg"
                    >
                        這裡
                    </button>
                );
            }
            return <div key="blank" className="h-9 w-9" />;
        }
        const d = DIR8.find(
            (dd) => DIR_CELL[dd][0] === r && DIR_CELL[dd][1] === c
        );
        if (!d) return <div key={`${r}-${c}`} className="h-9 w-9" />;
        return (
            <button
                key={d}
                type="button"
                onClick={() => onPickDir(d)}
                title={d}
                className="flex h-9 w-9 items-center justify-center rounded bg-black/30 text-base font-bold text-white hover:bg-accent hover:text-accent-fg"
            >
                {DIR_ARROW[d]}
            </button>
        );
    };
    return (
        <div>
            <div className="grid grid-cols-3 gap-1">
                {[0, 1, 2].map((r) => [0, 1, 2].map((c) => cell(r, c)))}
            </div>
            {(allowRandom || dirVars.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-border/50 pt-2">
                    {allowRandom && (
                        <button
                            type="button"
                            onClick={onPickRandom}
                            className="rounded bg-black/30 px-2 py-1 font-mono text-[10px] font-semibold text-white hover:bg-accent hover:text-accent-fg"
                        >
                            🎲 隨機
                        </button>
                    )}
                    {dirVars.map((slot) => (
                        <button
                            key={slot}
                            type="button"
                            onClick={() => onPickVar?.(slot)}
                            className="rounded px-2 py-1 font-mono text-[10px] font-bold text-white"
                            style={{ background: VAR_COLORS[slot] }}
                        >
                            {slot} ➤
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------ number pad */

/** grid of the number presets. One click commits. */
export function NumberPad({ onPick }: { onPick: (v: number) => void }) {
    return (
        <div className="grid grid-cols-4 gap-1">
            {NUM_PRESETS.map((v) => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onPick(v)}
                    className="rounded bg-black/30 px-2 py-1.5 font-mono text-[11px] font-semibold text-white hover:bg-accent hover:text-accent-fg"
                >
                    {v}
                </button>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------ chip list */

/** telemetry chips (each with a one-line definition) + number-typed variable
    chips + a number-preset grid — the picker for a NumExpr (Set numeric value /
    If comparison side). */
export function NumExprList({
    numVars,
    onPick,
}: {
    numVars: VarSlot[];
    onPick: (e: NumExpr) => void;
}) {
    return (
        <div className="w-[210px]">
            <div className="mb-1.5 flex flex-col gap-1">
                {NUM_CHIPS.map((m) => (
                    <button
                        key={m.k}
                        type="button"
                        onClick={() => onPick({ k: m.k })}
                        className="rounded bg-accent2/20 px-2 py-1 text-left hover:bg-accent group"
                    >
                        <span className="font-mono text-[10px] font-semibold text-white group-hover:text-accent-fg">
                            {m.label}
                        </span>
                        <span className="block text-[9px] leading-tight text-white/60 group-hover:text-accent-fg/80">
                            {m.def}
                        </span>
                    </button>
                ))}
            </div>
            {numVars.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                    {numVars.map((slot) => (
                        <button
                            key={slot}
                            type="button"
                            onClick={() => onPick({ k: "var", slot })}
                            className="rounded px-2 py-1 font-mono text-[10px] font-bold text-white"
                            style={{ background: VAR_COLORS[slot] }}
                        >
                            {slot} #
                        </button>
                    ))}
                </div>
            )}
            <NumberPad onPick={(v) => onPick({ k: "num", v })} />
        </div>
    );
}

/* ------------------------------------------------------------ slot picker */

/** the `→ 〈slot〉` binding picker for Look/Scan: the four A–D chips in their
    VAR_COLORS hues with the student's rename labels; slots whose inferred type
    conflicts with this card's binding stay visible but disabled, so the type
    filter is legible rather than mysterious. One click commits. */
export function SlotPicker({
    allowed,
    names,
    onPick,
}: {
    /** pickable slots — the caller filters to (matching type ∪ unset). */
    allowed: VarSlot[];
    /** rename labels (names[slot] falls back to the letter). */
    names?: Record<VarSlot, string>;
    onPick: (slot: VarSlot) => void;
}) {
    return (
        <div className="flex w-[168px] flex-col gap-1">
            {VAR_SLOTS.map((slot) => {
                const ok = allowed.includes(slot);
                const label = names?.[slot] || slot;
                return (
                    <button
                        key={slot}
                        type="button"
                        disabled={!ok}
                        onClick={() => onPick(slot)}
                        title={
                            ok ? `存進 ${label}` : "這格目前存的是另一種類型"
                        }
                        className={`flex items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[11px] font-semibold ${
                            ok
                                ? "bg-black/30 text-white hover:bg-accent hover:text-accent-fg"
                                : "cursor-not-allowed bg-black/15 text-white/35"
                        }`}
                    >
                        <span
                            className="inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-bold text-white"
                            style={{
                                background: VAR_COLORS[slot],
                                opacity: ok ? 1 : 0.4,
                            }}
                        >
                            {slot}
                        </span>
                        {label !== slot && (
                            <span className="truncate">{label}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/* ------------------------------------------------------------ factor picker */

/** small list of preset factors (LR × / setup lr / start). One click commits. */
export function FactorPicker<T extends string | number>({
    options,
    format,
    onPick,
}: {
    options: readonly T[];
    format?: (v: T) => string;
    onPick: (v: T) => void;
}) {
    return (
        <div className="flex flex-col gap-1">
            {options.map((v) => (
                <button
                    key={String(v)}
                    type="button"
                    onClick={() => onPick(v)}
                    className="rounded bg-black/30 px-3 py-1.5 text-left font-mono text-[11px] font-semibold text-white hover:bg-accent hover:text-accent-fg"
                >
                    {format ? format(v) : String(v)}
                </button>
            ))}
        </div>
    );
}
