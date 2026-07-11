/* /leaderboard — a standalone, public, read-only page ranking the squads on the
   CURRENTLY-SELECTED room phase. Every whitelisted squad is shown whether or not
   anyone has scored; a team's value is the average over its whole roster, so a
   squad with no scorers lands on 0% (accuracy) / 100 (loss). Polls the server
   every 2 s; no token required. */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Island, MicroLabel } from "#/components/workshop/ui";
import { useI18n } from "#/lib/i18n/context";
import type { TranslateFn } from "#/lib/i18n/context";
import type { MessageKey } from "#/lib/i18n/messages";
import { LocaleProvider } from "#/lib/i18n/route";
import { teamBoardsFn } from "#/lib/workshop/fn/leaderboard";
import type { Phase, PhaseTeamBoard, TeamBoardRow } from "#/lib/workshop/types";
import { ENABLE_MULTIPLAYER } from "#/env";

export const Route = createFileRoute("/leaderboard")({
    beforeLoad: () => {
        if (!ENABLE_MULTIPLAYER) throw redirect({ to: "/" });
    },
    component: LeaderboardRouteWithLocale,
});

function LeaderboardRouteWithLocale() {
    return (
        <LocaleProvider>
            <LeaderboardRoute />
        </LocaleProvider>
    );
}

const POLL_MS = 2000;

const PHASE_NAME_KEY: Record<Phase, MessageKey> = {
    P1: "phases.P1.name",
    P2: "phases.P2.name",
    P3: "phases.P3.name",
    P4: "phases.P4.name",
    P5: "phases.P5.name",
    P6: "phases.P6.name",
    NONE: "leaderboard.phase.none",
};

/** Localized phase display name — reuses the shared phase names, with the
    leaderboard's own "standby" label for the blank stage. */
function phaseLabel(t: TranslateFn, phase: Phase): string {
    return t(PHASE_NAME_KEY[phase]);
}

const PHASE_CODE: Record<Phase, string> = {
    P1: "01",
    P2: "02",
    P3: "03",
    P4: "04",
    P5: "05",
    P6: "06",
    NONE: "∅",
};

function fmt(value: number | null, metric: "acc" | "loss"): string {
    if (value == null) return "—";
    return metric === "acc" ? `${value.toFixed(1)}%` : value.toFixed(3);
}

/** Prominent header countdown to the operator's armed deadline. Re-renders every
    second off a local tick; shows --:-- when no countdown is live. */
