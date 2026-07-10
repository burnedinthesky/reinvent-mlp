/* Student identity (§1, §3.3). Identity is a squad + free-text name, composed
   into the canonical nickname that keys every board and submission. No link to
   any survey row exists anywhere. Server-only. */

import { prisma } from "#/lib/prisma";
import { composeIdentity, isValidTeam, teamLabel } from "../constants";
import { getWhitelist } from "./whitelist";
import type { JoinResult } from "../types";

function newToken(): string {
    // Web Crypto is available in the Nitro server runtime (Node 20+).
    return (
        crypto.randomUUID().replace(/-/g, "") +
        crypto.randomUUID().replace(/-/g, "").slice(0, 8)
    );
}

export class JoinError extends Error {}

/** Enter the room as (team, name). The 4-digit recovery code was dropped: the
    (team, name) pair *is* the identity, so re-entering the same pair resumes that
    session (re-issuing a fresh bearer token) rather than colliding. When a roster
    whitelist is enabled, a (team, name) not on it is rejected. */
export async function join(team: number, nameRaw: string): Promise<JoinResult> {
    const name = nameRaw.trim();
    if (!isValidTeam(team)) throw new JoinError("請選擇小隊");
    if (!name) throw new JoinError("請輸入姓名");
    if (name.length > 24) throw new JoinError("姓名過長（上限 24 字）");

    const wl = await getWhitelist();
    if (wl.enabled && wl.entries.length > 0) {
        const target = composeIdentity(team, name).toLowerCase();
        const ok = wl.entries.some(
            (e) => composeIdentity(e.team, e.name).toLowerCase() === target
        );
        if (!ok) {
            throw new JoinError(
                `${name} 不在 ${teamLabel(team)} 的報名名單中，請洽工作人員`
            );
        }
    }

    const nickname = composeIdentity(team, name);
    const token = newToken();
    // Atomic upsert keyed on the unique nickname. A find-then-create pair races:
    // two concurrent joins for the same (team, name) both miss, then both create,
    // and the second trips the unique constraint on nickname. code4 is retained in
    // the schema for provenance but no longer surfaced.
    await prisma.student.upsert({
        where: { nickname },
        update: { token },
        create: { nickname, token, code4: "" },
    });
    return { token, nickname };
}

export interface StudentRef {
    id: string;
    nickname: string;
}

/** Resolve a bearer token → student, or throw. Every submission uses this. */
export async function requireStudent(token: string): Promise<StudentRef> {
    if (!token) throw new JoinError("missing token");
    const student = await prisma.student.findUnique({ where: { token } });
    if (!student) throw new JoinError("invalid token");
    return { id: student.id, nickname: student.nickname };
}
