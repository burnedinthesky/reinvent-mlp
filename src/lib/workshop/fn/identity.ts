/* Identity server function: POST /join (§3.3). Rejoin was dropped — re-entering
   the same (team, name) on join resumes the session. */

import { createServerFn } from "@tanstack/react-start";
import { JoinError, join } from "../server/identity";
import type { JoinResult } from "../types";

export const joinFn = createServerFn({ method: "POST" })
    .validator((d: { team: number; name: string }) => d)
    .handler(async ({ data }): Promise<JoinResult> => {
        try {
            return await join(data.team, data.name);
        } catch (e) {
            throw e instanceof JoinError ? new Error(e.message) : e;
        }
    });
