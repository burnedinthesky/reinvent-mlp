/* Required-columns help (spec §4.1 / journey A0.2). Explains the CSV contract to
   the operator before import: the 9 feature codenames, the label column, what
   each means, and which direction pushes toward "owl". Hand-rolled modal — the
   kit has no Dialog primitive; overlay + Island panel, Esc / backdrop to close. */

import { useEffect } from "react";

import { GhostButton, Island, MicroLabel } from "#/components/workshop/ui";
import { COLS, DND_LABELS, FEATURES } from "#/lib/workshop/features";
import type { FeatureKey } from "#/lib/workshop/types";

/** one-line meaning per codename (the survey question behind each column). */
const MEANING: Record<FeatureKey, string> = {
    SCREEN_AVG: "Average daily phone/screen time.",
    CAFFEINE: "Caffeinated drinks in a week.",
    LATE7: "Nights per week going to bed late.",
    SNACK_DAYS: "Days per week with a late-night snack.",
    LATE_SHOWER: "Days per week showering late at night.",
    EARLY_WAKE: "Days per week waking up early.",
    GAME_HRS: "Hours per week gaming.",
    DND_START: "When phone Do-Not-Disturb kicks in at night (banded).",
    BREAKFAST: "Days per week eating breakfast.",
};

/** owl-direction weight from dataset-io's deriveOwl `dir` map: >0 pushes owl,
    <0 pushes early bird, 0.5 is a weak owl signal. */
const OWL_DIR: Record<FeatureKey, number> = {
    SCREEN_AVG: 1,
    CAFFEINE: 1,
    LATE7: 1,
    SNACK_DAYS: 1,
    LATE_SHOWER: 1,
    DND_START: 1,
    EARLY_WAKE: -1,
    BREAKFAST: -1,
    GAME_HRS: 0.5,
};

function DirChip({ dir }: { dir: number }) {
    if (dir < 0)
        return (
            <span className="font-mono text-[11px] text-accent2">↓ early</span>
        );
    if (dir < 1)
        return (
            <span className="font-mono text-[11px] text-muted">≈ weak owl</span>
        );
    return <span className="font-mono text-[11px] text-accent3">↑ owl</span>;
}

export function ImportHelpModal({ onClose }: { onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Required CSV columns"
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
            <Island className="flex max-h-[85vh] w-[640px] max-w-full flex-col overflow-hidden p-0 motion-safe:animate-pop-in">
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex max-h-[85vh] flex-col"
                >
                    <div className="flex items-start justify-between border-b border-border px-5 py-4">
                        <div>
                            <MicroLabel accent>CSV contract</MicroLabel>
                            <h3 className="mt-1 font-display text-lg font-semibold text-fg">
                                Required columns
                            </h3>
                        </div>
                        <GhostButton
                            bordered
                            onClick={onClose}
                            aria-label="Close"
                        >
                            Close ✕
                        </GhostButton>
                    </div>

                    <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4">
                        <p className="text-sm leading-relaxed text-muted">
                            Export the survey Sheet to CSV. Each question&apos;s
                            header must{" "}
                            <span className="text-fg">
                                contain its codename
                            </span>{" "}
                            (case-insensitive — a header like{" "}
                            <span className="font-mono text-fg">
                                螢幕使用 SCREEN_AVG(分/日)
                            </span>{" "}
                            maps to{" "}
                            <span className="font-mono text-fg">
                                SCREEN_AVG
                            </span>
                            ). All nine feature columns{" "}
                            <span className="text-fg">and</span> your chosen
                            label column are required; two headers matching one
                            codename is rejected.
                        </p>

                        <p className="rounded-md border border-border bg-panel/40 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                            <span className="text-accent">
                                Raw Google-Form export?
                            </span>{" "}
                            Paste it as-is — when no codenames are found,
                            columns are mapped{" "}
                            <span className="text-fg">by question order</span>{" "}
                            instead (Timestamp, then these 9 features, then the
                            average-bedtime question). The class label is
                            derived from that bedtime column via a median split;
                            any columns after it are ignored. No renaming or
                            manual label column needed.
                        </p>

                        <div>
                            <MicroLabel>9 feature columns</MicroLabel>
                            <div className="mt-2 overflow-hidden rounded-md border border-border">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-panel/60 font-mono text-[11px] text-muted uppercase">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">
                                                Codename
                                            </th>
                                            <th className="px-3 py-2 font-medium">
                                                Meaning
                                            </th>
                                            <th className="px-3 py-2 font-medium">
                                                Range
                                            </th>
                                            <th className="px-3 py-2 font-medium">
                                                Owl?
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60">
                                        {COLS.map((k) => {
                                            const m = FEATURES[k];
                                            const range =
                                                k === "DND_START"
                                                    ? DND_LABELS.map(
                                                          (l, i) => `${i}=${l}`
                                                      ).join(" · ")
                                                    : `${m.min}–${m.max}${m.unit ? ` ${m.unit}` : ""}`;
                                            return (
                                                <tr
                                                    key={k}
                                                    className="align-top"
                                                >
                                                    <td className="px-3 py-2 font-mono text-xs text-accent">
                                                        {k}
                                                    </td>
                                                    <td className="px-3 py-2 text-fg">
                                                        <span className="text-muted">
                                                            {m.name} —{" "}
                                                        </span>
                                                        {MEANING[k]}
                                                    </td>
                                                    <td className="px-3 py-2 font-mono text-[11px] text-muted">
                                                        {range}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <DirChip
                                                            dir={OWL_DIR[k]}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div>
                            <MicroLabel>Label column (required)</MicroLabel>
                            <div className="mt-2 space-y-2 text-sm text-muted">
                                <p>
                                    <span className="font-mono text-accent">
                                        LABEL_OWL
                                    </span>{" "}
                                    — class label,{" "}
                                    <span className="font-mono text-fg">0</span>{" "}
                                    = early bird,{" "}
                                    <span className="font-mono text-fg">1</span>{" "}
                                    = night owl.
                                </p>
                                <p className="text-[12px] text-muted/80">
                                    The label must be present as a 0/1 column —
                                    the importer will not guess it for you. (A
                                    raw Google-Form export instead derives it
                                    from the average-bedtime column.)
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </Island>
        </div>
    );
}
