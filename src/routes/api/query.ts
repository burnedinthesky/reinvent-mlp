/* Uni-tier raw channel (spec §3.3 POST /api/query): curl/Python students hit
   this with `Authorization: Bearer <token>` and a JSON {w, b} body, and get
   back only a loss + remaining budget. All logic lives in the shared
   server/uni-query.ts handler; this route is a pure HTTP translation. */

import { createFileRoute } from "@tanstack/react-router";
import { bearerToken, uniQuery } from "#/lib/workshop/server/uni-query";

export const Route = createFileRoute("/api/query")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const token = bearerToken(request.headers.get("authorization"));
                let body: { w?: unknown; b?: unknown } = {};
                try {
                    body = await request.json();
                } catch {
                    /* non-JSON body — uniQuery returns 400 */
                }
                const r = await uniQuery(token, body.w, body.b);
                return Response.json(r.body, { status: r.status });
            },
        },
    },
});
