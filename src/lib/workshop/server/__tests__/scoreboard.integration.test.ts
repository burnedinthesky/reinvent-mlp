/* Multi-team / multi-user scoreboard integration test (real SQLite).

   Goal: prove the scoreboard aggregates correctly when MANY students across
   SEVERAL teams submit EVERY scored phase. The leaderboard + team board read
   submissions straight off Prisma (see leaderboard.ts), so we don't need the
   dataset/terrain warmup at all — we seed submissions with recordSubmission()
   using synthetic-but-known scores and assert the boards reflect them. This
   isolates scoreboard aggregation from the scoring math (which server.test.ts
   and expedition.test.ts already cover).

   Runs in a node environment (native better-sqlite3). Every student it creates
   uses a unique random name suffix and is deleted in afterAll, so it can run
   against the dev DB without leaving residue. Exact team-board assertions are
   guarded on `submitted === <seeded count>` so pre-existing rows for the same
   squad/phase (unlikely on a pre-event DB) never make the suite flaky. */

// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "#/lib/prisma";
import { ACC_PHASES, LOSS_PHASES, composeIdentity } from "../../constants";
import { join, requireStudent } from "../identity";
import { countByPhase, recordSubmission } from "../persist";
import { getLeaderboard, getTeamPhaseBoards } from "../leaderboard";
import { setPhase, setReveal } from "../state";
import { getWhitelist, setWhitelist } from "../whitelist";
import type { WhitelistState } from "../../whitelist-csv";

// unique per-run suffix so names never collide with real or prior-run data.
const RUN = Math.floor(Math.random() * 1e9).toString(36);

// The scenario: 3 squads, 2 players each. Each entry is one player's seeded
// score for a phase. ACC phases (P1/P2/P5) rank high-first; LOSS phases (P3/P4)
// rank low-first. Values are chosen so each team's mean-of-bests is distinct and
// the resulting order is unambiguous.
const TEAMS = [1, 2, 3] as const;
const USERS_PER_TEAM = 2;

// score[team][userIndex] per phase. Team mean is the average of the two.
const SCORES: Record<string, Record<number, [number, number]>> = {
    // ACC (higher better): team means 90, 85, 70  -> order 1,2,3
    P1: { 1: [95, 85], 2: [90, 80], 3: [70, 70] },
    P2: { 1: [88, 82], 2: [99, 91], 3: [60, 50] }, // means 85, 95, 55 -> order 2,1,3
    P5: { 1: [70, 60], 2: [72, 68], 3: [98, 92] }, // means 65, 70, 95 -> order 3,2,1
    // LOSS (lower better): team means 0.55, 0.35, 0.80 -> order 2,1,3
    P3: { 1: [0.5, 0.6], 2: [0.3, 0.4], 3: [0.8, 0.8] },
    P4: { 1: [1.2, 1.0], 2: [0.9, 0.7], 3: [2.0, 1.6] }, // means 1.1, 0.8, 1.8 -> order 2,1,3
};

interface Player {
    team: number;
    idx: number;
    id: string;
    token: string;
    nickname: string;
}

const players: Player[] = [];
const idOf = (team: number, idx: number) =>
    players.find((p) => p.team === team && p.idx === idx)!.id;

function teamMean(scores: [number, number]) {
    return (scores[0] + scores[1]) / USERS_PER_TEAM;
}

let savedWhitelist: WhitelistState | null = null;

