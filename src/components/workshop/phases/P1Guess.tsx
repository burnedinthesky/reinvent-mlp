/* P1 · Guess the Class — card deck. Label every imported classmate as owl/early,
   then submit for scoring (max 3 attempts). The deck size follows the actual
   number of survey rows loaded from the server, not a fixed count. */

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
    GhostButton,
    Island,
    Kbd,
    MicroLabel,
    PrimaryButton,
    StatCard,
    useConfirm,
} from "#/components/workshop/ui";
import { formatFeature } from "#/lib/workshop/features";
import { GUESS_CAP } from "#/lib/workshop/constants";
import type { ClassLabel, FeatureKey, RealRow } from "#/lib/workshop/types";
import { useI18n } from "#/lib/i18n/context";
import { useWorkshop } from "#/state/workshop-context";

export function P1Guess() {
    const { t } = useI18n();
    const { config, realRows, service, store, patch, caps } = useWorkshop();
    const s = store.p1;

    // P1 is blind: the true labels are never shipped to this phase (they appear in
    // P2), so there is no in-phase reveal — students only ever see their score.

    const order = useMemo<RealRow[]>(() => {
        const o = realRows.slice();
        if (s.sort)
            o.sort(
                (a, b) =>
                    a.feats[s.sort as FeatureKey] -
                    b.feats[s.sort as FeatureKey]
            );
        return o;
    }, [realRows, s.sort]);

    // deck size = however many rows the operator imported (server-driven).
    const n = order.length;
    // count only rows present in the current deck so stale label keys from an
    // earlier import can't inflate progress (ClassLabel 0 is valid → test !== undefined).
    const done = order.filter((r) => s.labels[r.id] !== undefined).length;
    const full = n > 0 && done === n;
    const cap = caps.P1 ?? GUESS_CAP;
    const left = cap - s.attempt;
    const cur = order[Math.min(s.idx, n - 1)];

    const setLabel = (cls: ClassLabel) => {
        patch("p1", (st) => {
            const labels = { ...st.labels, [cur.id]: cls };
            let next = -1;
            for (let k = 1; k <= order.length; k++) {
                const j = (st.idx + k) % order.length;
                if (labels[order[j].id] === undefined) {
                    next = j;
                    break;
                }
            }
            if (next === -1) return { labels, mode: "review" as const };
            return { labels, idx: next };
        });
    };
    const moveCard = (d: number) =>
        patch("p1", (st) => ({
            idx: (st.idx + d + n) % n,
            mode: "deck" as const,
        }));

    // keyboard: A=owl, B=early, ←/→ move (deck mode only).
    const kbd = useRef<(e: KeyboardEvent) => void>(() => {});
    kbd.current = (e) => {
        const tag = (e.target as HTMLElement | null)?.tagName || "";
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        if (s.mode !== "deck") return;
        const k = e.key.toLowerCase();
        if (k === "a") setLabel(1);
        else if (k === "b") setLabel(0);
        else if (e.key === "ArrowLeft") moveCard(-1);
        else if (e.key === "ArrowRight") moveCard(1);
    };
    useEffect(() => {
        const h = (e: KeyboardEvent) => kbd.current(e);
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, []);

    // which submission the score card is showing; -1 tracks the latest so a fresh
    // submit always jumps the card to it, while the ‹ › arrows pin an older one.
    const [histView, setHistView] = useState(-1);
    const hist = s.history;
    const shownIdx = histView < 0 ? hist.length - 1 : histView;

    // in-flight guard so the submit button can't be double-fired, plus a record of
    // label combinations already sent this session to warn on exact re-submits.
    const [submitting, setSubmitting] = useState(false);
    const { confirm, dialog } = useConfirm();
    const sentRef = useRef<Set<string>>(new Set());
    const comboSig = (labels: typeof s.labels) =>
        order.map((r) => `${r.id}:${labels[r.id] ?? "-"}`).join("|");

    const submit = async () => {
        if (!full || left <= 0 || submitting) return;
        const sig = comboSig(s.labels);
        if (
            sentRef.current.has(sig) &&
            !(await confirm({
                title: t("p1.confirm.title"),
                message: t("p1.confirm.message"),
                confirmLabel: t("p1.confirm.ok"),
            }))
        )
            return;
        setSubmitting(true);
        try {
            const res = await service.submitGuess(s.labels);
            sentRef.current.add(sig);
            patch("p1", (st) => ({
                attempt: res.attempt,
                score: res.acc,
                history: [...st.history, res.acc],
            }));
            setHistView(-1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t("p1.toast.rejected"));
        } finally {
            setSubmitting(false);
        }
    };

    // no config, or the survey rows haven't loaded yet — nothing to deal.
    if (!config || n === 0) return null;
    const curLab = s.labels[cur.id];

    return (
        <div className="mx-auto max-w-[800px] px-6 pt-7 pb-16">
            {dialog}
            {/* header */}
            <div className="mb-4">
                <MicroLabel accent className="mb-1.5 block text-[11px]">
                    {t("p1.micro")}
                </MicroLabel>
                <h2 className="font-display text-2xl font-bold tracking-tight text-fg">
                    {t("p1.title")}
                </h2>
            </div>

            {/* judged score — top right, populated on submit. With more than one
          submission the ‹ › arrows browse the per-attempt history. */}
            {hist.length > 0 && (
                <StatCard
                    label={t("p1.score")}
                    value={`${hist[shownIdx].toFixed(1)}%`}
                    accent
                    className="fixed top-16 right-3 z-20 min-w-[168px] motion-safe:animate-slide-up"
                >
                    {hist.length > 1 && (
                        <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-xs text-muted">
                            <button
                                type="button"
                                aria-label={t("p1.hist.prev")}
                                disabled={shownIdx <= 0}
                                onClick={() =>
                                    setHistView(Math.max(0, shownIdx - 1))
                                }
                                className="rounded px-1.5 py-0.5 hover:text-fg disabled:opacity-30"
                            >
                                ‹
                            </button>
                            <span className="tabular-nums">
                                {shownIdx + 1} / {hist.length}
                                {shownIdx < hist.length - 1 && (
                                    <span className="ml-1 text-[10px] tracking-wide uppercase">
                                        {t("p1.hist.past")}
                                    </span>
                                )}
                            </span>
                            <button
                                type="button"
                                aria-label={t("p1.hist.next")}
                                disabled={shownIdx >= hist.length - 1}
                                onClick={() =>
                                    setHistView(
                                        shownIdx + 1 >= hist.length - 1
                                            ? -1
                                            : shownIdx + 1
                                    )
                                }
                                className="rounded px-1.5 py-0.5 hover:text-fg disabled:opacity-30"
                            >
                                ›
                            </button>
                        </div>
                    )}
                </StatCard>
            )}

            {/* progress rail */}
            <Island className="mb-3.5 rounded-[14px] px-4 pt-3.5 pb-3">
                <div className="mb-2.5 flex flex-wrap gap-1">
                    {order.map((r, i) => {
                        const lab = s.labels[r.id];
                        const curDot = i === s.idx && s.mode === "deck";
                        return (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() =>
                                    patch("p1", { idx: i, mode: "deck" })
                                }
                                title={r.pseudo}
                                className={`h-[11px] w-[11px] cursor-pointer rounded-[3px] ${
                                    lab === 1
                                        ? "bg-accent3"
                                        : lab === 0
                                          ? "bg-accent2"
                                          : "bg-border"
                                } ${curDot ? "outline-2 outline-offset-2 outline-accent" : ""}`}
                            />
                        );
                    })}
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted">
                    <span>{t("p1.progress.marked", { done, n })}</span>
                    {store.keyHints && (
                        <span className="flex items-center gap-1 font-mono text-[11px] text-muted">
                            <Kbd>A</Kbd> {t("p1.kbd.owl")} · <Kbd>B</Kbd>{" "}
                            {t("p1.kbd.early")} · <Kbd>←</Kbd>
                            <Kbd>→</Kbd> {t("p1.kbd.move")}
                        </span>
                    )}
                </div>
            </Island>

            {/* deck / review */}
            {s.mode === "deck" ? (
                <>
                    <Island className="px-6 pt-6 pb-5">
                        <div className="mb-4 flex items-baseline justify-between">
                            <div className="flex items-center gap-2.5">
                                <span
                                    className={`h-3 w-3 rounded-full ${
                                        curLab === 1
                                            ? "bg-accent3"
                                            : curLab === 0
                                              ? "bg-accent2"
                                              : "bg-border"
                                    }`}
                                />
                                <span className="font-display text-xl font-bold tracking-tight text-fg">
                                    {cur.pseudo}
                                </span>
                            </div>
                            <span className="font-mono text-xs text-muted">
                                {String(s.idx + 1).padStart(2, "0")} / {n}
                            </span>
                        </div>

                        {config.cols.map((k) => {
                            const m = config.features[k];
                            const v = cur.feats[k];
                            const pct = Math.max(
                                0,
                                Math.min(
                                    100,
                                    ((v - m.min) / (m.max - m.min)) * 100
                                )
                            );
                            const medPct = Math.max(
                                0,
                                Math.min(
                                    100,
                                    ((realMedian(k, realRows) - m.min) /
                                        (m.max - m.min)) *
                                        100
                                )
                            );
                            return (
                                <div
                                    key={k}
                                    className="grid grid-cols-[128px_1fr_84px] items-center gap-3.5 py-1.5"
                                >
                                    <div className="text-xs font-semibold whitespace-nowrap text-muted">
                                        {m.name}{" "}
                                        <span className="text-[11px] font-normal text-muted/60">
                                            {m.unit}
                                        </span>
                                    </div>
                                    <div className="relative h-2 rounded-sm border border-border/40 bg-bg">
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-sm bg-accent/60"
                                            style={{
                                                width: `${pct.toFixed(1)}%`,
                                            }}
                                        />
                                        <div
                                            className="absolute -inset-y-1 w-0.5 rounded-full bg-fg/50"
                                            style={{
                                                left: `${medPct.toFixed(1)}%`,
                                            }}
                                        />
                                    </div>
                                    <div className="text-right font-mono text-xs text-fg">
                                        {formatFeature(k, v)}
                                    </div>
                                </div>
                            );
                        })}
                        <MicroLabel className="mt-2 mb-4 block normal-case">
                            {t("p1.legend")}
                        </MicroLabel>

                        <div className="grid grid-cols-2 gap-2.5">
                            <button
                                type="button"
                                onClick={() => setLabel(1)}
                                className={`flex items-center gap-2.5 rounded-md border px-4 py-3.5 text-sm font-semibold transition-colors ${
                                    curLab === 1
                                        ? "border-accent3 bg-accent3/10 text-accent3"
                                        : "border-border bg-panel text-muted hover:text-fg"
                                }`}
                            >
                                <span className="h-2.5 w-2.5 rounded-full bg-accent3" />
                                <span className="flex-1 text-left">
                                    {t("p1.label.owl")}
                                </span>
                                {store.keyHints && <Kbd>A</Kbd>}
                            </button>
                            <button
                                type="button"
                                onClick={() => setLabel(0)}
                                className={`flex items-center gap-2.5 rounded-md border px-4 py-3.5 text-sm font-semibold transition-colors ${
                                    curLab === 0
                                        ? "border-accent2 bg-accent2/10 text-accent2"
                                        : "border-border bg-panel text-muted hover:text-fg"
                                }`}
                            >
                                <span className="h-2.5 w-2.5 rounded-full bg-accent2" />
                                <span className="flex-1 text-left">
                                    {t("p1.label.early")}
                                </span>
                                {store.keyHints && <Kbd>B</Kbd>}
                            </button>
                        </div>

                        <div className="mt-3 flex justify-between">
                            <GhostButton onClick={() => moveCard(-1)}>
                                {t("p1.deck.prev")}
                            </GhostButton>
                            <GhostButton onClick={() => moveCard(1)}>
                                {t("p1.deck.skip")}
                            </GhostButton>
                        </div>
                    </Island>

                    <div className="mt-3.5 flex justify-center">
                        <button
                            type="button"
                            onClick={() => patch("p1", { mode: "review" })}
                            className="rounded-md px-3.5 py-2 text-sm font-semibold text-accent transition-all hover:brightness-110"
                        >
                            {full
                                ? t("p1.review.enterSubmit")
                                : t("p1.review.enter")}
                        </button>
                    </div>
                </>
            ) : (
                <Island className="px-6 py-5 motion-safe:animate-pop-in">
                    <div className="mb-3.5 flex items-center justify-between">
                        <span className="font-display text-sm font-bold text-fg">
                            {t("p1.review.title", { n })}
                        </span>
                        <GhostButton
                            className="text-xs font-semibold"
                            onClick={() => patch("p1", { mode: "deck" })}
                        >
                            {t("p1.review.back")}
                        </GhostButton>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {order.map((r, i) => {
                            const lab = s.labels[r.id];
                            return (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() =>
                                        patch("p1", { mode: "deck", idx: i })
                                    }
                                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                                        lab === 1
                                            ? "bg-accent3/10 text-accent3"
                                            : lab === 0
                                              ? "bg-accent2/10 text-accent2"
                                              : "border border-dashed border-border text-muted"
                                    }`}
                                >
                                    {r.pseudo}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-4 flex items-center gap-3 border-t border-border/40 pt-4">
                        <span className="font-mono text-xs text-muted">
                            {t("p1.progress.marked", { done, n })}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-accent uppercase">
                            {t("p1.review.attempt", {
                                attempt: String(s.attempt).padStart(2, "0"),
                                cap: String(cap).padStart(2, "0"),
                            })}
                        </span>
                        <div className="flex-1" />
                        <PrimaryButton
                            onClick={submit}
                            disabled={!full || left <= 0 || submitting}
                            className="py-3"
                        >
                            {submitting
                                ? t("p1.submit.submitting")
                                : left <= 0
                                  ? t("p1.submit.noAttempts")
                                  : full
                                    ? t("p1.submit.go")
                                    : t("p1.submit.labelFirst", { n })}
                        </PrimaryButton>
                    </div>
                </Island>
            )}
        </div>
    );
}

/** median of a survey feature across the loaded rows (the deck bar tick).
    Handles any row count — even/odd — not just the old fixed 48. */
function realMedian(k: FeatureKey, rows: RealRow[]): number {
    if (!rows.length) return 0;
    const vs = rows.map((r) => r.feats[k]).sort((a, b) => a - b);
    const m = Math.floor(vs.length / 2);
    return vs.length % 2 ? vs[m] : (vs[m - 1] + vs[m]) / 2;
}
