/* Compact segmented zh / EN language control, shared by the student shell and the
   operator console. Reads/writes the locale through useI18n(); the switch takes
   effect immediately (context re-render) and persists via cookie. */

import { LOCALES, type Locale } from "#/lib/i18n";
import { useI18n } from "#/lib/i18n/context";

const LABEL_KEY: Record<Locale, "lang.zh" | "lang.en"> = {
    "zh-Hant": "lang.zh",
    en: "lang.en",
};

export function LanguageSwitcher({ className = "" }: { className?: string }) {
    const { locale, setLocale, t } = useI18n();
    return (
        <div
            role="group"
            aria-label={t("common.language")}
            className={`inline-flex rounded-full border border-border p-0.5 ${className}`}
        >
            {LOCALES.map((loc) => {
                const on = locale === loc;
                return (
                    <button
                        key={loc}
                        type="button"
                        onClick={() => setLocale(loc)}
                        aria-pressed={on}
                        className={
                            on
                                ? "rounded-full bg-accent px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide text-accent-fg"
                                : "rounded-full px-2.5 py-1 font-mono text-[11px] tracking-wide text-muted transition-colors hover:text-fg"
                        }
                    >
                        {t(LABEL_KEY[loc])}
                    </button>
                );
            })}
        </div>
    );
}
