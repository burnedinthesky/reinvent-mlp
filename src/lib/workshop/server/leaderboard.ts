/* Leaderboard aggregation. Two currencies, never mixed (§0.3):
     ACC  — best judged accuracy over the full point set (phases P1, P2, P5).
     LOSS — best smooth loss on the visible set (phases P3, P4, and the uni-tier
            API channel).
   Best-per-student, ranked, with a phase/flag tag and a ▲▼· move indicator vs a
   periodically-refreshed rank snapshot. 48 students → trivially done in JS.
   Server-only. */

import { prisma } from "#/lib/prisma";
import {
    ACC_PHASES,
    LOSS_PHASES,
    P2_LINE_FLAG,
    P3_PLANE_FLAG,
    SCORED_STAGES,
    STAGE_META,
    teamLabel,
    teamOfNickname,
} from "../constants";
import { bonusesForPhase } from "./persist";
import type {
    Board,
    LeaderboardResult,
    LeaderboardRow,
    Phase,
    PhaseScoreRow,
    PhaseScores,
    PhaseTeamBoard,
    TeamBoardRow,
} from "../types";
import { getServerState } from "./state";
import { getWhitelist } from "./whitelist";

const TOP_N = 10;
const SNAPSHOT_MS = 4000;

interface Best {
    studentId: string;
    name: string;
    value: number;
    tag: string;
}

/** previous-rank snapshots for the move indicator, refreshed at most every 4s. */
const snapshots: Record<Board, { at: number; ranks: Map<string, number> }> = {
    ACC: { at: 0, ranks: new Map() },
    LOSS: { at: 0, ranks: new Map() },
};

async function bestPerStudent(board: Board): Promise<Best[]> {
    const phases = board === "ACC" ? ACC_PHASES : LOSS_PHASES;
    const rows = await prisma.submission.findMany({
        where: { phase: { in: phases } },
        include: { student: { select: { nickname: true } } },
    });

    const byStudent = new Map<string, Best>();
    const better = (a: number, b: number) => (board === "ACC" ? a > b : a < b);
    for (const r of rows) {
        const cur = byStudent.get(r.studentId);
        if (!cur || better(r.score, cur.value)) {
            byStudent.set(r.studentId, {
                studentId: r.studentId,
                name: r.student.nickname,
                value: r.score,
                // P4 rows carry a stage flag (mlp_a/mlp_b) — surface a stable 'P4' tag.
                tag: r.phase === "P4" ? "P4" : (r.flag ?? r.phase),
            });
        }
    }

    const arr = [...byStudent.values()];
    arr.sort((a, b) =>
        board === "ACC" ? b.value - a.value : a.value - b.value
    );
    return arr;
}

export async function getLeaderboard(
    board: Board,
    meId: string | null
): Promise<LeaderboardResult> {
    const ranked = await bestPerStudent(board);

    const snap = snapshots[board];
    const now = Date.now();
    const prev = snap.ranks;

    const rows: LeaderboardRow[] = ranked.slice(0, TOP_N).map((b, i) => {
        const rank = i + 1;
        const before = prev.get(b.studentId);
        const move = before == null ? 0 : Math.sign(before - rank);
        return { rank, name: b.name, value: b.value, tag: b.tag, move };
    });

    // refresh the snapshot occasionally so ▲▼ reflects change over a few seconds,
    // not per-request churn.
    if (now - snap.at > SNAPSHOT_MS) {
        const next = new Map<string, number>();
        ranked.forEach((b, i) => next.set(b.studentId, i + 1));
        snap.ranks = next;
        snap.at = now;
    }

    let me: { rank: number; value: number } | null = null;
    if (meId) {
        const idx = ranked.findIndex((b) => b.studentId === meId);
        if (idx >= 0) me = { rank: idx + 1, value: ranked[idx].value };
    }

    return { board, top: rows, me };
}

/* ------------------------------------------------ per-phase team board */

