/* The always-on status strip: a live mirror of ServerState (the single source of
   truth students poll) plus the active-dataset badge. Reveal flags render as
   lit/unlit chips so the operator can see the "theater" state at a glance. */

import { useEffect, useState } from "react";

import { MicroLabel } from "#/components/workshop/ui";
import { REVEAL_META } from "#/lib/workshop/admin-service";
import type { DatasetInfo } from "#/lib/workshop/admin-service";
import type { ServerState } from "#/lib/workshop/types";

function useCountdown(deadline: string | null): number | null {
    const [, setNow] = useState(0);
    useEffect(() => {
        if (!deadline) return;
        const id = setInterval(() => setNow((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, [deadline]);
    if (!deadline) return null;
    const secs = Math.max(
        0,
        Math.round((new Date(deadline).getTime() - Date.now()) / 1000)
    );
    return secs;
}

export function StatusStrip({
    state,
    dataset,
}: {
    state: ServerState | null;
    dataset: DatasetInfo | null;
}) {
    const secs = useCountdown(state?.deadline ?? null);

    return (
        <header className="z-20 flex h-12 shrink-0 items-center gap-4 border-b border-border bg-panel px-4">
            <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-bg font-display text-[13px] font-bold text-fg">
                    M
                </div>
                <MicroLabel accent className="tracking-[.14em]">
                    Admin
                </MicroLabel>
            </div>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-1.5">
                <MicroLabel>Phase</MicroLabel>
                <span className="rounded-full bg-accent px-2.5 py-0.5 font-mono text-[11px] font-semibold text-accent-fg">
                    {state?.phase ?? "—"}
                </span>
            </div>

            <div className="flex items-center gap-1.5">
                <MicroLabel>Timer</MicroLabel>
                <span
                    className={`font-mono text-sm font-semibold ${
                        secs !== null && secs <= 60 ? "text-warning" : "text-fg"
                    }`}
                >
                    {secs === null
                        ? "—"
                        : `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`}
                </span>
            </div>

            <div className="hidden items-center gap-1.5 lg:flex">
                {REVEAL_META.map((r) => {
                    const on = state?.reveals[r.key] ?? false;
                    return (
                        <span
                            key={r.key}
                            title={r.caption}
                            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase ${
                                on
                                    ? "border-accent/50 bg-accent/10 text-accent"
                                    : "border-border text-muted/60"
                            }`}
                        >
                            {r.name}
                        </span>
                    );
                })}
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
                <MicroLabel>Dataset</MicroLabel>
                {dataset ? (
                    <div className="flex items-center gap-2">
                        <span className="rounded-full border border-positive/50 bg-positive/10 px-2 py-0.5 font-mono text-[10px] tracking-wide text-positive uppercase">
                            live
                        </span>
                        <span className="font-mono text-[11px] text-muted">
                            <span className="text-fg">{dataset.name}</span>
                            <span className="text-muted/60">
                                {" "}
                                v{dataset.version}
                            </span>
                            {" · "}
                            {dataset.label}
                            {" · "}
                            {dataset.counts.real}+{dataset.counts.reveal}+
                            {dataset.counts.hidden}
                        </span>
                    </div>
                ) : (
                    <span className="font-mono text-[11px] text-muted/60">
                        none
                    </span>
                )}
            </div>
        </header>
    );
}
