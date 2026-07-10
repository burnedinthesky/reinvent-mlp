/* Phase-3 fog server functions (§3.3). Budgets: 8 (1d warm-up) / 20 (2d),
   server-enforced by FogQuery row count. Round-1 pins b at bStar. Each 2d probe
   is also recorded as a P3 submission so the LOSS board can take each student's
   best 2d loss. */

import { createServerFn } from "@tanstack/react-start";
import { prisma } from "#/lib/prisma";
import { FOG_BUDGET } from "../constants";
import { requireGate } from "../server/guard";
import { requireStudent } from "../server/identity";
import { countFog, recordSubmission } from "../server/persist";
import { scoreFog } from "../server/scoring";
import { requireActiveStore } from "../server/store";
import type { FogQueryResult, FogRound } from "../types";

export const fogQueryFn = createServerFn({ method: "POST" })
    .validator(
        (d: { token: string; round: FogRound; w: number; b: number }) => d
    )
    .handler(async ({ data }): Promise<FogQueryResult> => {
        const me = await requireStudent(data.token);
        await requireGate({ phase: "P3" });
        const budget = FOG_BUDGET[data.round];
        const used = await countFog(me.id, data.round);
        if (used >= budget) throw new Error(`fog budget exhausted (${budget})`);

        const store = await requireActiveStore();
        const { loss, bUsed } = scoreFog(store, data.round, data.w, data.b);

        await prisma.fogQuery.create({
            data: {
                studentId: me.id,
                round: data.round,
                w: data.w,
                b: bUsed,
                loss,
                seq: used,
            },
        });
        // 2d probes feed the LOSS board (best = lowest).
        if (data.round === "2d") {
            await recordSubmission({
                studentId: me.id,
                phase: "P3",
                payload: { w: data.w, b: bUsed },
                score: loss,
            });
        }
        return { loss, remaining: budget - (used + 1) };
    });
