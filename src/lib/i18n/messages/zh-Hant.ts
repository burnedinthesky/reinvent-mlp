/* Source-of-truth message catalogue (Traditional Chinese), assembled from the
   per-namespace fragments under ./ns. Fragments keep the catalogue diffable and
   let parallel work touch disjoint files. Flat, namespaced dot-keys; interpolation
   uses {name} placeholders filled by t(key, vars). `MessageKey` (the union of all
   keys) is derived here and pins en.ts for a compile-time completeness check. */

import { shellZh } from "./ns/shell";
import { phases123Zh } from "./ns/phases123";
import { phases56Zh } from "./ns/phases56";
import { p4Zh } from "./ns/p4";
import { helpZh } from "./ns/help";
import { adminZh } from "./ns/admin";
import { leaderboardZh } from "./ns/leaderboard";

export const zhHant = {
    ...shellZh,
    ...phases123Zh,
    ...phases56Zh,
    ...p4Zh,
    ...helpZh,
    ...adminZh,
    ...leaderboardZh,
} as const;

export type MessageKey = keyof typeof zhHant;
