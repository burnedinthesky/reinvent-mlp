import { useEffect, useRef, useState } from "react";
import { BookOpen, Database, UserRound, X } from "lucide-react";

import {
    PhaseHelpContent,
    PhaseHelpModal,
} from "#/components/workshop/PhaseHelpModal";
import { GhostButton, Island } from "#/components/workshop/ui";
import { LanguageSwitcher } from "#/components/LanguageSwitcher";
import { Toggle } from "#/components/admin/ui";
import { useWorkshop } from "#/state/workshop-context";
import { useI18n } from "#/lib/i18n/context";
import type { MessageKey } from "#/lib/i18n/messages";
import { REVEAL_META } from "#/lib/workshop/constants";
import type { Phase } from "#/lib/workshop/types";

/** Phase → operator code. Display names are resolved through t() (phases.*.name)
    so the nav labels track the active locale. */
const PHASE_DEFS: [string, Phase][] = [
    ["01", "P1"],
    ["02", "P2"],
    ["03", "P3"],
    ["04", "P4"],
    ["05", "P5"],
    ["06", "P6"],
    ["∅", "NONE"],
];

const PHASE_CODE: Record<Phase, string> = PHASE_DEFS.reduce(
    (acc, [code, key]) => {
        acc[key] = code;
        return acc;
    },
    {} as Record<Phase, string>
);

/** Typed lookup from a phase to its display-name message key. */
const PHASE_NAME_KEY: Record<Phase, MessageKey> = {
    P1: "phases.P1.name",
    P2: "phases.P2.name",
    P3: "phases.P3.name",
    P4: "phases.P4.name",
    P5: "phases.P5.name",
    P6: "phases.P6.name",
    NONE: "phases.NONE.name",
};

/** Server-armed countdown — counts down to the operator's deadline, or shows
    --:-- when no countdown is live. Ticks locally every second so the always-on
    chip stays smooth between the 4 s state polls. */
