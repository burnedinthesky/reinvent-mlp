/* Scores — the per-student score table (admin console). For a chosen phase it
   lists every squad member's best attempt (max ACC / min LOSS) plus attempt
   count, with a no-score row for those who haven't submitted. Sortable by
   score/group/name and filterable by squad, so operators can rank a phase or
   spot who's missing. Values come live from adminPhaseScoresFn. */

import { useEffect, useMemo, useState } from "react";

import {
    GhostButton,
    Island,
    MicroLabel,
    PrimaryButton,
    Select,
    StatCard,
} from "#/components/workshop/ui";
import { useI18n } from "#/lib/i18n/context";
import { PHASES, TEAM_LABELS } from "#/lib/workshop/constants";
import type {
    AdminService,
    PhaseScores,
    PhaseScoreRow,
} from "#/lib/workshop/admin-service";
import type { Phase } from "#/lib/workshop/types";

/* NONE has no submissions; every other room phase is selectable. */
const SCORE_PHASES = PHASES.filter((p) => p !== "NONE");

type SortKey = "score" | "group" | "name";
type SortDir = "asc" | "desc";

export function ScoresSection({ service }: { service: AdminService }) {
    const { t } = useI18n();
    const [phase, setPhase] = useState<Phase | null>(null);
    const [data, setData] = useState<PhaseScores | null>(null);
    const [loading, setLoading] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>("score");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [groupFilter, setGroupFilter] = useState<number | "all">("all");
    const [dumping, setDumping] = useState(false);
    // how many attempts each per-row grant button hands out; the student's cap for
    // this phase rises by it and their submit button re-opens within one poll.
    const [grantAmount, setGrantAmount] = useState(3);
    const [granting, setGranting] = useState<string | null>(null);

    const grant = async (studentId: string) => {
        if (!phase || grantAmount === 0) return;
        setGranting(studentId);
        try {
            await service.grantAttempts(studentId, phase, grantAmount);
            setData(await service.getPhaseScores(phase));
        } finally {
            setGranting(null);
        }
    };

    // full raw export for post-camp analysis (state + dataset + stats + raw rows).
    const download = async () => {
        setDumping(true);
        const dump = await service.dump();
        const blob = new Blob([JSON.stringify(dump, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mlp-dump-${dump.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setDumping(false);
    };

    // default the picker to the live room phase (fall back to P1 when NONE).
    useEffect(() => {
        service
            .getState()
            .then((s) => setPhase(s.phase === "NONE" ? "P1" : s.phase));
    }, [service]);

    useEffect(() => {
        if (!phase) return;
        let alive = true;
        setLoading(true);
        service.getPhaseScores(phase).then((d) => {
            if (alive) {
                setData(d);
                setLoading(false);
            }
        });
        return () => {
            alive = false;
        };
    }, [service, phase]);

    const rows = useMemo(() => {
        if (!data) return [];
        const isAcc = data.metric === "acc";
        const filtered =
            groupFilter === "all"
                ? data.rows
                : data.rows.filter((r) => r.team === groupFilter);
        const dir = sortDir === "asc" ? 1 : -1;
        return [...filtered].sort((a, b) => {
            if (sortKey === "name")
                return dir * a.nickname.localeCompare(b.nickname);
            if (sortKey === "group") {
                // unsquaded (team null) always sort last; then by team, then name.
                const ta = a.team ?? Infinity;
                const tb = b.team ?? Infinity;
                return dir * (ta - tb) || a.nickname.localeCompare(b.nickname);
            }
            // score: no-score rows always sink to the bottom regardless of direction.
            if (a.score == null || b.score == null) {
                if (a.score == null && b.score == null)
                    return a.nickname.localeCompare(b.nickname);
                return a.score == null ? 1 : -1;
            }
            return dir * (a.score - b.score) * (isAcc ? 1 : -1);
        });
    }, [data, sortKey, sortDir, groupFilter]);

    const fmt = (v: number | null) =>
        v == null ? "—" : data?.metric === "acc" ? `${v}%` : v.toFixed(3);

    // P4 splits into two loss columns (Foothill = score, Range = score2).
    const isP4 = data?.phase === "P4";

    // KPIs over the CURRENT filtered view.
    const scored = rows.filter((r) => r.score != null) as (PhaseScoreRow & {
        score: number;
    })[];
    const best =
        scored.length && data
            ? scored.reduce(
                  (acc, r) =>
                      data.metric === "acc"
                          ? Math.max(acc, r.score)
                          : Math.min(acc, r.score),
                  data.metric === "acc" ? -Infinity : Infinity
              )
            : null;

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else {
            setSortKey(key);
            // sensible default direction per column: best-first for score, A→Z otherwise.
            setSortDir(key === "score" ? "desc" : "asc");
        }
    };
    const arrow = (key: SortKey) =>
        sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

    return (
        <div className="space-y-5">
            <div>
                <MicroLabel accent>{t("admin.scores.eyebrow")}</MicroLabel>
                <h2 className="mt-1 font-display text-xl font-semibold text-fg">
                    {t("admin.scores.title")}
                </h2>
                <p className="text-sm text-muted">
                    {t("admin.scores.body")}
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                    <MicroLabel>{t("admin.scores.phase")}</MicroLabel>
                    <Select
                        value={phase ?? ""}
                        onChange={(e) => setPhase(e.target.value as Phase)}
                        aria-label={t("admin.scores.phase")}
                    >
                        {SCORE_PHASES.map((p) => (
                            <option key={p} value={p}>
                                {p}
                            </option>
                        ))}
                    </Select>
                </label>
                <label className="flex flex-col gap-1">
                    <MicroLabel>{t("admin.scores.group")}</MicroLabel>
                    <Select
                        value={groupFilter}
                        onChange={(e) =>
                            setGroupFilter(
                                e.target.value === "all"
                                    ? "all"
                                    : Number(e.target.value)
                            )
                        }
                        aria-label={t("admin.scores.groupFilter")}
                    >
                        <option value="all">{t("admin.scores.allSquads")}</option>
                        {TEAM_LABELS.map((label, i) => (
                            <option key={i} value={i + 1}>
                                {label}
                            </option>
                        ))}
                    </Select>
                </label>
                <label className="flex flex-col gap-1">
                    <MicroLabel>{t("admin.scores.grant")}</MicroLabel>
                    <input
                        type="number"
                        min={1}
                        value={grantAmount}
                        onChange={(e) =>
                            setGrantAmount(
                                Math.max(0, Math.floor(Number(e.target.value)))
                            )
                        }
                        aria-label={t("admin.scores.grantAria")}
                        className="w-20 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg outline-none focus:border-accent"
                    />
                </label>
                {data && (
                    <span className="ml-auto font-mono text-[11px] text-muted">
                        {data.metric === "acc"
                            ? t("admin.scores.metric.acc")
                            : t("admin.scores.metric.loss")}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
                <StatCard
                    label={t("admin.scores.kpi.shown")}
                    value={rows.length}
                    accent
                />
                <StatCard
                    label={t("admin.scores.kpi.submitted")}
                    value={scored.length}
                />
                <StatCard
                    label={t("admin.scores.kpi.best")}
                    value={best == null ? "—" : fmt(best)}
                />
            </div>

            <Island className="p-0">
                {loading && !data ? (
                    <div className="p-5 text-sm text-muted">
                        {t("admin.scores.loading")}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-5 text-sm text-muted">
                        {t("admin.scores.noStudents")}
                    </div>
                ) : (
                    <div className="max-h-[480px] overflow-auto rounded-md">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-panel">
                                <tr className="text-[11px] tracking-wide text-muted uppercase">
                                    <Th
                                        onClick={() => toggleSort("name")}
                                        className="pl-4"
                                    >
                                        {t("admin.scores.col.student")}
                                        {arrow("name")}
                                    </Th>
                                    <Th onClick={() => toggleSort("group")}>
                                        {t("admin.scores.col.group")}
                                        {arrow("group")}
                                    </Th>
                                    <th className="px-3 py-2.5 text-right font-medium">
                                        {t("admin.scores.col.attempts")}
                                    </th>
                                    <Th
                                        onClick={() => toggleSort("score")}
                                        className={
                                            isP4
                                                ? "text-right"
                                                : "pr-4 text-right"
                                        }
                                    >
                                        {isP4
                                            ? t("admin.scores.col.foothill")
                                            : t("admin.scores.col.score")}
                                        {arrow("score")}
                                    </Th>
                                    {isP4 && (
                                        <th className="px-3 py-2.5 text-right font-medium">
                                            {t("admin.scores.col.range")}
                                        </th>
                                    )}
                                    <th className="px-3 py-2.5 pr-4 text-right font-medium">
                                        {t("admin.scores.col.grant")}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50 font-mono">
                                {rows.map((r) => (
                                    <tr
                                        key={r.studentId}
                                        className="hover:bg-panel/40"
                                    >
                                        <td className="max-w-[16rem] truncate py-2 pl-4 text-fg">
                                            {r.nickname}
                                        </td>
                                        <td className="px-3 py-2 text-muted">
                                            {r.teamLabel}
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted">
                                            {r.attempts}
                                            {r.bonus > 0 && (
                                                <span
                                                    className="ml-1 text-accent"
                                                    title={t(
                                                        "admin.scores.grantedTitle",
                                                        { bonus: r.bonus }
                                                    )}
                                                >
                                                    +{r.bonus}
                                                </span>
                                            )}
                                        </td>
                                        <td
                                            className={`py-2 text-right ${isP4 ? "px-3" : "pr-4"} ${
                                                r.score == null
                                                    ? "text-muted/50"
                                                    : "text-accent"
                                            }`}
                                        >
                                            {fmt(r.score)}
                                        </td>
                                        {isP4 && (
                                            <td
                                                className={`py-2 px-3 text-right ${
                                                    r.score2 == null
                                                        ? "text-muted/50"
                                                        : "text-accent"
                                                }`}
                                            >
                                                {fmt(r.score2)}
                                            </td>
                                        )}
                                        <td className="py-2 pr-4 text-right">
                                            <GhostButton
                                                bordered
                                                disabled={
                                                    granting === r.studentId ||
                                                    grantAmount === 0
                                                }
                                                onClick={() =>
                                                    grant(r.studentId)
                                                }
                                                className="font-mono text-xs"
                                            >
                                                {granting === r.studentId
                                                    ? "…"
                                                    : `+${grantAmount}`}
                                            </GhostButton>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Island>

            <Island className="flex items-center justify-between p-5">
                <div>
                    <div className="font-display text-base font-semibold text-fg">
                        {t("admin.scores.dump.title")}
                    </div>
                    <p className="text-xs text-muted">
                        {t("admin.scores.dump.body")}
                    </p>
                </div>
                <PrimaryButton onClick={download} disabled={dumping}>
                    {dumping
                        ? t("admin.scores.dump.preparing")
                        : t("admin.scores.dump.download")}
                </PrimaryButton>
            </Island>
        </div>
    );
}

/** A clickable, sortable column header cell. */
function Th({
    children,
    onClick,
    className = "",
}: {
    children: React.ReactNode;
    onClick: () => void;
    className?: string;
}) {
    return (
        <th className={`px-3 py-2.5 font-medium ${className}`}>
            <button
                type="button"
                onClick={onClick}
                className="uppercase transition-colors hover:text-fg"
            >
                {children}
            </button>
        </th>
    );
}
