/* Catalogue registry: maps each locale to its message map. Consumed by the i18n
   context's t(). zh-Hant is the source of truth for the key set (MessageKey). */

import type { Locale } from "../index";
import { zhHant, type MessageKey } from "./zh-Hant";
import { en } from "./en";

export type { MessageKey } from "./zh-Hant";

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
    "zh-Hant": zhHant,
    en,
};
