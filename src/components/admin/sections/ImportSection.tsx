/* Import — Phase 0 / Setup (spec §4.1, §7 runbook). CSV paste / file upload.
   The header contract (9 features + LABEL_OWL, or a raw Google-Form export) is
   checked live before import (csv-schema.ts) and the current active data is
   shown in a table. Cleaning + true-label derivation live server-side
   (dataset-io.ts); this drives that path and renders the report.

   This is the console's gate: a successful import flips DatasetInfo.imported,
   which unlocks every other section (AdminConsole). */

import { useCallback, useEffect, useMemo, useState } from "react";

import { ImportHelpModal } from "./ImportHelpModal";
import {
    GhostButton,
    Island,
    MicroLabel,
    PrimaryButton,
    SegmentedControl,
} from "#/components/workshop/ui";
import { WarnBanner } from "../ui";
import {
    parseHeaderRow,
    positionalMap,
    validateHeaders,
} from "#/lib/workshop/csv-schema";
import type { HeaderValidation } from "#/lib/workshop/csv-schema";
import { COLS, FEATURES, formatFeature } from "#/lib/workshop/features";
import type {
    AdminService,
    BalanceReport,
    DatasetInfo,
    ImportInput,
    ImportSource,
} from "#/lib/workshop/admin-service";
import type { RealRow, ServerState } from "#/lib/workshop/types";