function Countdown({ deadline }: { deadline: string | null }) {
    const { t } = useI18n();
    const [, setNow] = useState(() => 0);
    useEffect(() => {
        if (!deadline) return;
        const id = setInterval(() => setNow((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, [deadline]);

    const secLeft = deadline
        ? Math.max(0, Math.round((Date.parse(deadline) - Date.now()) / 1000))
        : null;
    const low = secLeft !== null && secLeft <= 60;

    const label =
        secLeft === null
            ? "--:--"
            : `${String(Math.floor(secLeft / 60)).padStart(2, "0")}:${String(secLeft % 60).padStart(2, "0")}`;

    return (
        <div className="text-right">
            <MicroLabel>{t("leaderboard.timeLeft")}</MicroLabel>
            <div
                className={`font-mono text-4xl font-bold tabular-nums tracking-tight ${
                    secLeft === null
                        ? "text-muted"
                        : low
                          ? "text-warning"
                          : "text-fg"
                }`}
            >
                {label}
            </div>
        </div>
    );
}

function LeaderboardRoute() {
    const { t } = useI18n();
    // `undefined` = not loaded yet; `[]` = loaded, room on NONE (no phase). P4
    // returns two boards (Foothill / Range); every other phase returns one.
    const [boards, setBoards] = useState<PhaseTeamBoard[] | undefined>(
        undefined
    );
    const [online, setOnline] = useState(true);
    const inFlight = useRef(false);

    useEffect(() => {
        let alive = true;
        const tick = async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            try {
                const b = await teamBoardsFn();
                if (!alive) return;
                setBoards(b);
                setOnline(true);
            } catch {
                if (alive) setOnline(false);
            } finally {
                inFlight.current = false;
            }
        };
        tick();
        const id = setInterval(tick, POLL_MS);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, []);

    // header phase/countdown come off the first board (all boards share a phase).
    const head = boards && boards.length > 0 ? boards[0] : null;

    return (
        <div className="min-h-dvh bg-bg bg-[radial-gradient(1200px_600px_at_50%_-10%,#171717_0%,#0a0a0a_65%)] text-fg">
            {/* header strip */}
            <header className="flex items-center justify-between border-b border-border px-8 py-6">
                <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-panel font-display text-lg font-bold">
                        M
                    </div>
                    <div>
                        <MicroLabel accent className="tracking-[.16em]">
                            {t("leaderboard.brand")}
                        </MicroLabel>
                        <h1 className="font-display text-2xl font-bold tracking-tight">
                            {t("leaderboard.title")}
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-8">
                    {head && (
                        <div className="text-right">
                            <MicroLabel>{t("leaderboard.phase")}</MicroLabel>
                            <div className="font-display text-xl font-semibold">
                                {PHASE_CODE[head.phase]} ·{" "}
                                {phaseLabel(t, head.phase)}
                            </div>
                        </div>
                    )}
                    {head && <Countdown deadline={head.deadline} />}
                    <span
                        title={
                            online
                                ? t("leaderboard.live")
                                : t("leaderboard.reconnecting")
                        }
                        className={`h-3 w-3 rounded-full ${
                            online
                                ? "bg-positive motion-safe:animate-pulse"
                                : "bg-warning"
                        }`}
                    />
                </div>
            </header>

            <main className="p-8">
                {boards === undefined ? (
                    <div className="flex h-64 items-center justify-center text-muted">
                        {t("leaderboard.loading")}
                    </div>
                ) : boards.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted">
                        <p className="font-display text-lg text-fg">
                            {t("leaderboard.noPhase.title")}
                        </p>
                        <p className="text-sm">
                            {t("leaderboard.noPhase.body")}
                        </p>
                    </div>
                ) : boards.length === 1 ? (
                    <PhaseBoard board={boards[0]} />
                ) : (
                    // two boards share the width of one — 50/50 with a hairline gap.
                    <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2">
                        {boards.map((b) => (
                            <PhaseBoard
                                key={b.label ?? b.phase}
                                board={b}
                                fill
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

function PhaseBoard({
    board,
    fill,
}: {
    board: PhaseTeamBoard;
    fill?: boolean;
}) {
    const { t } = useI18n();
    const rows = board.rows;
    return (
        <Island
            className={`flex min-w-0 flex-col p-6 ${fill ? "w-full" : "mx-auto max-w-3xl"}`}
        >
            <div className="mb-4 flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm text-muted">
                        {PHASE_CODE[board.phase]}
                    </span>
                    <MicroLabel accent className="text-base tracking-[.12em]">
                        {board.label ?? phaseLabel(t, board.phase)}
                    </MicroLabel>
                </div>
                <span className="font-mono text-[11px] tracking-wide text-muted uppercase">
                    {board.metric === "acc"
                        ? t("leaderboard.metric.acc")
                        : t("leaderboard.metric.loss")}
                </span>
            </div>
            {rows.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted">
                    {t("leaderboard.empty")}
                </div>
            ) : (
                <ol className="space-y-1">
                    {rows.map((r) => (
                        <TeamRow key={r.team} row={r} metric={board.metric} />
                    ))}
                </ol>
            )}
        </Island>
    );
}

function TeamRow({
    row,
    metric,
}: {
    row: TeamBoardRow;
    metric: "acc" | "loss";
}) {
    const { t } = useI18n();
    return (
        <li className="flex items-center gap-4 rounded-md px-3 py-2.5 odd:bg-panel/40">
            <span
                className={`w-8 text-right font-mono text-lg font-bold ${
                    row.rank <= 3 ? "text-accent" : "text-muted"
                }`}
            >
                {row.rank}
            </span>
            <span className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
                {row.teamLabel}
            </span>
            <span
                className="font-mono text-[11px] tracking-wide text-muted"
                title={t("leaderboard.scoredTitle")}
            >
                {row.submitted}/{row.members}
            </span>
            <span
                className={`w-24 text-right font-mono text-lg font-bold tabular-nums ${
                    row.value == null ? "text-muted" : "text-fg"
                }`}
            >
                {fmt(row.value, metric)}
            </span>
        </li>
    );
}