function Timer() {
    const { deadline } = useWorkshop();
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!deadline) return;
        const id = setInterval(() => setTick((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, [deadline]);

    const secLeft = deadline
        ? Math.max(0, Math.round((Date.parse(deadline) - Date.now()) / 1000))
        : null;
    if (secLeft === null) {
        return (
            <div className="flex items-center gap-2 font-mono text-sm font-semibold text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                --:--
            </div>
        );
    }
    const mm = String(Math.floor(secLeft / 60)).padStart(2, "0");
    const ss = String(secLeft % 60).padStart(2, "0");
    const low = secLeft <= 60;
    return (
        <div
            className={`flex items-center gap-2 font-mono text-sm font-semibold ${
                low ? "text-warning" : "text-muted"
            }`}
        >
            <span
                className={`h-1.5 w-1.5 rounded-full bg-current ${
                    low ? "motion-safe:animate-pulse" : "opacity-70"
                }`}
            />
            {mm}:{ss}
        </div>
    );
}

/** Phase-navigation chips — shown only when the operator has enabled self-select.
    'NONE' stays a valid room phase (operator-driven blank stage) but is not a
    destination students can pick themselves — except in instructor preview, where
    demoing the blank "eyes up front" screen is useful (includeNone). */
function PhaseChips({
    onPick,
    includeNone = false,
}: {
    onPick: () => void;
    includeNone?: boolean;
}) {
    const { store, setPhase } = useWorkshop();
    const { t } = useI18n();
    return (
        <div className="flex flex-wrap gap-1.5">
            {PHASE_DEFS.filter(([, key]) => includeNone || key !== "NONE").map(
                ([code, key]) => {
                    const on = store.phase === key;
                    const name = t(PHASE_NAME_KEY[key]);
                    return (
                        <button
                            key={key}
                            type="button"
                            title={name}
                            onClick={() => {
                                setPhase(key);
                                onPick();
                            }}
                            className={
                                on
                                    ? "flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide text-accent-fg uppercase"
                                    : "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] tracking-wide text-muted uppercase transition-colors hover:text-fg"
                            }
                        >
                            <span>{code}</span>
                            <span className={on ? "" : "text-muted/70"}>
                                {name}
                            </span>
                        </button>
                    );
                }
            )}
        </div>
    );
}

/** Per-phase reveal toggles — the student's own copy of the operator's reveal
    flags, shown only in self-select mode. Lists the flags belonging to the
    current phase (P1/P4/NONE have none, so nothing renders). Writing a toggle
    flips the client-side reveal that the phase renders against. */
function RevealToggles() {
    const { store, reveals, setClientReveal } = useWorkshop();
    const { t } = useI18n();
    const flags = REVEAL_META.filter((r) => r.phase === store.phase);
    if (flags.length === 0) return null;
    return (
        <div className="mt-3 border-t border-border/60 pt-3">
            <div className="mb-2 font-mono text-[10px] tracking-[.14em] text-muted uppercase">
                {t("header.revealToggles")}
            </div>
            <div className="flex flex-col gap-2.5">
                {flags.map((r) => (
                    <div
                        key={r.key}
                        className="flex items-start justify-between gap-3"
                    >
                        <div className="min-w-0">
                            <div className="font-mono text-xs text-fg">
                                {r.name}
                            </div>
                            <div className="mt-0.5 text-[11px] leading-snug text-muted">
                                {t(`reveals.${r.key}.caption` as MessageKey)}
                            </div>
                        </div>
                        <Toggle
                            checked={reveals?.[r.key] === true}
                            onChange={(v) => setClientReveal(r.key, v)}
                            ariaLabel={r.name}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Collapsed floating profile menu (top-right). A compact avatar chip showing the
    current phase; click to open a popover with the timer and — when self-select
    is enabled — phase-navigation chips + per-phase reveal toggles. */
function RoomHeader() {
    const { store, selfSelect, reveals, logout, preview } = useWorkshop();
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node))
                setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const initial = (store.name || store.nickname || "?")
        .slice(0, 1)
        .toUpperCase();
    const phaseCode = PHASE_CODE[store.phase];
    const phaseName = t(PHASE_NAME_KEY[store.phase]);

    return (
        <div ref={rootRef} className="fixed top-3 right-3 z-30">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={t("header.aria.menu")}
                className={`flex items-center gap-2 rounded-full border bg-panel/90 py-1 pr-1 pl-3 shadow-lg backdrop-blur transition-colors ${
                    preview
                        ? "border-accent"
                        : "border-border hover:border-accent"
                }`}
            >
                {preview ? (
                    <span className="font-mono text-[10px] font-semibold tracking-[.18em] text-accent uppercase">
                        {t("header.preview")}
                    </span>
                ) : (
                    <Timer />
                )}
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg text-[12px] font-semibold text-fg">
                    {initial}
                </span>
            </button>

            {open && (
                <Island className="absolute top-full right-0 mt-2 w-72 p-4 motion-safe:animate-pop-in">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg text-sm font-semibold text-fg">
                            {initial}
                        </div>
                        <div className="min-w-0">
                            <div className="truncate font-display text-sm font-semibold text-fg">
                                {store.nickname || t("header.guest")}
                            </div>
                            <div className="font-mono text-[11px] tracking-wide text-muted uppercase">
                                {phaseCode} · {phaseName}
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 border-t border-border/60 pt-3">
                        {selfSelect ? (
                            <>
                                <div className="mb-2 font-mono text-[10px] tracking-[.14em] text-muted uppercase">
                                    {preview
                                        ? t("header.previewPhases")
                                        : t("header.jumpPhase")}
                                </div>
                                <PhaseChips
                                    onPick={() => setOpen(false)}
                                    includeNone={preview}
                                />
                            </>
                        ) : (
                            <div className="flex items-center gap-2 text-xs text-muted">
                                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                                {t("header.followRoom")}
                            </div>
                        )}
                    </div>

                    {selfSelect && <RevealToggles />}

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                        <span className="font-mono text-[10px] tracking-[.14em] text-muted uppercase">
                            {t("common.language")}
                        </span>
                        <LanguageSwitcher />
                    </div>

                    <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3">
                        <GhostButton
                            bordered
                            onClick={() => {
                                setHelpOpen(true);
                                setOpen(false);
                            }}
                            className="flex w-full justify-center py-1.5 text-[12px] font-semibold"
                        >
                            {t("header.help")}
                        </GhostButton>
                        {preview ? (
                            <a
                                href="/"
                                className="flex w-full justify-center rounded-md border border-border py-1.5 text-center text-[12px] font-semibold text-warning transition-colors hover:text-warning"
                            >
                                {t("header.exitPreview")}
                            </a>
                        ) : (
                            <GhostButton
                                bordered
                                onClick={() => {
                                    setOpen(false);
                                    logout();
                                }}
                                className="flex w-full justify-center py-1.5 text-[12px] font-semibold text-warning hover:text-warning"
                            >
                                {t("header.logout")}
                            </GhostButton>
                        )}
                    </div>
                </Island>
            )}

            {helpOpen && (
                <PhaseHelpModal
                    phase={store.phase}
                    lineMode={reveals?.p2_line_mode === true}
                    p3wb={reveals?.p3_wb_plane === true}
                    p5Deep={reveals?.p5_deep === true}
                    onClose={() => setHelpOpen(false)}
                />
            )}
        </div>
    );
}

function ServerlessHeader({ onOpenSettings }: { onOpenSettings?: () => void }) {
    const { store, reveals } = useWorkshop();
    const { t } = useI18n();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const phaseName = t(PHASE_NAME_KEY[store.phase]);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={t("header.aria.menu")}
                aria-expanded={open}
                className="fixed top-3 right-3 z-40 flex h-10 items-center gap-2 rounded-full border border-border bg-panel/90 px-2.5 shadow-lg backdrop-blur transition-colors hover:border-accent"
            >
                <span className="hidden font-mono text-[10px] tracking-wide text-muted uppercase sm:block">
                    {PHASE_CODE[store.phase]} · {phaseName}
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg text-fg">
                    <UserRound size={14} />
                </span>
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t("serverless.profile.title")}
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setOpen(false);
                    }}
                >
                    <div className="flex h-[min(82dvh,720px)] w-[min(920px,96vw)] flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-2xl motion-safe:animate-pop-in">
                        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                            <div>
                                <div className="font-mono text-[10px] tracking-[.16em] text-accent uppercase">
                                    {t("serverless.profile.eyebrow")}
                                </div>
                                <h2 className="mt-1 font-display text-xl font-semibold text-fg">
                                    {t("serverless.profile.title")}
                                </h2>
                            </div>
                            <GhostButton
                                bordered
                                onClick={() => setOpen(false)}
                                aria-label={t("common.close")}
                                className="flex h-8 w-8 items-center justify-center p-0"
                            >
                                <X size={15} />
                            </GhostButton>
                        </header>

                        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto md:grid-cols-[280px_1fr] md:overflow-hidden">
                            <aside className="border-b border-border p-5 md:overflow-auto md:border-r md:border-b-0">
                                <div className="mb-3 font-mono text-[10px] tracking-[.14em] text-muted uppercase">
                                    {t("serverless.profile.navigation")}
                                </div>
                                <PhaseChips onPick={() => undefined} />
                                <RevealToggles />
                            </aside>
                            <section className="min-h-0 p-5 md:overflow-auto">
                                <div className="mb-4 flex items-center gap-2 border-b border-border/60 pb-3">
                                    <BookOpen size={16} className="text-accent" />
                                    <span className="font-display text-sm font-semibold text-fg">
                                        {t("serverless.profile.howTo")} · {phaseName}
                                    </span>
                                </div>
                                <PhaseHelpContent
                                    phase={store.phase}
                                    lineMode={reveals?.p2_line_mode === true}
                                    p3wb={reveals?.p3_wb_plane === true}
                                    p5Deep={reveals?.p5_deep === true}
                                />
                            </section>
                        </div>

                        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
                            <div className="flex items-center gap-3">
                                <span className="font-mono text-[10px] tracking-[.14em] text-muted uppercase">
                                    {t("common.language")}
                                </span>
                                <LanguageSwitcher />
                            </div>
                            <PrimarySettingsButton
                                onClick={() => {
                                    setOpen(false);
                                    onOpenSettings?.();
                                }}
                                label={t("serverless.profile.settings")}
                            />
                        </footer>
                    </div>
                </div>
            )}
        </>
    );
}

function PrimarySettingsButton({
    onClick,
    label,
}: {
    onClick: () => void;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
        >
            <Database size={15} />
            {label}
        </button>
    );
}

export function Header({ onOpenSettings }: { onOpenSettings?: () => void }) {
    const { serverless } = useWorkshop();
    return serverless ? (
        <ServerlessHeader onOpenSettings={onOpenSettings} />
    ) : (
        <RoomHeader />
    );
}
