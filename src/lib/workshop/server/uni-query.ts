/* Shared uni-tier query handler (spec §3.3 POST /api/query). Framework-agnostic:
   takes a bearer token + {w,b} and returns a status + JSON body. Consumed by the
   TanStack server route (src/routes/api/query.ts), so the curl/Python channel
   behaves identically in dev and prod. Server-only. */

import { API_BUDGET } from "../constants";
import { requireStudent } from "./identity";
import { countByPhase, recordSubmission } from "./persist";
import { scoreFog } from "./scoring";
import { getActiveStore } from "./store";

export interface UniResult {
    status: number;
    body: unknown;
}

export async function uniQuery(
    token: string,
    wRaw: unknown,
    bRaw: unknown
): Promise<UniResult> {
    let me;
    try {
        me = await requireStudent(token);
    } catch {
        return { status: 401, body: { error: "invalid or missing token" } };
    }

    const w = Number(wRaw);
    const b = Number(bRaw);
    if (!Number.isFinite(w) || !Number.isFinite(b)) {
        return {
            status: 400,
            body: { error: "body must be JSON {w:number, b:number}" },
        };
    }

    const used = await countByPhase(me.id, "API");
    if (used >= API_BUDGET) {
        return {
            status: 429,
            body: { error: "budget exhausted", remaining: 0 },
        };
    }

    const store = await getActiveStore();
    if (!store) {
        return { status: 503, body: { error: "no active dataset" } };
    }
    const { loss } = scoreFog(store, "2d", w, b);
    await recordSubmission({
        studentId: me.id,
        phase: "API",
        payload: { w, b },
        score: loss,
        flag: "⌨️",
    });

    return { status: 200, body: { loss, remaining: API_BUDGET - (used + 1) } };
}

export function bearerToken(authHeader: string | null | undefined): string {
    return (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
}
