/* P4 variable legend (P4 redesign §6). 16 colored slot chips (A–P) in a 4×4 grid,
   each with an inferred type badge (# number / ➤ direction / · unset) and
   click-to-rename (client-only labels, never sent to the server). */

import { useState } from "react";

import { useI18n } from "#/lib/i18n/context";
import { VAR_COLORS, VAR_SLOTS } from "#/lib/workshop/blocks";
import type { VarSlot } from "#/lib/workshop/types";

import type { SlotType } from "./varinfer";

const badge = (t: SlotType) => (t === "num" ? "#" : t === "dir" ? "➤" : "·");

export function VarLegend({
    slotTypes,
    names,
    onRename,
}: {
    slotTypes: Record<VarSlot, SlotType>;
    names: Record<VarSlot, string>;
    onRename: (slot: VarSlot, name: string) => void;
}) {
    const { t } = useI18n();
    const [editing, setEditing] = useState<VarSlot | null>(null);
    return (
        <div className="grid grid-cols-4 gap-2">
            {VAR_SLOTS.map((slot) => {
                const label = names[slot] || slot;
                return editing === slot ? (
                    <input
                        key={slot}
                        autoFocus
                        defaultValue={label === slot ? "" : label}
                        placeholder={slot}
                        maxLength={10}
                        onBlur={(e) => {
                            onRename(slot, e.target.value.trim() || slot);
                            setEditing(null);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setEditing(null);
                        }}
                        className="w-full rounded border px-2.5 py-1.5 font-mono text-[13px] text-white outline-none"
                        style={{
                            background: VAR_COLORS[slot],
                            borderColor: VAR_COLORS[slot],
                        }}
                    />
                ) : (
                    <button
                        key={slot}
                        type="button"
                        onClick={() => setEditing(slot)}
                        title={t("p4.vars.rename")}
                        className="inline-flex w-full items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[13px] font-bold text-white"
                        style={{ background: VAR_COLORS[slot] }}
                    >
                        <span className="opacity-90">
                            {badge(slotTypes[slot])}
                        </span>
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