export function ImportSection({
    service,
    onDataset,
    onState,
}: {
    service: AdminService;
    onDataset: (d: DatasetInfo | null) => void;
    onState: (s: ServerState) => void;
}) {
    const [source, setSource] = useState<ImportSource>("paste");
    const [csv, setCsv] = useState("");
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<BalanceReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [rows, setRows] = useState<RealRow[]>([]);
    const [confirmClear, setConfirmClear] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const [resetting, setResetting] = useState(false);

    // live header contract check before the import round-trips to the server.
    const check = useMemo<HeaderValidation | null>(() => {
        if (!csv.trim()) return null;
        return validateHeaders(parseHeaderRow(csv));
    }, [csv]);

    const loadRows = useCallback(async () => {
        try {
            setRows(await service.getDataRows());
        } catch {
            /* leave the last-known rows in place on a transient failure */
        }
    }, [service]);

    useEffect(() => {
        loadRows();
    }, [loadRows]);

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            const input: ImportInput = { source, csv };
            const r = await service.importDataset(input);
            setReport(r);
            onDataset(await service.getDataset());
            await loadRows();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Import failed");
        } finally {
            setBusy(false);
        }
    };

    const onFile = (f: File | undefined) => {
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => setCsv(String(reader.result ?? ""));
        reader.readAsText(f);
    };

    const clearAll = async () => {
        setClearing(true);
        setError(null);
        try {
            await service.clearData();
            setReport(null);
            setCsv("");
            onDataset(await service.getDataset());
            await loadRows();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Clear failed");
        } finally {
            setClearing(false);
            setConfirmClear(false);
        }
    };

    const resetDb = async () => {
        setResetting(true);
        setError(null);
        try {
            await service.resetDb();
            setReport(null);
            setCsv("");
            onDataset(await service.getDataset());
            onState(await service.getState()); // phase/reveals reverted to defaults
            await loadRows();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Reset failed");
        } finally {
            setResetting(false);
            setConfirmReset(false);
        }
    };

    const canImport = !busy && !!csv.trim() && !!check?.ok;

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <MicroLabel accent>Setup</MicroLabel>
                    <h2 className="mt-1 font-display text-xl font-semibold text-fg">
                        Phase 0 — Load the survey
                    </h2>
                    <p className="text-sm text-muted">
                        Every other section stays locked until a validated
                        dataset is imported. Export the Google Sheet to CSV and
                        paste or upload it — the server cleans ugly rows and
                        derives the training data.
                    </p>
                </div>
                <GhostButton
                    bordered
                    onClick={() => setShowHelp(true)}
                    className="shrink-0"
                >
                    ? Required columns
                </GhostButton>
            </div>

            <Island className="space-y-4 p-5">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <MicroLabel>Source</MicroLabel>
                        <SegmentedControl<ImportSource>
                            value={source}
                            onChange={setSource}
                            options={[
                                { value: "paste", label: "Paste CSV" },
                                { value: "file", label: "Upload" },
                            ]}
                        />
                    </div>
                </div>

                {source === "paste" && (
                    <textarea
                        value={csv}
                        onChange={(e) => setCsv(e.target.value)}
                        placeholder="SCREEN_AVG,CAFFEINE,…,LABEL_OWL&#10;420,6,…,1"
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
                            : "Choose responses.csv"}
                    </label>
                )}
                {check && (
                    <ColumnCheck check={check} headers={parseHeaderRow(csv)} />
                )}

                {error && <WarnBanner>{error}</WarnBanner>}

                <div className="flex justify-end">
                    <PrimaryButton onClick={run} disabled={!canImport}>
                        {busy ? "Cleaning…" : "Import & clean"}
                    </PrimaryButton>
                </div>
            </Island>

            {report && <BalanceReportView report={report} />}

            <DataTable rows={rows} onRefresh={loadRows} />

            <Island className="space-y-3 border-warning/30 p-5">
                <MicroLabel>Danger zone</MicroLabel>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="max-w-md text-sm text-muted">
                        Clear the imported dataset plus all submissions and fog
                        queries, returning the console to Phase 0. Student
                        accounts and phase state are kept.
                    </p>
                    {confirmClear ? (
                        <div className="flex shrink-0 items-center gap-2">
                            <GhostButton
                                bordered
                                onClick={() => setConfirmClear(false)}
                                disabled={clearing}
                            >
                                Cancel
                            </GhostButton>
                            <button
                                type="button"
                                onClick={clearAll}
                                disabled={clearing}
                                className="rounded-md border border-warning bg-warning/15 px-3 py-1.5 text-sm font-medium text-warning transition-colors hover:bg-warning/25 disabled:opacity-50"
                            >
                                {clearing
                                    ? "Clearing…"
                                    : "Confirm — clear all data"}
                            </button>
                        </div>
                    ) : (
                        <GhostButton
                            bordered
                            onClick={() => setConfirmClear(true)}
                            className="shrink-0 border-warning/40 text-warning hover:text-warning"
                        >
                            Clear all data
                        </GhostButton>
                    )}
                </div>

                <div className="border-t border-warning/20 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <p className="max-w-md text-sm text-muted">
                            <span className="font-medium text-warning">
                                Reset DB — full factory reset.
                            </span>{" "}
                            Deletes every student account, all submissions and
                            fog queries, all datasets, and resets phase/reveal
                            state. The room returns to a fresh boot (Phase 0,
                            all reveals off). This cannot be undone.
                        </p>
                        {confirmReset ? (
                            <div className="flex shrink-0 items-center gap-2">
                                <GhostButton
                                    bordered
                                    onClick={() => setConfirmReset(false)}
                                    disabled={resetting}
                                >
                                    Cancel
                                </GhostButton>
                                <button
                                    type="button"
                                    onClick={resetDb}
                                    disabled={resetting}
                                    className="rounded-md border border-warning bg-warning px-3 py-1.5 text-sm font-semibold text-bg transition-colors hover:bg-warning/85 disabled:opacity-50"
                                >
                                    {resetting
                                        ? "Resetting…"
                                        : "Confirm — reset the entire DB"}
                                </button>
                            </div>
                        ) : (
                            <GhostButton
                                bordered
                                onClick={() => setConfirmReset(true)}
                                className="shrink-0 border-warning/60 text-warning hover:text-warning"
                            >
                                Reset DB
                            </GhostButton>
                        )}
                    </div>
                </div>
            </Island>

            {showHelp && <ImportHelpModal onClose={() => setShowHelp(false)} />}
        </div>
    );
}

/* ---------- live column contract check ---------- */

