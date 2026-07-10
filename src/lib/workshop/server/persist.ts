/* DB write/count helpers shared by the server-fn layer. Attempt caps and query
   budgets are enforced by counting rows here — authoritative and restart-proof
   (localStorage is convenience-only, §5). Server-only. */

import { prisma } from "#/lib/prisma";
import type { DataPoint, RealRow } from "../types";
import { invalidateStore } from "./store";

export interface RecordArgs {
    studentId: string;
    phase: string;
    payload: unknown;
    score: number;
    score2?: number | null;
    flag?: string | null;
}

export async function recordSubmission(a: RecordArgs): Promise<void> {
    await prisma.submission.create({
        data: {
            studentId: a.studentId,
            phase: a.phase,
            payload: JSON.stringify(a.payload),
            score: a.score,
            score2: a.score2 ?? null,
            flag: a.flag ?? null,
        },
    });
}

export function countByPhase(
    studentId: string,
    phase: string
): Promise<number> {
    return prisma.submission.count({ where: { studentId, phase } });
}

/* ---------------------------------------------------- attempt grants */

/** Operator-granted extra attempts for one student on one phase (0 if none).
    Added on top of the base per-phase cap by the submission gate. */
export async function attemptBonus(
    studentId: string,
    phase: string
): Promise<number> {
    const g = await prisma.attemptGrant.findUnique({
        where: { studentId_phase: { studentId, phase } },
        select: { bonus: true },
    });
    return g?.bonus ?? 0;
}

/** Grant `delta` more attempts (may be negative to take some back); the stored
    bonus is clamped at 0. Returns the new absolute bonus. Admin-only. */
export async function grantAttempts(
    studentId: string,
    phase: string,
    delta: number
): Promise<number> {
    const cur = await attemptBonus(studentId, phase);
    const next = Math.max(0, cur + delta);
    await prisma.attemptGrant.upsert({
        where: { studentId_phase: { studentId, phase } },
        update: { bonus: next },
        create: { studentId, phase, bonus: next },
    });
    return next;
}

/** All grants for one phase as studentId → bonus (feeds the Scores table). */
export async function bonusesForPhase(
    phase: string
): Promise<Map<string, number>> {
    const rows = await prisma.attemptGrant.findMany({
        where: { phase },
        select: { studentId: true, bonus: true },
    });
    return new Map(rows.map((r) => [r.studentId, r.bonus]));
}

/** All of one student's grants as phase → bonus (feeds the student's effective
    caps, so their phase UIs can raise the local submit gate). */
export async function grantsForStudent(
    studentId: string
): Promise<Map<string, number>> {
    const rows = await prisma.attemptGrant.findMany({
        where: { studentId },
        select: { phase: true, bonus: true },
    });
    return new Map(rows.map((r) => [r.phase, r.bonus]));
}

export function countFog(studentId: string, round: string): Promise<number> {
    return prisma.fogQuery.count({ where: { studentId, round } });
}

/** Write a freshly built dataset and mark it the single active bundle. */
export async function activateDataset(args: {
    label: string;
    realRows: RealRow[];
    points: DataPoint[];
    config: unknown;
    meta?: unknown;
    source: string;
}): Promise<string> {
    // deactivate the current bundle, then create the new active one. A single
    // admin drives imports, so strict atomicity here isn't needed.
    await prisma.dataset.updateMany({
        where: { active: true },
        data: { active: false },
    });
    const row = await prisma.dataset.create({
        data: {
            active: true,
            label: args.label,
            realRows: JSON.stringify(args.realRows),
            points: JSON.stringify(args.points),
            config: JSON.stringify(args.config ?? {}),
            meta: args.meta ? JSON.stringify(args.meta) : null,
            source: args.source,
        },
    });
    invalidateStore();
    return row.id;
}
