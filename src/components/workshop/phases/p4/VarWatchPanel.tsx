/* P4 variable watch panel (P4 redesign §6). One row per variable the viewed
   program uses, showing its live value at the current replay step (numbers
   toFixed(3), directions as arrows), flashing briefly when it changes, plus the
   trainer's best / epochs-since-best telemetry rows. Pure derivation from
   frames[step].vars — no simulation. */

import { useEffect, useRef, useState } from "react";

import { DIR_ARROW, VAR_COLORS } from "#/lib/workshop/blocks";
import type { Dir8, StageRunResult, VarSlot } from "#/lib/workshop/types";

import type { SlotType } from "./varinfer";

const fmt = (v: number | Dir8): string =>
    typeof v === "number" ? v.toFixed(3) : `${DIR_ARROW[v]} ${v}`;

function WatchRow({
    label,
    color,
    value,
}: {
    label: string;
    color?: string;
    value: string;
}) {
    const [flash, setFlash] = useState(false);
    const prev = useRef(value);
    useEffect(() => {
        if (prev.current !== value) {
            prev.current = value;
            setFlash(true);
            const t = setTimeout(() => setFlash(false), 260);
            return () => clearTimeout(t);
        }
    }, [value]);
    return (
        <div className="flex items-center justify-between gap-3 py-0.5">
            <span
                className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold"
                style={{ color: color ?? "var(--color-muted)" }}
            >
                {color && (
                    <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: color }}
                    />
                )}
                {label}
            </span>
            <span
                className={`font-mono text-[11px] font-semibold transition-colors ${
                    flash ? "text-accent" : "text-fg"
                }`}
            >
                {value}
            </span>
        </div>
    );
}

export function VarWatchPanel({
    result,
    step,
    usedSlots,
    slotTypes,
    names,
}: {
    result: StageRunResult | null;
    step: number;
    /** slots the viewed program actually uses (Set or read). */
    usedSlots: VarSlot[];
    slotTypes: Record<VarSlot, SlotType>;
    names: Record<VarSlot, string>;
}) {
    if (!result || usedSlots.length === 0) return null;
    const frames = result.frames;
    const fr = frames[Math.max(0, Math.min(step, frames.length - 1))];
    return (
        <div className="rounded-md border border-border bg-bg/80 px-3 py-2 backdrop-blur-sm">
            <div className="mb-1 font-mono text-[9px] tracking-wide text-muted uppercase">
                變數監看
            </div>
            {usedSlots.map((slot) => (
                <WatchRow
                    key={slot}
                    label={`${names[slot] || slot}${slotTypes[slot] === "dir" ? " ➤" : ""}`}
                    color={VAR_COLORS[slot]}
                    value={fmt(fr.vars[slot])}
                />
            ))}
            <div className="mt-1 border-t border-border/40 pt-1">
                <WatchRow label="最佳讀數" value={fr.best.toFixed(3)} />
                <WatchRow
                    label="距離最佳已有幾輪"
                    value={String(fr.sinceBest)}
                />
            </div>
        </div>
    );
}
