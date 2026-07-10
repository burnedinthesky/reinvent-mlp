/* Required-columns help (spec §4.1 / journey A0.2). Explains the CSV contract to
   the operator before import: the 9 feature codenames, the label column, what
   each means, and which direction pushes toward "owl". Hand-rolled modal — the
   kit has no Dialog primitive; overlay + Island panel, Esc / backdrop to close. */

import { useEffect } from "react";

import { GhostButton, Island, MicroLabel } from "#/components/workshop/ui";
import { useI18n } from "#/lib/i18n/context";
import type { MessageKey } from "#/lib/i18n/messages";
import { COLS, DND_LABELS, FEATURES } from "#/lib/workshop/features";
import type { FeatureKey } from "#/lib/workshop/types";

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
    const { t } = useI18n();
    if (dir < 0)
        return (
            <span className="font-mono text-[11px] text-accent2">
                {t("admin.help.dir.early")}
            </span>
        );
    if (dir < 1)
        return (
            <span className="font-mono text-[11px] text-muted">
                {t("admin.help.dir.weak")}
            </span>
        );
    return (
        <span className="font-mono text-[11px] text-accent3">
            {t("admin.help.dir.owl")}
        </span>
    );
}

export function ImportHelpModal({ onClose }: { onClose: () => void }) {
    const { t } = useI18n();
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
            aria-label={t("admin.help.title")}
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
                            <MicroLabel accent>
                                {t("admin.help.eyebrow")}
                            </MicroLabel>
                            <h3 className="mt-1 font-display text-lg font-semibold text-fg">
                                {t("admin.help.title")}
                            </h3>
                        </div>
                        <GhostButton
                            bordered
                            onClick={onClose}
                            aria-label={t("common.close")}
                        >
                            {t("common.close")} ✕
                        </GhostButton>
                    </div>

                    <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4">
                        <p className="text-sm leading-relaxed text-muted">
                            {t("admin.help.body.before")}
                            <span className="text-fg">
                                {t("admin.help.body.contain")}
                            </span>
                            {t("admin.help.body.caseInsensitive")}
                            <span className="font-mono text-fg">
                                {t("admin.help.body.exampleHeader")}
                            </span>
                            {t("admin.help.body.mapsTo")}
                            <span className="font-mono text-fg">
                                SCREEN_AVG
                            </span>
                            {t("admin.help.body.after")}
                            <span className="text-fg">
                                {t("admin.help.body.and")}
                            </span>
                            {t("admin.help.body.labelCol")}
                        </p>

                        <p className="rounded-md border border-border bg-panel/40 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                            <span className="text-accent">
                                {t("admin.help.raw.lead")}
                            </span>{" "}
                            {t("admin.help.raw.body.before")}
                            <span className="text-fg">
                                {t("admin.help.raw.body.byOrder")}
                            </span>
                            {t("admin.help.raw.body.after")}
                        </p>

                        <div>
                            <MicroLabel>
                                {t("admin.help.featureColumns")}
                            </MicroLabel>
                            <div className="mt-2 overflow-hidden rounded-md border border-border">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-panel/60 font-mono text-[11px] text-muted uppercase">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">
                                                {t("admin.help.table.codename")}
                                            </th>
                                            <th className="px-3 py-2 font-medium">
                                                {t("admin.help.table.meaning")}
                                            </th>
                                            <th className="px-3 py-2 font-medium">
                                                {t("admin.help.table.range")}
                                            </th>
                                            <th className="px-3 py-2 font-medium">
                                                {t("admin.help.table.owl")}
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
                                                        {t(
                                                            `admin.meaning.${k}` as MessageKey
                                                        )}
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
                            <MicroLabel>
                                {t("admin.help.label.title")}
                            </MicroLabel>
                            <div className="mt-2 space-y-2 text-sm text-muted">
                                <p>
                                    <span className="font-mono text-accent">
                                        LABEL_OWL
                                    </span>
                                    {t("admin.help.label.body.before")}
                                    <span className="font-mono text-fg">0</span>
                                    {t("admin.help.label.body.early")}
                                    <span className="font-mono text-fg">1</span>
                                    {t("admin.help.label.body.owl")}
                                </p>
                                <p className="text-[12px] text-muted/80">
                                    {t("admin.help.label.note")}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </Island>
        </div>
    );
}
