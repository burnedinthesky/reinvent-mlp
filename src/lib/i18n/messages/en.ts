/* English catalogue, assembled from the per-namespace fragments' `*En` maps.
   Typed as `Record<MessageKey, string>`, so the build fails if any key defined in
   zh-Hant.ts is missing here (each fragment also self-checks its own keys). */

import type { MessageKey } from "./zh-Hant";
import { shellEn } from "./ns/shell";
import { phases123En } from "./ns/phases123";
import { phases56En } from "./ns/phases56";
import { p4En } from "./ns/p4";
import { helpEn } from "./ns/help";
import { adminEn } from "./ns/admin";
import { leaderboardEn } from "./ns/leaderboard";

export const en: Record<MessageKey, string> = {
    ...shellEn,
    ...phases123En,
    ...phases56En,
    ...p4En,
    ...helpEn,
    ...adminEn,
    ...leaderboardEn,
};