beforeAll(async () => {
    // roster enforcement would reject the throwaway identities; disable it and
    // restore the operator's roster afterwards. Disabled whitelist also makes the
    // team board's `members` fall back to joined students.
    savedWhitelist = await getWhitelist();
    await setWhitelist({ enabled: false, entries: [] });

    // pin the P2/P3 mode reveals off so the base board-count assertions are
    // deterministic on a shared dev DB (a prior run may have left them on). The
    // dedicated split test flips them on and restores them.
    await setReveal("p2_line_mode", false);
    await setReveal("p3_wb_plane", false);

    // create 3 teams x 2 users and resolve each token to a studentId.
    for (const team of TEAMS) {
        for (let idx = 0; idx < USERS_PER_TEAM; idx++) {
            const name = `sb_${RUN}_t${team}u${idx}`;
            const r = await join(team, name);
            const me = await requireStudent(r.token);
            players.push({
                team,
                idx,
                id: me.id,
                token: r.token,
                nickname: composeIdentity(team, name),
            });
        }
    }

    // seed every scored phase for every player. A second, worse P1 attempt per
    // player also verifies "best attempt wins" in the aggregation.
    for (const phase of Object.keys(SCORES)) {
        const isAcc = ACC_PHASES.includes(phase);
        for (const team of TEAMS) {
            for (let idx = 0; idx < USERS_PER_TEAM; idx++) {
                const score = SCORES[phase][team][idx];
                const sid = idOf(team, idx);
                if (phase === "P4") {
                    // P4 records one row PER STAGE (flag); seed both surfaces at the same
                    // score so each per-stage board reproduces the team mean.
                    await recordSubmission({
                        studentId: sid,
                        phase,
                        flag: "mlp_a",
                        payload: { team, idx },
                        score,
                    });
                    await recordSubmission({
                        studentId: sid,
                        phase,
                        flag: "mlp_b",
                        payload: { team, idx },
                        score,
                    });
                } else {
                    await recordSubmission({
                        studentId: sid,
                        phase,
                        payload: { team, idx },
                        score,
                    });
                }
                // a deliberately worse extra attempt (lower for ACC, higher for LOSS).
                if (phase === "P1") {
                    const worse = isAcc ? score - 20 : score + 1;
                    await recordSubmission({
                        studentId: sid,
                        phase,
                        payload: {},
                        score: worse,
                    });
                }
            }
        }
    }
}, 30000);

afterAll(async () => {
    for (const p of players) {
        await prisma.student.delete({ where: { id: p.id } }).catch(() => {});
    }
    if (savedWhitelist) await setWhitelist(savedWhitelist).catch(() => {});
    await prisma.$disconnect().catch(() => {});
});

