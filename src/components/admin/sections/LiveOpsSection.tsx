/* Live Ops — the camp-day "theater" (spec §5.4, §3.2): set the phase, flip the
   reveal flags, arm/clear the countdown. Every action writes ServerState, which
   students poll. Bubbles the new state up so the StatusStrip mirror stays live. */

import { useState } from "react";
import { GhostButton, Island, MicroLabel } from "#/components/workshop/ui";
import { Toggle } from "../ui";
import { useI18n } from "#/lib/i18n/context";
import { PHASES, REVEAL_META } from "#/lib/workshop/admin-service";
import type { AdminService, RevealKey } from "#/lib/workshop/admin-service";
import type { Phase, ServerState } from "#/lib/workshop/types";

export function LiveOpsSection({
    service,
    state,
    onState,
}: {
    service: AdminService;
    state: ServerState | null;
    onState: (s: ServerState) => void;
}) {
    const { t } = useI18n();
    const [minutes, setMinutes] = useState(10);

    if (!state)
        return (
            <div className="text-sm text-muted">{t("admin.scores.loading")}</div>
        );

    const setPhase = (p: Phase) => service.setPhase(p).then(onState);
    const setSelfSelect = (v: boolean) =>
        service.setSelfSelect(v).then(onState);
    const setReveal = (k: RevealKey, v: boolean) =>
        service.setReveal(k, v).then(onState);
    const armDeadline = (min: number) =>
        service
            .setDeadline(new Date(Date.now() + min * 60_000).toISOString())
            .then(onState);
    const clearDeadline = () => service.setDeadline(null).then(onState);

    return (
        <div className="space-y-5">
            <Head />

            <Island className="p-5">
                <div className="flex items-center justify-between gap-3">
                    <MicroLabel>{t("admin.liveops.currentPhase")}</MicroLabel>
                    <a
                        href="/room?preview"
                        target="_blank"
                        rel="noreferrer"
                        title={t("admin.liveops.previewTitle")}
                        className="font-mono text-[11px] text-muted underline decoration-border underline-offset-4 transition-colors hover:text-accent"
                    >
                        {t("admin.liveops.preview")}
                    </a>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {PHASES.map((p) => {
                        const on = state.phase === p;
                        return (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setPhase(p)}
                                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                                    on
                                        ? "border-accent bg-accent text-accent-fg"
                                        : "border-border text-muted hover:text-fg"
                                }`}
                            >
                                <span className="font-semibold">{p}</span>
                                <span
                                    className={
                                        on
                                            ? "text-accent-fg/80"
                                            : "text-muted/70"
                                    }
                                >
                                    {t(`admin.liveops.phase.${p}`)}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/60 pt-4">
                    <div>
                        <div className="font-mono text-sm text-fg">
                            {t("admin.liveops.selfSelect")}
                        </div>
                        <div className="text-xs text-muted">
                            {t("admin.liveops.selfSelect.body")}
                        </div>
                    </div>
                    <Toggle
                        checked={state.selfSelect}
                        onChange={setSelfSelect}
                        ariaLabel={t("admin.liveops.selfSelect")}
                    />
                </div>
            </Island>

            {state.selfSelect ? (
                <Island className="p-5">
                    <MicroLabel>{t("admin.liveops.reveals")}</MicroLabel>
                    <p className="mt-1 text-xs text-muted">
                        {t("admin.liveops.reveals.selfSelectOn")}
                    </p>
                </Island>
            ) : (
                <Island className="p-5">
                    <MicroLabel>{t("admin.liveops.reveals")}</MicroLabel>
                    <p className="mt-1 mb-3 text-xs text-muted">
                        {t("admin.liveops.reveals.body")}
                    </p>
                    <div className="divide-y divide-border/60">
                        {REVEAL_META.map((r) => (
                            <div
                                key={r.key}
                                className="flex items-center justify-between gap-4 py-3"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-muted">
                                            {r.phase}
                                        </span>
                                        <span className="font-mono text-sm text-fg">
                                            {r.name}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-xs text-muted">
                                        {t(`reveals.${r.key}.caption`)}
                                    </div>
                                </div>
                                <Toggle
                                    checked={state.reveals[r.key]}
                                    onChange={(v) => setReveal(r.key, v)}
                                    ariaLabel={r.name}
                                />
                            </div>
                        ))}
                    </div>
                </Island>
            )}

            <Island className="p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <MicroLabel>{t("admin.liveops.countdown")}</MicroLabel>
                        <p className="mt-1 text-xs text-muted">
                            {state.deadline
                                ? t("admin.liveops.countdown.ends", {
                                      time: new Date(
                                          state.deadline
                                      ).toLocaleTimeString(),
                                  })
                                : t("admin.liveops.countdown.none")}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={1}
                            value={minutes}
                            onChange={(e) => setMinutes(Number(e.target.value))}
                            aria-label={t("admin.liveops.countdown.minutes")}
                            className="w-20 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg outline-none focus:border-accent"
                        />
                        <span className="font-mono text-xs text-muted">
                            {t("admin.liveops.countdown.min")}
                        </span>
                        <GhostButton
                            bordered
                            onClick={() => armDeadline(minutes)}
                            className={
                                minutes >= 1
                                    ? ""
                                    : "pointer-events-none opacity-40"
                            }
                        >
                            {t("admin.liveops.countdown.arm")}
                        </GhostButton>
                        <GhostButton
                            onClick={clearDeadline}
                            className="text-warning hover:text-warning"
                        >
                            {t("admin.liveops.countdown.clear")}
                        </GhostButton>
                    </div>
                </div>
            </Island>
        </div>
    );
}

function Head() {
    const { t } = useI18n();
    return (
        <div>
            <MicroLabel accent>{t("admin.liveops.eyebrow")}</MicroLabel>
            <h2 className="mt-1 font-display text-xl font-semibold text-fg">
                {t("admin.liveops.title")}
            </h2>
            <p className="text-sm text-muted">{t("admin.liveops.body")}</p>
        </div>
    );
}
