/* Leaderboard server function: GET /leaderboard?board=ACC|LOSS (§3.3). The
   caller's token is optional — an anonymous view omits `me`. */

import { createServerFn } from "@tanstack/react-start";
import { requireStudent } from "../server/identity";
import { getLeaderboard, getTeamPhaseBoards } from "../server/leaderboard";
import type { Board, LeaderboardResult, PhaseTeamBoard } from "../types";

export const leaderboardFn = createServerFn({ method: "GET" })
    .validator((d: { board: Board; token?: string }) => d)
    .handler(async ({ data }): Promise<LeaderboardResult> => {
        let meId: string | null = null;
        if (data.token) {
            try {
                meId = (await requireStudent(data.token)).id;
            } catch {
                meId = null;
            }
        }
        return getLeaderboard(data.board, meId);
    });

/** GET /leaderboard/teams — the team ranking(s) for the currently-selected room
    phase (empty array when the room is on 'NONE'; two boards for P4). Public. */
export const teamBoardsFn = createServerFn({ method: "GET" }).handler(
    async (): Promise<PhaseTeamBoard[]> => getTeamPhaseBoards()
);