describe("multi-team scoreboard", () => {
    it("seeded the expected number of students and attempts", async () => {
        expect(players).toHaveLength(TEAMS.length * USERS_PER_TEAM);
        // best-of logic: each player has 2 P1 rows but the board keeps the best.
        expect(await countByPhase(idOf(1, 0), "P1")).toBe(2);
        expect(await countByPhase(idOf(1, 0), "P3")).toBe(1);
    });

    // For every scored phase, flipping the room to that phase must produce a team
    // board whose per-team value is the mean of each submitter's BEST attempt, in
    // the right order for the phase's currency.
    for (const phase of Object.keys(SCORES)) {
        it(`team board for ${phase}: mean-of-bests, ordered by currency`, async () => {
            const isAcc = ACC_PHASES.includes(phase);
            await setPhase(phase as never);
            const boards = await getTeamPhaseBoards();

            // P4 splits into two per-stage boards (Foothill / Range); every other phase
            // yields exactly one. Each board must independently reproduce the team means.
            expect(boards).toHaveLength(phase === "P4" ? 2 : 1);

            for (const board of boards) {
                expect(board.phase).toBe(phase);
                expect(board.metric).toBe(isAcc ? "acc" : "loss");

                // exact value per team (guarded so a foreign submitter can't make it flaky).
                for (const team of TEAMS) {
                    const row = board.rows.find((r) => r.team === team);
                    expect(row, `team ${team} present`).toBeTruthy();
                    expect(row!.submitted).toBeGreaterThanOrEqual(
                        USERS_PER_TEAM
                    );
                    expect(row!.members).toBeGreaterThanOrEqual(USERS_PER_TEAM);
                    if (row!.submitted === USERS_PER_TEAM) {
                        expect(row!.value).toBeCloseTo(
                            teamMean(SCORES[phase][team]),
                            10
                        );
                    }
                }

                // Relative order of OUR teams (a global sort preserves subset order). Only
                // compare teams with no FOREIGN submitters (submitted === our seeded count):
                // on the shared dev DB a real student in the same squad would shift that
                // team's mean. On a fresh/CI DB all three are clean and the full order is
                // checked.
                const clean = TEAMS.filter(
                    (t) =>
                        board.rows.find((r) => r.team === t)?.submitted ===
                        USERS_PER_TEAM
                );
                const expected = [...clean].sort((a, b) => {
                    const ma = teamMean(SCORES[phase][a]);
                    const mb = teamMean(SCORES[phase][b]);
                    return isAcc ? mb - ma : ma - mb;
                });
                const seen = board.rows
                    .map((r) => r.team)
                    .filter((t) => clean.includes(t as (typeof TEAMS)[number]));
                expect(seen).toEqual(expected);
            }
        });
    }

    // P2/P3 grow a SECOND board only once the operator reveals the advanced mode.
    // The seeded submissions are all BASE mode (no flag), so they stay on board 1
    // and reproduce the team means; the freshly-revealed advanced board appears with
    // no scorers (every squad null).
    for (const [phase, reveal] of [
        ["P2", "p2_line_mode"],
        ["P3", "p3_wb_plane"],
    ] as const) {
        it(`${phase} splits into a base + advanced board when ${reveal} is on`, async () => {
            await setPhase(phase);
            await setReveal(reveal, true);
            try {
                const boards = await getTeamPhaseBoards();
                expect(boards).toHaveLength(2);
                // both boards carry the phase + its metric; board 1 = base, board 2 =
                // advanced. (The advanced board's exact occupancy can't be asserted on a
                // shared dev DB — a real student's line/plane submission may sit there.)
                const [base, adv] = boards;
                expect(base.phase).toBe(phase);
                expect(adv.phase).toBe(phase);
                expect(adv.metric).toBe(base.metric);
                // our seeded submissions are all BASE mode, so board 1 reproduces the team
                // means exactly — proving none leaked onto the freshly-revealed second board.
                for (const team of TEAMS) {
                    const row = base.rows.find((r) => r.team === team);
                    expect(row, `team ${team} on base board`).toBeTruthy();
                    if (row!.submitted === USERS_PER_TEAM) {
                        expect(row!.value).toBeCloseTo(
                            teamMean(SCORES[phase][team]),
                            10
                        );
                    }
                }
            } finally {
                await setReveal(reveal, false);
            }
        });
    }

    it("team board is empty when the room is on NONE", async () => {
        await setPhase("NONE");
        expect(await getTeamPhaseBoards()).toEqual([]);
    });

    it("ACC leaderboard shows each player’s best across all ACC phases", async () => {
        await setPhase("P1");
        const lb = await getLeaderboard("ACC", idOf(3, 0));
        // team 3 user 0 best ACC score is its P5 98 (P1 70, P2 60, P5 98).
        expect(lb.me?.value).toBe(98);
        // every seeded player's best ACC value = max over its P1/P2/P5 seeds.
        for (const p of players) {
            const best = Math.max(
                // "API"-style phases with no seeded scores are simply absent.
                ...ACC_PHASES.filter((ph) => ph in SCORES).map(
                    (ph) => SCORES[ph][p.team][p.idx]
                )
            );
            const solo = await getLeaderboard("ACC", p.id);
            expect(solo.me?.value, `${p.nickname} best ACC`).toBe(best);
        }
    });

    it("LOSS leaderboard shows each player’s best (lowest) across all LOSS phases", async () => {
        const lb = await getLeaderboard("LOSS", idOf(2, 1));
        // team 2 user 1 best LOSS = min(P3 0.4, P4 0.7) = 0.4.
        expect(lb.me?.value).toBe(0.4);
        for (const p of players) {
            const best = Math.min(
                // "API" has no seeded scores, so it is skipped entirely.
                ...LOSS_PHASES.filter((ph) => ph in SCORES).map(
                    (ph) => SCORES[ph][p.team][p.idx]
                )
            );
            const solo = await getLeaderboard("LOSS", p.id);
            expect(solo.me?.value, `${p.nickname} best LOSS`).toBe(best);
        }
    });

    it("restores the room phase for a clean exit", async () => {
        await setPhase("P1");
        expect(true).toBe(true);
    });
});