/** Team board(s) for the CURRENTLY-SELECTED room phase. A team's value is the
    average, over the players who submitted, of each player's best attempt (max
    for ACC, min for LOSS) — non-submitters do NOT drag the average. Every squad
    on the roster is still shown; a squad with no scorers has a null value
    (rendered as '—'). `submitted`/`members` expose the participation. Values are
    grouped straight off the submissions by teamOfNickname(), so they never depend
    on roster-key string matching. The roster (whitelist when configured, else
    joined students) only determines the `members` count and which empty squads to
    list.

    Returns an ARRAY: normally one board, but P4 splits into TWO per-stage boards
    (Foothill / Range) selected by the submission's stage `flag`. Empty array when
    the room phase is 'NONE'. Server-only. */
export async function getTeamPhaseBoards(): Promise<PhaseTeamBoard[]> {
    const [state, whitelist, students, subs] = await Promise.all([
        getServerState(),
        getWhitelist(),
        prisma.student.findMany({ select: { id: true, nickname: true } }),
        prisma.submission.findMany({
            select: { studentId: true, phase: true, score: true, flag: true },
        }),
    ]);

    const phase = state.phase;
    if (phase === "NONE") return [];
    const metric: "acc" | "loss" = ACC_PHASES.includes(phase) ? "acc" : "loss";
    const isAcc = metric === "acc";

    const nickById = new Map(students.map((s) => [s.id, s.nickname] as const));

    // Roster size per team for the X/Y display: the whitelist when configured, else
    // the joined students. Empty squads are still listed (value stays null below).
    const rosterSize = new Map<number, number>();
    if (whitelist.enabled && whitelist.entries.length > 0) {
        for (const e of whitelist.entries)
            rosterSize.set(e.team, (rosterSize.get(e.team) ?? 0) + 1);
    } else {
        for (const s of students) {
            const t = teamOfNickname(s.nickname);
            if (t != null) rosterSize.set(t, (rosterSize.get(t) ?? 0) + 1);
        }
    }

    // Fold one set of this-phase submissions into ranked per-team rows.
    const buildRows = (
        rows: { studentId: string; score: number }[]
    ): TeamBoardRow[] => {
        // best submission per student (max ACC, min LOSS).
        const bestById = new Map<string, number>();
        for (const r of rows) {
            const cur = bestById.get(r.studentId);
            if (cur == null || (isAcc ? r.score > cur : r.score < cur))
                bestById.set(r.studentId, r.score);
        }
        // fold each submitter's best into their team (recovered from the nickname),
        // accumulating sum + count so value = mean over submitters.
        const agg = new Map<number, { sum: number; submitted: number }>();
        for (const [studentId, best] of bestById) {
            const nick = nickById.get(studentId);
            const team = nick ? teamOfNickname(nick) : null;
            if (team == null) continue;
            const a = agg.get(team) ?? { sum: 0, submitted: 0 };
            a.sum += best;
            a.submitted++;
            agg.set(team, a);
        }
        // union of rostered squads and any squad with a submitter.
        const teams = new Set<number>([...rosterSize.keys(), ...agg.keys()]);
        const out: TeamBoardRow[] = [];
        for (const team of teams) {
            const a = agg.get(team);
            const submitted = a?.submitted ?? 0;
            out.push({
                rank: 0,
                team,
                teamLabel: teamLabel(team),
                value: submitted > 0 ? a!.sum / submitted : null,
                submitted,
                members: Math.max(rosterSize.get(team) ?? 0, submitted),
            });
        }
        // rank by value (ACC desc / LOSS asc); squads with no submitters sort last.
        out.sort((x, y) => {
            if (x.value == null || y.value == null) {
                if (x.value == null && y.value == null) return x.team - y.team;
                return x.value == null ? 1 : -1;
            }
            return (
                (isAcc ? y.value - x.value : x.value - y.value) ||
                x.team - y.team
            );
        });
        out.forEach((r, i) => (r.rank = i + 1));
        return out;
    };

    const phaseSubs = subs.filter((r) => r.phase === phase);
    const board = (
        label: string | undefined,
        rows: typeof phaseSubs
    ): PhaseTeamBoard => ({
        phase,
        label,
        metric,
        rows: buildRows(rows),
        deadline: state.deadline,
    });

    // P4 always splits into two per-stage boards keyed by the submission's stage flag.
    if (phase === "P4") {
        return SCORED_STAGES.map((stage) => {
            const meta = STAGE_META[stage];
            const tier = meta.tier[0].toUpperCase() + meta.tier.slice(1);
            return board(
                `${meta.label} · ${tier}`,
                phaseSubs.filter((r) => r.flag === stage)
            );
        });
    }

    // P2/P3 grow a SECOND board only once the operator reveals the advanced mode,
    // splitting by the mode flag written at submit time (base-mode and pre-flag rows
    // land on the first board). Without the reveal they stay one combined board.
    if (phase === "P2" && state.reveals.p2_line_mode) {
        return [
            board(
                "套索模式",
                phaseSubs.filter((r) => r.flag !== P2_LINE_FLAG)
            ),
            board(
                "直線模式",
                phaseSubs.filter((r) => r.flag === P2_LINE_FLAG)
            ),
        ];
    }
    if (phase === "P3" && state.reveals.p3_wb_plane) {
        return [
            board(
                "僅斜率 w",
                phaseSubs.filter((r) => r.flag !== P3_PLANE_FLAG)
            ),
            board(
                "w + b 平面",
                phaseSubs.filter((r) => r.flag === P3_PLANE_FLAG)
            ),
        ];
    }

    return [board(undefined, phaseSubs)];
}