function ColumnCheck({
    check,
    headers,
}: {
    check: HeaderValidation;
    headers: string[];
}) {
    if (check.format === "positional") {
        return <PositionalCheck check={check} headers={headers} />;
    }
    const items: { code: string; ok: boolean }[] = [
        ...COLS.map((k) => ({
            code: k,
            ok: !check.missingFeatures.includes(k),
        })),
        { code: "LABEL_OWL", ok: !check.missingLabel },
    ];
    return (
        <div className="rounded-md border border-border bg-bg p-3">
            <div className="flex items-center justify-between">
                <MicroLabel>Column check</MicroLabel>
                <span
                    className={`font-mono text-[11px] ${check.ok ? "text-positive" : "text-warning"}`}
                >
                    {check.ok ? "all present ✓" : "incomplete"}
                </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {items.map((it) => (
                    <div key={it.code} className="flex items-center gap-1.5">
                        <span
                            className={`h-2 w-2 shrink-0 rounded-full ${it.ok ? "bg-positive" : "bg-warning"}`}
                        />
                        <span
                            className={`font-mono text-[11px] ${it.ok ? "text-muted" : "text-warning"}`}
                        >
                            {it.code}
                        </span>
                    </div>
                ))}
            </div>
            {check.ambiguous.length > 0 && (
                <div className="mt-3">
                    <WarnBanner>
                        Ambiguous header(s) for {check.ambiguous.join(", ")} —
                        two columns contain the codename. Rename so only one
                        column maps to each.
                    </WarnBanner>
                </div>
            )}
        </div>
    );
}

/* ---------- positional (raw Google-Form) mapping preview ---------- */

function PositionalCheck({
    check,
    headers,
}: {
    check: HeaderValidation;
    headers: string[];
}) {
    const { feats, bedtimeHeader, offset } = positionalMap(headers);
    const clip = (h: string | undefined) =>
        !h ? "—" : h.length > 30 ? h.slice(0, 29) + "…" : h;
    return (
        <div className="rounded-md border border-border bg-bg p-3">
            <div className="flex items-center justify-between">
                <MicroLabel>Column check</MicroLabel>
                <span
                    className={`font-mono text-[11px] ${check.ok ? "text-positive" : "text-warning"}`}
                >
                    {check.ok ? "Google Form detected ✓" : "too few columns"}
                </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
                No codenames found — mapping the {COLS.length} features by{" "}
                <span className="text-fg">column order</span> (Timestamp
                skipped). The label is derived from the average-bedtime column
                via a class-median split; columns past it are ignored.
            </p>
            {check.ok ? (
                <div className="mt-2 space-y-0.5">
                    {COLS.map((k, i) => (
                        <MapRow
                            key={k}
                            col={offset + i + 1}
                            code={k}
                            header={clip(feats[k])}
                        />
                    ))}
                    <MapRow
                        col={offset + COLS.length + 1}
                        code="label (bedtime split)"
                        header={clip(bedtimeHeader ?? undefined)}
                        accent
                    />
                </div>
            ) : (
                <div className="mt-3">
                    <WarnBanner>
                        A raw Google-Form export needs Timestamp + the{" "}
                        {COLS.length} features + the average-bedtime column, in
                        question order.
                    </WarnBanner>
                </div>
            )}
        </div>
    );
}

function MapRow({
    col,
    code,
    header,
    accent,
}: {
    col: number;
    code: string;
    header: string;
    accent?: boolean;
}) {
    return (
        <div className="grid grid-cols-[3rem_10rem_1fr] items-center gap-2 font-mono text-[11px]">
            <span className="text-muted/50">col {col}</span>
            <span className={accent ? "text-accent3" : "text-muted"}>
                {code}
            </span>
            <span className="truncate text-muted/70" title={header}>
                ← {header}
            </span>
        </div>
    );
}

/* ---------- current-data table viewer ---------- */

