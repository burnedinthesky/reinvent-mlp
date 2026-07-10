/* Prisma-backed integration test (real SQLite via the better-sqlite3 adapter):
   join → identify → submit → leaderboard → state flip. Runs in a node
   environment (native module). Uses a unique nickname and cleans up after
   itself so it can run against the dev DB without leaving residue. */

// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "#/lib/prisma";
import { buildDataset } from "../../__tests__/fixtures/dataset";
import { composeIdentity } from "../../constants";
import { requireGate } from "../guard";
import { join, requireStudent } from "../identity";
import {
    getLeaderboard,
    getPhaseScores,
    getTeamPhaseBoards,
} from "../leaderboard";
import {
    activateDataset,
    attemptBonus,
    bonusesForPhase,
    countByPhase,
    grantAttempts,
    grantsForStudent,
    recordSubmission,
} from "../persist";
import {
    getServerState,
    setDeadline,
    setPhase,
    setReveal,
    setSelfSelect,
} from "../state";
import { awaitTerrains, getActiveStore, invalidateStore } from "../store";
import { getWhitelist, setWhitelist } from "../whitelist";
import type { WhitelistState } from "../../whitelist-csv";
import { uniQuery } from "../uni-query";

const team = 3;
const rawName = `test_${Math.floor(Math.random() * 1e9).toString(36)}`;
const nick = composeIdentity(team, rawName); // the composed '第三小隊 …' identity
let studentId = "";
let token = "";
let savedWhitelist: WhitelistState | null = null;
let prevActiveDatasetId: string | null = null;
let testDatasetId: string | null = null;

beforeAll(async () => {
    // the dev DB may have roster enforcement on; disable it for the run so the
    // throwaway test identity can join, and restore the operator's roster after.
    savedWhitelist = await getWhitelist();
    await setWhitelist({ enabled: false, entries: [] });
    // the uni-tier tests score against the active dataset; swap in the fixture
    // bundle for the run (and restore whatever was active afterwards) so the
    // suite is self-contained on a fresh DB.
    prevActiveDatasetId =
        (
            await prisma.dataset.findFirst({
                where: { active: true },
                select: { id: true },
            })
        )?.id ?? null;
    const ds = buildDataset();
    testDatasetId = await activateDataset({
        label: "LABEL_OWL",
        realRows: ds.realRows,
        points: ds.points,
        config: {},
        meta: { source: "db.integration.test" },
        source: "import",
    });
    // warm the store here. getActiveStore now returns the light store immediately
    // and kicks the two scored MLP terrains in the BACKGROUND; awaitTerrains blocks
    // until that build completes (a few seconds, memoized) so the per-test 5 s
    // timeout isn't spent on the one-time terrain build and submitBot can score.
    invalidateStore();
    await getActiveStore();
    await awaitTerrains();
}, 30000);

afterAll(async () => {
    if (studentId)
        await prisma.student
            .delete({ where: { id: studentId } })
            .catch(() => {});
    if (savedWhitelist) await setWhitelist(savedWhitelist).catch(() => {});
    if (testDatasetId) {
        await prisma.dataset
            .delete({ where: { id: testDatasetId } })
            .catch(() => {});
    }
    if (prevActiveDatasetId) {
        await prisma.dataset
            .update({
                where: { id: prevActiveDatasetId },
                data: { active: true },
            })
            .catch(() => {});
    }
    invalidateStore();
    await prisma.$disconnect().catch(() => {});
});

