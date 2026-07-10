/* Operator console (spec §5.4). A dark neon-lime control room, distinct from the
   student surface, driving the AdminService seam against the live backend's
   /admin endpoints via getAdminService() → HttpAdminService. */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { GenerateSection } from "./sections/GenerateSection";
import { ImportSection } from "./sections/ImportSection";
import { LiveOpsSection } from "./sections/LiveOpsSection";
import { ScoresSection } from "./sections/ScoresSection";
import { WhitelistSection } from "./sections/WhitelistSection";
import { StatusStrip } from "./StatusStrip";
import { MicroLabel, PrimaryButton } from "#/components/workshop/ui";
import { useI18n } from "#/lib/i18n/context";
import { getAdminService } from "#/lib/workshop/admin-service";
import type { DatasetInfo } from "#/lib/workshop/admin-service";
import type { ServerState } from "#/lib/workshop/types";

/* Two-stage setup gate. Import is Phase 0 (always open); Generate unlocks once a
   dataset is imported; Live Ops and everything after it unlock once Generate has
   been run — the workshop can't start on unverified synthetic data. */
const SECTIONS = [
    { id: "import", name: "Setup", gate: "none" },
    { id: "generate", name: "Generate", gate: "imported" },
    { id: "roster", name: "Roster", gate: "none" },
    { id: "live", name: "Live Ops", gate: "generated" },
    { id: "scores", name: "Scores", gate: "generated" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/* Minimal stroke glyphs (Lucide-style, 24-grid) so each nav row is scannable at
   a glance now that the numeric prefixes are gone. */
function NavIcon({ children }: { children: ReactNode }) {
    return (
        <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="shrink-0"
        >
            {children}
        </svg>
    );
}

const ICONS: Record<SectionId, ReactNode> = {
    import: (
        <>
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14a9 3 0 0 0 18 0V5" />
            <path d="M3 12a9 3 0 0 0 18 0" />
        </>
    ),
    generate: (
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
    ),
    roster: (
        <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
    ),
    live: (
        <>
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
            <circle cx="12" cy="12" r="2" />
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
            <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
        </>
    ),
    scores: (
        <>
            <path d="M3 3v18h18" />
            <path d="M7 15l3-4 3 3 4-6" />
        </>
    ),
};

const TOKEN_KEY = "mlp.admin.token";

export function AdminConsole({ initialToken }: { initialToken?: string }) {
    const [token, setToken] = useState<string | null>(
        () =>
            initialToken ??
            (typeof localStorage !== "undefined"
                ? localStorage.getItem(TOKEN_KEY)
                : null)
    );
    if (!token) return <TokenGate onToken={setToken} />;
    return (
        <Console
            token={token}
            onBadToken={() => {
                try {
                    localStorage.removeItem(TOKEN_KEY);
                } catch {
                    /* ignore */
                }
                setToken(null);
            }}
        />
    );
}

function TokenGate({ onToken }: { onToken: (t: string) => void }) {
    const { t } = useI18n();
    const [value, setValue] = useState("");
    const submit = () => {
        const t = value.trim();
        if (!t) return;
        try {
            localStorage.setItem(TOKEN_KEY, t);
        } catch {
            /* ignore */
        }
        onToken(t);
    };
    return (
        <div className="flex h-screen items-center justify-center bg-bg bg-[radial-gradient(1000px_500px_at_30%_-10%,#171717_0%,#0a0a0a_60%)] text-fg">
            <div className="w-[420px] rounded-[18px] border border-border bg-panel px-9 py-9 shadow-lg motion-safe:animate-pop-in">
                <MicroLabel accent className="tracking-[.14em]">
                    {t("admin.gate.eyebrow")}
                </MicroLabel>
                <h1 className="mt-3 mb-1.5 font-display text-2xl font-bold tracking-tight text-fg">
                    {t("admin.gate.title")}
                </h1>
                <p className="mb-6 text-sm leading-relaxed text-muted">
                    {t("admin.gate.body.before")}
                    <span className="font-mono text-fg">ADMIN_TOKEN</span>
                    {t("admin.gate.body.after")}
                    <span className="font-mono text-fg">sitcon-admin</span>
                    {t("admin.gate.body.suffix")}
                </p>
                <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder={t("admin.gate.placeholder")}
                    type="password"
                    className="mb-3.5 w-full rounded-md border border-border bg-bg px-3.5 py-3 font-mono text-sm text-fg outline-none placeholder:text-muted/60 focus:border-accent"
                />
                <PrimaryButton
                    onClick={submit}
                    className="w-full py-3 text-[15px]"
                >
                    {t("admin.gate.enter")}
                </PrimaryButton>
            </div>
        </div>
    );
}

function Console({
    token,
    onBadToken,
}: {
    token: string;
    onBadToken: () => void;
}) {
    const { t } = useI18n();
    const service = getAdminService();
    service.setToken(token);
    const [section, setSection] = useState<SectionId>("import");
    const [state, setState] = useState<ServerState | null>(null);
    const [dataset, setDataset] = useState<DatasetInfo | null>(null);

    useEffect(() => {
        let alive = true;
        Promise.all([service.getState(), service.getDataset()])
            .then(([s, d]) => {
                if (!alive) return;
                setState(s);
                setDataset(d);
            })
            .catch((e: unknown) => {
                // a wrong ADMIN_TOKEN bounces back to the gate instead of a dead console.
                if (
                    alive &&
                    e instanceof Error &&
                    e.message.includes("unauthorized")
                )
                    onBadToken();
            });
        return () => {
            alive = false;
        };
    }, [service, token, onBadToken]);

    // two-stage gate: Generate needs an import; the rest need Generate to have run.
    const imported = dataset?.imported ?? false;
    const generated = dataset?.generated ?? false;
    const isLocked = (gate: (typeof SECTIONS)[number]["gate"]) =>
        gate === "imported"
            ? !imported
            : gate === "generated"
              ? !generated
              : false;
    const lockReason = (gate: (typeof SECTIONS)[number]["gate"]) =>
        gate === "imported"
            ? t("admin.lock.imported")
            : t("admin.lock.generated");
    const current = SECTIONS.find((s) => s.id === section);
    const active: SectionId =
        current && isLocked(current.gate) ? "import" : section;

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
            <StatusStrip state={state} dataset={dataset} />
            <div className="flex min-h-0 flex-1">
                <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-border bg-panel/40 p-3">
                    <MicroLabel className="mb-2 border-b border-border/60 px-2 pb-2.5">
                        {t("admin.nav.console")}
                    </MicroLabel>
                    {SECTIONS.map((s) => {
                        const locked = isLocked(s.gate);
                        const on = active === s.id;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                disabled={locked}
                                title={locked ? lockReason(s.gate) : undefined}
                                onClick={() => !locked && setSection(s.id)}
                                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left font-mono text-[11px] tracking-wide uppercase transition-colors ${
                                    on
                                        ? "bg-accent/10 text-accent"
                                        : locked
                                          ? "cursor-not-allowed text-muted/40"
                                          : "text-muted hover:text-fg"
                                }`}
                            >
                                <NavIcon>{ICONS[s.id]}</NavIcon>
                                <span className="flex-1">
                                    {t(`admin.section.${s.id}`)}
                                </span>
                                {locked && <span aria-hidden>🔒</span>}
                            </button>
                        );
                    })}
                </nav>
                <main className="min-h-0 flex-1 overflow-auto p-6">
                    <div className="mx-auto max-w-4xl">
                        {active === "import" && (
                            <ImportSection
                                service={service}
                                onDataset={setDataset}
                                onState={setState}
                            />
                        )}
                        {active === "roster" && (
                            <WhitelistSection service={service} />
                        )}
                        {active === "live" && (
                            <LiveOpsSection
                                service={service}
                                state={state}
                                onState={setState}
                            />
                        )}
                        {active === "generate" && (
                            <GenerateSection
                                service={service}
                                onDataset={setDataset}
                            />
                        )}
                        {active === "scores" && (
                            <ScoresSection service={service} />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
