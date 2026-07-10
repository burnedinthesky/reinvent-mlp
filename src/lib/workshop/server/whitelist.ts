/* Server-side roster whitelist store. Persisted as a single JSON row in AppState
   (key 'whitelist') so it survives restarts alongside the other operator state,
   and read by identity.join() to gate who may enter. Server-only: imports prisma. */

import { prisma } from "#/lib/prisma";
import { isValidTeam } from "../constants";
import type { WhitelistEntry, WhitelistState } from "../whitelist-csv";

const KEY = "whitelist";

const EMPTY: WhitelistState = { enabled: false, entries: [] };

/** Read the persisted roster; returns a disabled empty list when unset/corrupt. */
export async function getWhitelist(): Promise<WhitelistState> {
    const row = await prisma.appState.findUnique({ where: { key: KEY } });
    if (!row) return EMPTY;
    try {
        // JSON.parse yields untyped data — validate each entry against the shape.
        const parsed = JSON.parse(row.value) as {
            enabled?: unknown;
            entries?: unknown;
        };
        const raw = Array.isArray(parsed.entries) ? parsed.entries : [];
        const entries = raw.filter(
            (e): e is WhitelistEntry =>
                !!e &&
                typeof e === "object" &&
                isValidTeam((e as WhitelistEntry).team) &&
                typeof (e as WhitelistEntry).name === "string" &&
                !!(e as WhitelistEntry).name.trim()
        );
        return { enabled: !!parsed.enabled, entries };
    } catch {
        return EMPTY;
    }
}

/** Replace the persisted roster (entries are sanitized before storage). */
export async function setWhitelist(state: WhitelistState): Promise<void> {
    const entries = state.entries
        .filter((e) => isValidTeam(e.team) && !!e.name.trim())
        .map((e) => ({ team: e.team, name: e.name.trim() }));
    const value = JSON.stringify({ enabled: !!state.enabled, entries });
    await prisma.appState.upsert({
        where: { key: KEY },
        update: { value },
        create: { key: KEY, value },
    });
}
