/* i18n core — types, locale constants, and locale resolution.

   Client-safe by construction: imports nothing server-only, so both the browser
   bundle and the server fn (fn.ts) can import from it. The workshop ships in two
   locales — Traditional Chinese (the original, default) and English. */

export const LOCALES = ["zh-Hant", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** The camp's original language; used when no cookie / header hints otherwise. */
export const DEFAULT_LOCALE: Locale = "zh-Hant";

/** Cookie the client writes on switch and the server reads to seed SSR, so the
    first paint (and <html lang>) already matches the user's choice — no flash. */
export const LOCALE_COOKIE = "mlp_locale";

/** true when `v` is one of the shipped locales. */
export function isLocale(v: unknown): v is Locale {
    return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** Normalize a raw cookie value or Accept-Language header into a shipped locale.
    Matches the primary subtag: `zh*` → zh-Hant, `en*` → en, else the default.
    Accepts the full header (e.g. "en-US,en;q=0.9,zh-TW;q=0.8") — the first tag
    wins. */
export function resolveLocale(raw?: string | null): Locale {
    if (!raw) return DEFAULT_LOCALE;
    const first = raw.split(",")[0]?.trim().toLowerCase() ?? "";
    if (first.startsWith("zh")) return "zh-Hant";
    if (first.startsWith("en")) return "en";
    return DEFAULT_LOCALE;
}

/** BCP-47 value for the <html lang> attribute. */
export function htmlLang(locale: Locale): string {
    return locale === "en" ? "en" : "zh-Hant";
}