function DataTable({
    rows,
    onRefresh,
}: {
    rows: RealRow[];
    onRefresh: () => void;
}) {
    const owlName = "owl";
    const earlyName = "early";

    return (
        <Island className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
                <MicroLabel>Current data</MicroLabel>
                <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-muted">
                        {rows.length} rows
                    </span>
                    <GhostButton onClick={onRefresh} className="text-[11px]">
                        ↻ Refresh
                    </GhostButton>
                </div>
            </div>

            {rows.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                    No rows loaded yet — import a survey CSV above.
                </p>
            ) : (
                <div className="max-h-[360px] overflow-auto rounded-md border border-border">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-panel font-mono text-[10px] text-muted uppercase">
                            <tr>
                                <th className="px-2.5 py-2 font-medium">#</th>
                                <th className="px-2.5 py-2 font-medium">
                                    Pseudo
                                </th>
                                {COLS.map((k) => (
                                    <th
                                        key={k}
                                        className="px-2.5 py-2 font-medium"
                                        title={FEATURES[k].name}
                                    >
                                        {k}
                                    </th>
                                ))}
                                <th className="px-2.5 py-2 font-medium">
                                    Label
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50 font-mono">
                            {rows.map((r, i) => (
                                <tr key={r.id} className="hover:bg-panel/40">
                                    <td className="px-2.5 py-1.5 text-muted/60">
                                        {i + 1}
                                    </td>
                                    <td className="px-2.5 py-1.5 whitespace-nowrap text-fg">
                                        {r.pseudo}
                                    </td>
                                    {COLS.map((k) => (
                                        <td
                                            key={k}
                                            className="px-2.5 py-1.5 text-muted"
                                        >
                                            {formatFeature(k, r.feats[k])}
                                        </td>
                                    ))}
                                    <td className="px-2.5 py-1.5">
                                        {r.label === undefined ? (
                                            <span className="text-muted/40">
                                                —
                                            </span>
                                        ) : (
                                            <span
                                                className={
                                                    r.label === 1
                                                        ? "text-accent3"
                                                        : "text-accent2"
                                                }
                                            >
                                                {r.label === 1
                                                    ? owlName
                                                    : earlyName}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Island>
    );
}

/* ---------- balance report ---------- */

function BalanceReportView({ report }: { report: BalanceReport }) {
    const owlName = "owl";
    const earlyName = "early";
    const rMax = Math.max(0.01, ...report.perFeature.map((f) => Math.abs(f.r)));

    return (
        <Island className="space-y-4 p-5">
            <div className="flex items-baseline justify-between">
                <MicroLabel>Balance report</MicroLabel>
                <span className="font-mono text-[11px] text-muted">
                    {report.total} labelled · {report.droppedRows} dropped ·{" "}
                    {report.fixedCells} cells fixed
                </span>
            </div>

            {report.warn && <WarnBanner>{report.warn}</WarnBanner>}

            <div className="grid grid-cols-2 gap-3">
                <CountBar
                    name={owlName}
                    value={report.counts.owl}
                    total={report.total}
                    className="bg-accent3"
                />
                <CountBar
                    name={earlyName}
                    value={report.counts.early}
                    total={report.total}
                    className="bg-accent2"
                />
            </div>

            <div>
                <MicroLabel>
                    Per-feature signal (mean by class · point-biserial r)
                </MicroLabel>
                <div className="mt-2 grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3 border-b border-border/60 pb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted/60">
                    <span>Feature</span>
                    <span className="flex items-center gap-1.5">
                        <span className="text-accent2">{earlyName}</span>
                        <span className="text-muted/40 normal-case">→</span>
                        <span className="text-accent3">{owlName}</span>
                        <span className="ml-1 text-muted/40">mean</span>
                    </span>
                    <span
                        className="text-right"
                        title="point-biserial correlation"
                    >
                        r
                    </span>
                </div>
                <div className="divide-y divide-border/50">
                    {report.perFeature.map((f) => (
                        <div
                            key={f.key}
                            className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3 py-1.5"
                        >
                            <span className="font-mono text-xs text-fg">
                                {f.name}
                            </span>
                            <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
                                <span className="text-accent2">
                                    {f.meanEarly}
                                </span>
                                <span className="text-muted/40">→</span>
                                <span className="text-accent3">
                                    {f.meanOwl}
                                </span>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <div className="h-1.5 w-10 overflow-hidden rounded-full bg-panel">
                                    <div
                                        className={`h-full ${f.r >= 0 ? "bg-accent3" : "bg-accent2"}`}
                                        style={{
                                            width: `${(Math.abs(f.r) / rMax) * 100}%`,
                                        }}
                                    />
                                </div>
                                <span className="w-8 text-right font-mono text-[11px] text-muted">
                                    {f.r}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Island>
    );
}

function CountBar({
    name,
    value,
    total,
    className,
}: {
    name: string;
    value: number;
    total: number;
    className: string;
}) {
    const w = total ? (value / total) * 100 : 0;
    return (
        <div className="rounded-md border border-border bg-bg px-3 py-2.5">
            <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-muted">{name}</span>
                <span className="font-mono text-sm font-semibold text-fg">
                    {value}
                </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel">
                <div
                    className={`h-full ${className}`}
                    style={{ width: `${w}%` }}
                />
            </div>
        </div>
    );
}