/* ---------------------------------------------- per-student phase scores */

/** Full-roster per-student score table for one phase (admin console Scores
    section). Each row is a student's BEST attempt for `phase` (max for ACC, min
    for LOSS) plus its `score2` and an attempt count; non-submitting squad members
    appear with `score: null, attempts: 0` so operators can spot who hasn't
    played. A row is included when the student belongs to a squad (recognizable
    小隊 prefix) OR has at least one submission — so unsquaded joiners/house bots
    only surface in phases they actually submitted, never as no-score noise. Rows
    are unsorted; the console sorts/filters client-side. Server-only. */
export async function getPhaseScores(phase: Phase): Promise<PhaseScores> {
    const metric: "acc" | "loss" = ACC_PHASES.includes(phase) ? "acc" : "loss";
    const isAcc = metric === "acc";

    const [students, subs, bonuses] = await Promise.all([
        prisma.student.findMany({ select: { id: true, nickname: true } }),
        prisma.submission.findMany({
            where: { phase },
            select: { studentId: true, score: true, score2: true, flag: true },
        }),
        bonusesForPhase(phase),
    ]);

    // best attempt per student (carrying its score2), plus an attempt count.
    interface Agg {
        best: number | null;
        score2: number | null;
        attempts: number;
    }
    const agg = new Map<string, Agg>();
    if (phase === "P4") {
        // P4 splits by stage flag: `score` = best (lowest) Foothill (mlp_a) loss,
        // `score2` = best Range (mlp_b) loss; `attempts` counts both surfaces (the
        // shared budget). A student who played only one surface leaves the other null.
        for (const r of subs) {
            const cur = agg.get(r.studentId) ?? {
                best: null,
                score2: null,
                attempts: 0,
            };
            cur.attempts++;
            if (r.flag === "mlp_a")
                cur.best =
                    cur.best == null ? r.score : Math.min(cur.best, r.score);
            else if (r.flag === "mlp_b")
                cur.score2 =
                    cur.score2 == null
                        ? r.score
                        : Math.min(cur.score2, r.score);
            agg.set(r.studentId, cur);
        }
    } else {
        for (const r of subs) {
            const cur = agg.get(r.studentId);
            if (!cur) {
                agg.set(r.studentId, {
                    best: r.score,
                    score2: r.score2,
                    attempts: 1,
                });
            } else {
                cur.attempts++;
                if (
                    isAcc
                        ? r.score > (cur.best as number)
                        : r.score < (cur.best as number)
                ) {
                    cur.best = r.score;
                    cur.score2 = r.score2;
                }
            }
        }
    }

    const rows: PhaseScoreRow[] = [];
    for (const s of students) {
        const a = agg.get(s.id);
        const team = teamOfNickname(s.nickname);
        // squad members always show (no-score included); unsquaded students only when
        // they actually submitted this phase.
        if (team == null && !a) continue;
        rows.push({
            studentId: s.id,
            nickname: s.nickname,
            team,
            teamLabel: team == null ? "—" : teamLabel(team),
            score: a ? a.best : null,
            score2: a ? a.score2 : null,
            attempts: a ? a.attempts : 0,
            bonus: bonuses.get(s.id) ?? 0,
        });
    }

    return { phase, metric, rows };
}
