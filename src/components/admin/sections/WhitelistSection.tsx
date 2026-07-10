/* Roster — the (team, name) whitelist that gates who may join (join screen →
   server/identity.join). The operator pastes or uploads a `team,name` CSV; it's
   parsed here for a live preview, then persisted to AppState via the service.
   When enforcement is on and the list is non-empty, any (team, name) not on it is
   turned away at the join screen. */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    GhostButton,
    Island,
    MicroLabel,
    PrimaryButton,
    SegmentedControl,
} from "#/components/workshop/ui";
import { Toggle, WarnBanner } from "../ui";
import { teamLabel } from "#/lib/workshop/constants";
import { parseWhitelistCsv } from "#/lib/workshop/whitelist-csv";
import type {
    AdminService,
    WhitelistEntry,
} from "#/lib/workshop/admin-service";

type Source = "paste" | "file";

export function WhitelistSection({ service }: { service: AdminService }) {
    const [enabled, setEnabled] = useState(false);
    const [entries, setEntries] = useState<WhitelistEntry[]>([]);
    const [loaded, setLoaded] = useState(false);

    const [source, setSource] = useState<Source>("paste");
    const [csv, setCsv] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const wl = await service.getWhitelist();
            setEnabled(wl.enabled);
            setEntries(wl.entries);
            setLoaded(true);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not load the roster"
            );
        }
    }, [service]);

    useEffect(() => {
        load();
    }, [load]);

    const parsed = useMemo(
        () => (csv.trim() ? parseWhitelistCsv(csv) : null),
        [csv]
    );

    const save = async (next: {
        enabled: boolean;
        entries: WhitelistEntry[];
    }) => {
        setBusy(true);
        setError(null);
        setNote(null);
        try {
            await service.setWhitelist(next);
            setEnabled(next.enabled);
            setEntries(next.entries);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
            return false;
        } finally {
            setBusy(false);
        }
    };

    const applyUpload = async () => {
        if (!parsed || parsed.entries.length === 0) return;
        // uploading a roster turns enforcement on — that's the point of the upload.
        const ok = await save({ enabled: true, entries: parsed.entries });
        if (ok) {
            setNote(
                `Saved ${parsed.entries.length} names — enforcement is on.`
            );
            setCsv("");
        }
    };

    const onFile = (f: File | undefined) => {
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => setCsv(String(reader.result ?? ""));
        reader.readAsText(f);
    };

    const perTeam = useMemo(() => {
        const m = new Map<number, string[]>();
        for (const e of entries) {
            const list = m.get(e.team) ?? [];
            list.push(e.name);
            m.set(e.team, list);
        }
        return [...m.entries()].sort((a, b) => a[0] - b[0]);
    }, [entries]);

    return (
        <div className="space-y-5">
            <div>
                <MicroLabel accent>Roster</MicroLabel>
                <h2 className="mt-1 font-display text-xl font-semibold text-fg">
                    Team / name whitelist
                </h2>
                <p className="text-sm text-muted">
                    Upload the camp roster to lock joining to known squad
                    members. When enforcement is on, a student whose{" "}
                    <span className="font-mono text-fg">小隊 + 姓名</span>{" "}
                    isn&apos;t on the list is turned away at the join screen.
                </p>
            </div>

            <Island className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <MicroLabel>Enforcement</MicroLabel>
                        <p className="mt-1 text-sm text-muted">
                            {enabled
                                ? `On — ${entries.length} names may join.`
                                : entries.length > 0
                                  ? `Off — anyone may join (${entries.length} names saved).`
                                  : "Off — no roster uploaded; anyone may join."}
                        </p>
                    </div>
                    <Toggle
                        checked={enabled}
                        ariaLabel="Toggle whitelist enforcement"
                        onChange={(v) => save({ enabled: v, entries })}
                    />
                </div>
            </Island>

            <Island className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                    <MicroLabel>Source</MicroLabel>
                    <SegmentedControl<Source>
                        value={source}
                        onChange={setSource}
                        options={[
                            { value: "paste", label: "Paste CSV" },
                            { value: "file", label: "Upload" },
                        ]}
                    />
                    <span className="font-mono text-[11px] text-muted">
                        columns: team,name
                    </span>
                </div>

                {source === "paste" && (
                    <textarea
                        value={csv}
                        onChange={(e) => setCsv(e.target.value)}
                        placeholder={"team,name\n1,小明\n第三小隊,王小美"}
                        spellCheck={false}
                        className="h-40 w-full resize-none rounded-md border border-border bg-bg px-3 py-2.5 font-mono text-xs text-fg outline-none placeholder:text-muted/50 focus:border-accent"
                    />
                )}
                {source === "file" && (
                    <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-border bg-bg px-4 py-8 text-sm text-muted hover:border-accent hover:text-fg">
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={(e) => onFile(e.target.files?.[0])}
                        />
                        {csv
                            ? `${csv.split(/\r?\n/).length} lines loaded — click to replace`
                            : "Choose roster.csv"}
                    </label>
                )}

                {parsed && (
                    <div className="rounded-md border border-border bg-bg p-3">
                        <div className="flex items-center justify-between">
                            <MicroLabel>Preview</MicroLabel>
                            <span className="font-mono text-[11px] text-muted">
                                {parsed.entries.length} names
                                {parsed.dropped > 0
                                    ? ` · ${parsed.dropped} rows skipped`
                                    : ""}
                            </span>
                        </div>
                        {parsed.entries.length === 0 ? (
                            <p className="mt-2 text-[11px] text-warning">
                                No valid rows — each line needs a squad (1–10 or
                                第N小隊) and a name.
                            </p>
                        ) : (
                            <div className="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-muted">
                                {parsed.entries.map((e, i) => (
                                    <div
                                        key={`${e.team}-${e.name}-${i}`}
                                        className="flex gap-2 py-0.5"
                                    >
                                        <span className="w-20 shrink-0 text-fg">
                                            {teamLabel(e.team)}
                                        </span>
                                        <span>{e.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {error && <WarnBanner>{error}</WarnBanner>}
                {note && (
                    <p className="font-mono text-[11px] text-positive">
                        {note}
                    </p>
                )}

                <div className="flex justify-end">
                    <PrimaryButton
                        onClick={applyUpload}
                        disabled={
                            busy || !parsed || parsed.entries.length === 0
                        }
                    >
                        {busy ? "Saving…" : "Save whitelist"}
                    </PrimaryButton>
                </div>
            </Island>

            <Island className="space-y-3 p-5">
                <div className="flex items-baseline justify-between">
                    <MicroLabel>Current roster</MicroLabel>
                    <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] text-muted">
                            {entries.length} names
                        </span>
                        {entries.length > 0 && (
                            <GhostButton
                                bordered
                                onClick={() =>
                                    save({ enabled: false, entries: [] })
                                }
                                disabled={busy}
                                className="border-warning/40 text-warning hover:text-warning"
                            >
                                Clear
                            </GhostButton>
                        )}
                    </div>
                </div>

                {!loaded ? (
                    <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                        Loading…
                    </p>
                ) : entries.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                        No roster saved — upload a team,name CSV above to limit
                        joining.
                    </p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {perTeam.map(([team, names]) => (
                            <div
                                key={team}
                                className="rounded-md border border-border bg-bg px-3 py-2.5"
                            >
                                <div className="flex items-baseline justify-between">
                                    <span className="text-sm font-medium text-fg">
                                        {teamLabel(team)}
                                    </span>
                                    <span className="font-mono text-[11px] text-muted">
                                        {names.length}
                                    </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {names.map((n, i) => (
                                        <span
                                            key={`${n}-${i}`}
                                            className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted"
                                        >
                                            {n}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Island>
        </div>
    );
}
