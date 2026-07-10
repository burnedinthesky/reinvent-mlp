/* Live Ops — the camp-day "theater" (spec §5.4, §3.2): set the phase, flip the
   reveal flags, arm/clear the countdown. Every action writes ServerState, which
   students poll. Bubbles the new state up so the StatusStrip mirror stays live. */

import { useState } from "react";
import { GhostButton, Island, MicroLabel } from "#/components/workshop/ui";
import { Toggle } from "../ui";
import { PHASES, REVEAL_META } from "#/lib/workshop/admin-service";
import type { AdminService, RevealKey } from "#/lib/workshop/admin-service";
import type { Phase, ServerState } from "#/lib/workshop/types";

const PHASE_NAMES: Record<Phase, string> = {
    P1: "Guess the Class",
    P2: "Circles",
    P3: "Fog",
    P4: "Bots",
    P5: "Neuron",
    P6: "Playground",
    NONE: "Nothing",
};

export function LiveOpsSection({
    service,
    state,
    onState,
}: {
    service: AdminService;
    state: ServerState | null;
    onState: (s: ServerState) => void;
}) {
    const [minutes, setMinutes] = useState(10);

    if (!state) return <div className="text-sm text-muted">Loading…</div>;

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
                    <MicroLabel>Current phase</MicroLabel>
                    <a
                        href="/?preview"
                        target="_blank"
                        rel="noreferrer"
                        title="Demo the student UI locally without changing the room phase"
                        className="font-mono text-[11px] text-muted underline decoration-border underline-offset-4 transition-colors hover:text-accent"
                    >
                        Open student preview ↗
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
                                    {PHASE_NAMES[p]}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/60 pt-4">
                    <div>
                        <div className="font-mono text-sm text-fg">
                            Students self-select phase
                        </div>
                        <div className="text-xs text-muted">
                            On: students roam freely. Off: every device is
                            locked to the phase above.
                        </div>
                    </div>
                    <Toggle
                        checked={state.selfSelect}
                        onChange={setSelfSelect}
                        ariaLabel="Students self-select phase"
                    />
                </div>
            </Island>

            {state.selfSelect ? (
                <Island className="p-5">
                    <MicroLabel>Reveal flags</MicroLabel>
                    <p className="mt-1 text-xs text-muted">
                        Self-select is on — each student controls their own
                        reveals from their phase menu. Turn self-select off to
                        drive reveals for the whole room.
                    </p>
                </Island>
            ) : (
                <Island className="p-5">
                    <MicroLabel>Reveal flags</MicroLabel>
                    <p className="mt-1 mb-3 text-xs text-muted">
                        Each flip animates on every student device at once.
                        Labels never ship until their flag is on.
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
                                        {r.caption}
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
                        <MicroLabel>Countdown</MicroLabel>
                        <p className="mt-1 text-xs text-muted">
                            {state.deadline
                                ? `Ends ${new Date(state.deadline).toLocaleTimeString()}`
                                : "No timer armed — submissions stay open."}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={1}
                            value={minutes}
                            onChange={(e) => setMinutes(Number(e.target.value))}
                            aria-label="Countdown minutes"
                            className="w-20 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg outline-none focus:border-accent"
                        />
                        <span className="font-mono text-xs text-muted">
                            min
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
                            Arm
                        </GhostButton>
                        <GhostButton
                            onClick={clearDeadline}
                            className="text-warning hover:text-warning"
                        >
                            Clear
                        </GhostButton>
                    </div>
                </div>
            </Island>
        </div>
    );
}

function Head() {
    return (
        <div>
            <MicroLabel accent>Live Ops</MicroLabel>
            <h2 className="mt-1 font-display text-xl font-semibold text-fg">
                Run the room
            </h2>
            <p className="text-sm text-muted">
                The single source of truth every phone polls. Drive phases,
                reveals, and the clock from here.
            </p>
        </div>
    );
}
