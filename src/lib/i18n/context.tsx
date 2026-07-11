/* React binding for the i18n core: a provider seeded with the server-resolved
   locale and a useI18n() hook exposing { locale, setLocale, t }.

   The locale lives in React state so a switch re-renders the whole tree with no
   reload. setLocale also persists to the cookie (so the next SSR paint matches)
   and updates <html lang> for correct browser/AT behaviour. */

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

import { DEFAULT_LOCALE, LOCALE_COOKIE, htmlLang, type Locale } from "./index";
import { MESSAGES, type MessageKey } from "./messages/index";

/** Fill {name} placeholders in a template from `vars`. Missing vars are left as
    the literal placeholder so gaps are visible rather than silently blank. */
function interpolate(
    template: string,
    vars?: Record<string, string | number>
): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (m, k: string) =>
        k in vars ? String(vars[k]) : m
    );
}

export type TranslateFn = (
    key: MessageKey,
    vars?: Record<string, string | number>
) => string;

type I18nValue = {
    locale: Locale;
    setLocale: (next: Locale) => void;
    t: TranslateFn;
};

const I18nContext = createContext<I18nValue | null>(null);

function writeLocaleCookie(locale: Locale) {
    try {
        // one year; Lax is enough — this is a non-sensitive UI preference.
        document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
        /* document unavailable (SSR) — ignore */
    }
}

export function I18nProvider({
    initialLocale,
    children,
}: {
    initialLocale: Locale;
    children: React.ReactNode;
}) {
    const [locale, setLocaleState] = useState<Locale>(initialLocale);

    const setLocale = useCallback((next: Locale) => {
        setLocaleState(next);
        writeLocaleCookie(next);
        try {
            document.documentElement.lang = htmlLang(next);
        } catch {
            /* ignore */
        }
    }, []);

    const t = useCallback<TranslateFn>(
        (key, vars) => {
            const table = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
            const template = table[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
            return interpolate(template, vars);
        },
        [locale]
    );

    const value = useMemo<I18nValue>(
        () => ({ locale, setLocale, t }),
        [locale, setLocale, t]
    );

    return (
        <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    );
}

export function useI18n(): I18nValue {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        throw new Error("useI18n must be used within an I18nProvider");
    }
    return ctx;
}