describe("DB integration", () => {
    it("join issues a token and resumes on the same (team, name)", async () => {
        const r = await join(team, rawName);
        expect(r.token).toBeTruthy();
        const me = await requireStudent(r.token);
        studentId = me.id;
        token = r.token;
        expect(me.nickname).toBe(nick);
        // re-entering the same squad + name resumes the session with a fresh token.
        const again = await join(team, rawName);
        expect(again.token).toBeTruthy();
        expect(again.token).not.toBe(r.token);
        const me2 = await requireStudent(again.token);
        expect(me2.id).toBe(studentId);
        token = again.token;
    });

    it("records a submission and counts attempts", async () => {
        await recordSubmission({
            studentId,
            phase: "P1",
            payload: { labels: {} },
            score: 90,
        });
        expect(await countByPhase(studentId, "P1")).toBe(1);
    });

    it("surfaces the best score on the ACC leaderboard", async () => {
        await recordSubmission({
            studentId,
            phase: "P1",
            payload: { labels: {} },
            score: 95,
        });
        const lb = await getLeaderboard("ACC", studentId);
        const mine = lb.top.find((r) => r.name === nick);
        expect(mine?.value).toBe(95); // best of 90/95
        expect(lb.me?.value).toBe(95);
    });

    it("team board averages each submitter's best for the active phase", async () => {
        // whitelist is disabled for this suite (beforeAll), so the roster falls back to
        // joined students (this student is in team 3, best P1 95 of 90/95).
        await setPhase("P1");
        const [board] = await getTeamPhaseBoards();
        expect(board.phase).toBe("P1");
        expect(board.metric).toBe("acc");
        const row = board.rows.find((r) => r.team === team);
        expect(row).toBeTruthy();
        expect(row!.submitted).toBeGreaterThanOrEqual(1);
        expect(row!.members).toBeGreaterThanOrEqual(row!.submitted);
        // the value is the mean over SUBMITTERS of their best attempt — not divided by
        // roster size, not penalty-filled. When this throwaway identity is team 3's only
        // P1 submitter, that mean is exactly its best (95), never a roster-diluted value.
        if (row!.submitted === 1) expect(row!.value).toBe(95);
        expect(row!.value!).toBeGreaterThan(0);
        expect(row!.value!).toBeLessThanOrEqual(100);
    });

    it("a rostered team with no submitters has a null value", async () => {
        // roster team 10 with a name that never joined/submitted; its row must show a
        // null value (rendered as '—'), not a 0/100 penalty. Restore the disabled
        // whitelist afterwards so the rest of the suite is unaffected.
        await setPhase("P1");
        await setWhitelist({
            enabled: true,
            entries: [{ team: 10, name: "ghost_no_submit" }],
        });
        try {
            const [board] = await getTeamPhaseBoards();
            const ghost = board.rows.find((r) => r.team === 10);
            expect(ghost).toBeTruthy();
            expect(ghost!.submitted).toBe(0);
            expect(ghost!.value).toBeNull();
        } finally {
            await setWhitelist({ enabled: false, entries: [] });
        }
    });

    it("team board is empty when the room is on NONE", async () => {
        await setPhase("NONE");
        expect(await getTeamPhaseBoards()).toEqual([]);
        await setPhase("P1");
    });

    it("grants extra attempts: bonus accrues, clamps at 0, and lands in the effective cap", async () => {
        // no grant yet → base cap only.
        expect(await attemptBonus(studentId, "P1")).toBe(0);
        // additive grants accumulate into one absolute bonus.
        expect(await grantAttempts(studentId, "P1", 3)).toBe(3);
        expect(await grantAttempts(studentId, "P1", 2)).toBe(5);
        expect(await attemptBonus(studentId, "P1")).toBe(5);
        // negative delta takes some back and never drops below 0.
        expect(await grantAttempts(studentId, "P1", -100)).toBe(0);
        expect(await grantAttempts(studentId, "P1", 4)).toBe(4);
        // the grant is visible per-phase (Scores table) and per-student (student caps).
        expect((await bonusesForPhase("P1")).get(studentId)).toBe(4);
        expect((await grantsForStudent(studentId)).get("P1")).toBe(4);
        // and it surfaces on the student's Scores row for that phase.
        const scores = await getPhaseScores("P1");
        const mine = scores.rows.find((r) => r.studentId === studentId);
        expect(mine?.bonus).toBe(4);
        // a phase with no grant stays at 0.
        const p2 = await getPhaseScores("P2");
        expect(p2.rows.find((r) => r.studentId === studentId)?.bonus).toBe(0);
        // clean up so the throwaway identity leaves no residual cap.
        await grantAttempts(studentId, "P1", -100);
    });

    it("reads and flips server state", async () => {
        await setPhase("P2");
        await setReveal("reveal100", true);
        const s = await getServerState();
        expect(s.phase).toBe("P2");
        expect(s.reveals.reveal100).toBe(true);
        // restore defaults so a live workshop isn't left mid-phase.
        await setPhase("P1");
        await setReveal("reveal100", false);
    });

    it("gates submissions on the live phase and deadline", async () => {
        // self-select skips the phase check, so pin it off for the phase-gate asserts.
        await setSelfSelect(false);
        await setPhase("P2");
        await expect(requireGate({ phase: "P1" })).rejects.toThrow(
            /phase closed/
        );
        await expect(requireGate({ phase: "P2" })).resolves.toBeTruthy();

        await setDeadline(new Date(Date.now() - 60_000).toISOString());
        await expect(requireGate({ phase: "P2" })).rejects.toThrow(/deadline/);
        await setDeadline(null);
        await expect(requireGate({ phase: "P2" })).resolves.toBeTruthy();

        // restore defaults.
        await setPhase("P1");
    });

    it("self-select opens the phase gate for a roaming student", async () => {
        await setPhase("P2");
        await setSelfSelect(true);
        // room is on P2 but the student submits for P5 — allowed under self-select.
        await expect(requireGate({ phase: "P5" })).resolves.toBeTruthy();
        // restore defaults.
        await setSelfSelect(false);
        await setPhase("P1");
    });

    it("uni-tier query: scores, burns budget, lands on the API channel", async () => {
        const r = await uniQuery(token, 0.5, -1);
        expect(r.status).toBe(200);
        const body = r.body as { loss: number; remaining: number };
        expect(body.loss).toBeGreaterThan(0);
        expect(body.remaining).toBe(99);
        const rows = await prisma.submission.findMany({
            where: { studentId, phase: "API" },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].flag).toBe("⌨️");
    });

    it("uni-tier query: 401 on a bad token, 400 on a non-numeric body", async () => {
        expect((await uniQuery("nope", 0, 0)).status).toBe(401);
        expect((await uniQuery(token, "x", 0)).status).toBe(400);
        // the failed calls must not burn budget.
        expect(await countByPhase(studentId, "API")).toBe(1);
    });
});
