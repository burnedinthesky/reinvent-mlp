/* CSV header contract — the single source of truth shared by the client import
   UI (live column checklist) and the server cleaner (dataset-io.ts). Pure and
   dependency-light (only COLS from features + the FeatureKey type), so it stays
   cheap in the client bundle and unit-tests in isolation.

   The contract (journey A0.2): each survey question's column header must CONTAIN
   its codename. Exact match wins; otherwise a trimmed, case-insensitive substring
   match on the codename maps a Google-Form header like 「螢幕使用 SCREEN_AVG(分/日)」
   to SCREEN_AVG. Two headers matching one codename is ambiguous — a bad export
   must fail loud at rehearsal, not silently mid-camp. */

import { COLS } from "./features";
import type { FeatureKey } from "./types";

/** The single class-label column a codename-format survey must carry. */
export const LABEL_CODENAME = "LABEL_OWL";

/** How a survey CSV's columns are addressed. `codename` = the strict contract
    (each header contains its feature codename). `positional` = a raw Google-Form
    export whose headers are the question sentences — columns are mapped by order
    instead (Timestamp, then the 9 features, then the average-bedtime label). */
export type CsvFormat = "codename" | "positional";

/** Parse just the header row of a CSV (quote/comma aware), so the client can
    validate columns without importing the full dataset-io parser. */
export function parseHeaderRow(text: string): string[] {
    const out: string[] = [];
    let field = "";
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else inQ = false;
            } else field += c;
        } else if (c === '"') inQ = true;
        else if (c === ",") {
            out.push(field);
            field = "";
        } else if (c === "\n" || c === "\r") break;
        else field += c;
    }
    out.push(field);
    return out.map((h) => h.trim());
}

/** Map raw CSV headers → canonical columns. Exact match wins; otherwise a
    case-insensitive substring match on the codename. Two headers matching one
    codename throw. Unmapped codenames fall through (dataset-io median-fills
    them — but validateHeaders below is what rejects a missing required column). */
export function mapHeaders(
    headers: string[]
): Partial<Record<FeatureKey | "LABEL_OWL", string>> {
    const targets = [...COLS, LABEL_CODENAME] as const;
    const out: Partial<Record<(typeof targets)[number], string>> = {};
    const upper = headers.map((h) => h.trim().toUpperCase());
    for (const t of targets) {
        const exact = headers.find((h) => h.trim() === t);
        if (exact !== undefined) {
            out[t] = exact;
            continue;
        }
        const hits = headers.filter((_, i) => upper[i].includes(t));
        if (hits.length > 1) {
            throw new Error(`ambiguous header for ${t}: ${hits.join(" | ")}`);
        }
        if (hits.length === 1) out[t] = hits[0];
    }
    return out;
}

/* ---------- positional (raw Google-Form export) mapping ---------- */

/** `positional` when NO feature codename appears in any header — i.e. a raw
    Google-Form export whose headers are the question sentences. Otherwise the
    strict `codename` contract applies (unchanged behaviour). */
export function detectCsvFormat(headers: string[]): CsvFormat {
    const upper = headers.map((h) => h.trim().toUpperCase());
    const anyCodename = COLS.some((k) => upper.some((h) => h.includes(k)));
    return anyCodename ? "codename" : "positional";
}

export interface PositionalMap {
    /** feature codename → the raw header it reads from (by column order). */
    feats: Partial<Record<FeatureKey, string>>;
    /** the average-bedtime header the class label is derived from (or null). */
    bedtimeHeader: string | null;
    /** 1 when a leading Timestamp column is skipped, else 0. */
    offset: number;
}

/** Map raw headers by position: col 0 = Timestamp (skipped), cols 1..9 = the 9
    features in COLS order, col 10 = the average-bedtime label source. Columns
    past the bedtime column (e.g. latest/earliest) are ignored. */
export function positionalMap(headers: string[]): PositionalMap {
    const offset = /timestamp|時間戳/i.test(headers.at(0) ?? "") ? 1 : 0;
    const feats: Partial<Record<FeatureKey, string>> = {};
    COLS.forEach((k, i) => {
        const h = headers.at(offset + i);
        if (h !== undefined) feats[k] = h;
    });
    return {
        feats,
        bedtimeHeader: headers.at(offset + COLS.length) ?? null,
        offset,
    };
}

