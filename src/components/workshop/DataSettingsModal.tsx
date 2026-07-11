import { useEffect, useMemo, useState } from "react";
import { Database, Sparkles, X } from "lucide-react";

import { GenerateSection } from "#/components/admin/sections/GenerateSection";
import { ImportSection } from "#/components/admin/sections/ImportSection";
import { GhostButton, PrimaryButton } from "#/components/workshop/ui";
import { LocalAdminService } from "#/lib/workshop/local-runtime";
import type { DatasetInfo } from "#/lib/workshop/admin-service";
import { useI18n } from "#/lib/i18n/context";
import { useWorkshop } from "#/state/workshop-context";

type Tab = "generate" | "import";

export function DataSettingsModal({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const { hasDataset, reloadDataset } = useWorkshop();
    const service = useMemo(() => new LocalAdminService(), []);
    const [tab, setTab] = useState<Tab>("generate");
    const [dataset, setDataset] = useState<DatasetInfo | null>(null);

    useEffect(() => {
        if (!open) return;
        service
            .getDataset()
            .then(setDataset)
            .catch(() => setDataset(null));
    }, [open, service]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && hasDataset) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [hasDataset, onClose, open]);

    if (!open) return null;

    const onDataset = (next: DatasetInfo | null) => {
        setDataset(next);
        void reloadDataset();
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t("serverless.settings.title")}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && hasDataset)
                    onClose();
            }}
        >
            <div className="flex h-[min(92dvh,900px)] w-[min(1180px,96vw)] flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-2xl motion-safe:animate-pop-in">
                <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-panel px-4 py-3 sm:px-6">
                    <div className="min-w-0">
                        <div className="font-mono text-[10px] tracking-[.16em] text-accent uppercase">
                            {t("serverless.settings.eyebrow")}
                        </div>
                        <h2 className="truncate font-display text-lg font-semibold text-fg">
                            {t("serverless.settings.title")}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-md border border-border bg-bg p-0.5">
                            <button
                                type="button"
                                onClick={() => setTab("generate")}
                                className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium ${tab === "generate" ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
                            >
                                <Sparkles size={14} />
                                {t("admin.section.generate")}
                            </button>
                            <button
                                type="button"
                                onClick={() => setTab("import")}
                                className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium ${tab === "import" ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
                            >
                                <Database size={14} />
                                {t("admin.section.import")}
                            </button>
                        </div>
                        {hasDataset && (
                            <GhostButton
                                bordered
                                onClick={onClose}
                                aria-label={t("common.close")}
                                className="flex h-8 w-8 items-center justify-center p-0"
                            >
                                <X size={15} />
                            </GhostButton>
                        )}
                    </div>
                </header>

                {!hasDataset && (
                    <div className="shrink-0 border-b border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-fg sm:px-6">
                        {t("serverless.settings.required")}
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
                    <div className="mx-auto max-w-5xl">
                        {tab === "generate" ? (
                            <GenerateSection
                                service={service}
                                onDataset={onDataset}
                            />
                        ) : (
                            <ImportSection
                                service={service}
                                onDataset={onDataset}
                                onState={() => undefined}
                            />
                        )}
                    </div>
                </div>

                <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-border bg-panel px-4 py-3 sm:px-6">
                    <span className="min-w-0 truncate text-xs text-muted">
                        {dataset
                            ? t("serverless.settings.active", {
                                  count:
                                      dataset.counts.real +
                                      dataset.counts.reveal +
                                      dataset.counts.hidden,
                              })
                            : t("serverless.settings.none")}
                    </span>
                    <PrimaryButton onClick={onClose} disabled={!hasDataset}>
                        {t("serverless.settings.continue")}
                    </PrimaryButton>
                </footer>
            </div>
        </div>
    );
}