/** First numeric token of a cell, honouring the ∞/inf/無 convention. Robust to
    the Google-Form "N + label" option format ("0 沒有開啟勿擾…" → 0). */
export function parseLeadingNum(raw: string | undefined): number | null {
    const s = (raw ?? "").trim();
    if (!s) return null;
    if (s === "∞" || s.toLowerCase() === "inf" || s === "無") return Infinity;
    const m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const v = Number(m[0]);
    return Number.isFinite(v) ? v : null;
}

/** Parse a bedtime cell (`H`, `HH:MM`, `HH:MM:SS`, optional am/pm) into a
    "lateness" score in decimal hours with a noon pivot: times before 12:00 are
    after-midnight, so +24 ranks them later than the same-evening times
    (23:00→23, 00:30→24.5, 02:30→26.5, 04:00→28). null if unparseable. */
export function parseBedtimeLateness(raw: string | undefined): number | null {
    const s = (raw ?? "").trim();
    if (!s) return null;
    const m = s.match(/(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const ap = m.at(3)?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    const t = h + min / 60;
    return h < 12 ? t + 24 : t;
}

export interface HeaderValidation {
    ok: boolean;
    /** how the columns are addressed — drives the import UI + the cleaner. */
    format: CsvFormat;
    /** required feature codenames with no matching header. */
    missingFeatures: FeatureKey[];
    /** the chosen label column is absent. */
    missingLabel: boolean;
    /** codenames matched by more than one header (a bad export). */
    ambiguous: string[];
}

/** One codename's presence: exact header wins; else count substring matches
    (>1 = ambiguous, mirroring mapHeaders' throw condition). */
function presence(
    code: string,
    headers: string[],
    upper: string[]
): true | false | "ambiguous" {
    if (headers.some((h) => h.trim() === code)) return true;
    const hits = upper.filter((h) => h.includes(code)).length;
    if (hits > 1) return "ambiguous";
    return hits === 1;
}

/** Validate a header row against the strict camp contract: all 9 feature
    codenames AND the LABEL_OWL column must be present and unambiguous. */
export function validateHeaders(headers: string[]): HeaderValidation {
    // raw Google-Form export: map by column order, label derived from bedtime.
    // Valid as long as there are enough columns for 9 features + the bedtime one.
    if (detectCsvFormat(headers) === "positional") {
        const { offset } = positionalMap(headers);
        const enough = headers.length >= offset + COLS.length + 1;
        return {
            ok: enough,
            format: "positional",
            missingFeatures: [],
            missingLabel: !enough,
            ambiguous: [],
        };
    }

    const upper = headers.map((h) => h.trim().toUpperCase());
    const missingFeatures: FeatureKey[] = [];
    const ambiguous: string[] = [];

    for (const k of COLS) {
        const p = presence(k, headers, upper);
        if (p === "ambiguous") ambiguous.push(k);
        else if (!p) missingFeatures.push(k);
    }

    const lp = presence(LABEL_CODENAME, headers, upper);
    if (lp === "ambiguous") ambiguous.push(LABEL_CODENAME);
    const missingLabel = lp !== true;

    return {
        ok:
            missingFeatures.length === 0 &&
            !missingLabel &&
            ambiguous.length === 0,
        format: "codename",
        missingFeatures,
        missingLabel,
        ambiguous,
    };
}

/** Human-readable rejection message for a failed validation (server throw + a
    client fallback). Returns null when the headers are valid. */
export function headerErrorMessage(v: HeaderValidation): string | null {
    if (v.ok) return null;
    if (v.format === "positional") {
        return `CSV column check failed — a raw Google-Form export needs Timestamp + the 9 feature columns + the average-bedtime column (≥ ${COLS.length + 1} data columns), in question order.`;
    }
    const parts: string[] = [];
    if (v.missingFeatures.length)
        parts.push(
            `missing feature column(s): ${v.missingFeatures.join(", ")}`
        );
    if (v.missingLabel) parts.push(`missing label column: ${LABEL_CODENAME}`);
    if (v.ambiguous.length)
        parts.push(`ambiguous header(s) for: ${v.ambiguous.join(", ")}`);
    return `CSV column check failed — ${parts.join("; ")}. Each question's header must contain its codename.`;
}
