/* The CSV header contract shared by the import UI + server cleaner. Pure. */

import { describe, expect, it } from "vitest";

import {
    detectCsvFormat,
    headerErrorMessage,
    mapHeaders,
    parseBedtimeLateness,
    parseHeaderRow,
    parseLeadingNum,
    positionalMap,
    validateHeaders,
} from "../csv-schema";

const FEATURES9 = [
    "SCREEN_AVG",
    "CAFFEINE",
    "LATE7",
    "SNACK_DAYS",
    "LATE_SHOWER",
    "EARLY_WAKE",
    "GAME_HRS",
    "DND_START",
    "BREAKFAST",
];

describe("parseHeaderRow", () => {
    it("splits the first line, trims cells, and stops at the newline", () => {
        expect(parseHeaderRow("A, B ,C\n1,2,3")).toEqual(["A", "B", "C"]);
    });

    it("honours quoted commas", () => {
        expect(parseHeaderRow('"a,b",c')).toEqual(["a,b", "c"]);
    });
});

describe("validateHeaders", () => {
    it("accepts all 9 features + LABEL_OWL", () => {
        const v = validateHeaders([...FEATURES9, "LABEL_OWL"]);
        expect(v.ok).toBe(true);
        expect(v.missingFeatures).toEqual([]);
        expect(v.missingLabel).toBe(false);
    });

    it("accepts Google-Form headers that merely contain the codename", () => {
        const headers = [
            ...FEATURES9.map((c) => `問題 ${c} (單位)`),
            "你的類型 LABEL_OWL",
        ];
        const v = validateHeaders(headers);
        expect(v.ok).toBe(true);
    });

    it("flags a missing feature column", () => {
        const headers = [
            ...FEATURES9.filter((c) => c !== "CAFFEINE"),
            "LABEL_OWL",
        ];
        const v = validateHeaders(headers);
        expect(v.ok).toBe(false);
        expect(v.missingFeatures).toEqual(["CAFFEINE"]);
        expect(v.missingLabel).toBe(false);
    });

    it("flags a missing label column (strict — no auto-derive)", () => {
        const v = validateHeaders(FEATURES9);
        expect(v.ok).toBe(false);
        expect(v.missingLabel).toBe(true);
    });

    it("flags ambiguous headers (two contain one codename)", () => {
        // no exact 'SCREEN_AVG' — two headers each merely contain it
        const others = FEATURES9.filter((c) => c !== "SCREEN_AVG");
        const headers = [
            ...others,
            "LABEL_OWL",
            "raw SCREEN_AVG",
            "clean SCREEN_AVG",
        ];
        const v = validateHeaders(headers);
        expect(v.ok).toBe(false);
        expect(v.ambiguous).toContain("SCREEN_AVG");
    });

    it("lets an exact header win over duplicate substring matches", () => {
        // exact 'SCREEN_AVG' present → not ambiguous even with an extra containing one
        const headers = [...FEATURES9, "LABEL_OWL", "raw SCREEN_AVG data"];
        const v = validateHeaders(headers);
        expect(v.ambiguous).not.toContain("SCREEN_AVG");
        expect(v.ok).toBe(true);
    });
});

describe("headerErrorMessage", () => {
    it("is null when valid", () => {
        const v = validateHeaders([...FEATURES9, "LABEL_OWL"]);
        expect(headerErrorMessage(v)).toBeNull();
    });

    it("lists the problems when invalid", () => {
        const v = validateHeaders(FEATURES9);
        const msg = headerErrorMessage(v);
        expect(msg).toContain("LABEL_OWL");
    });
});

/* ---------- raw Google-Form (positional) path ---------- */

// the user's actual form: Timestamp + 9 feature questions + 3 sleep-time
// questions (avg bedtime = the label source; latest/earliest are ignored).
const GFORM_HEADERS = [
    "Timestamp",
    "你平均每天花多少時間在手機上",
    "你一週大約喝幾杯含有咖啡因的飲料？",
    "過去這一週內，你有幾天覺得自己變得很晚才睡？",
    "過去這一週，你總共吃了幾天宵夜？",
    "過去這一週，你有幾天是拖到很晚才洗澡的？",
    "過去這一週，你有幾天起得特別早？",
    "你一週大約花多少小時在打電動或玩遊戲上？",
    "你的手機「勿擾模式」通常在晚上幾點自動開始？",
    "過去這一週，你總共吃了幾天早餐？",
    "過去這一週，你平均大約什麼時候上床睡覺？",
    "過去這一週，你最晚什麼時候上床睡覺？",
    "過去這一週，你最早什麼時候上床睡覺？",
];

describe("detectCsvFormat", () => {
    it("is codename when any header contains a codename", () => {
        expect(detectCsvFormat([...FEATURES9, "LABEL_OWL"])).toBe("codename");
        expect(detectCsvFormat(["問題 SCREEN_AVG (單位)"])).toBe("codename");
    });

    it("is positional for a raw Google-Form export", () => {
        expect(detectCsvFormat(GFORM_HEADERS)).toBe("positional");
    });
});

describe("positionalMap", () => {
    it("skips Timestamp and maps by column order", () => {
        const m = positionalMap(GFORM_HEADERS);
        expect(m.offset).toBe(1);
        expect(m.feats.SCREEN_AVG).toBe("你平均每天花多少時間在手機上");
        expect(m.feats.DND_START).toBe(
            "你的手機「勿擾模式」通常在晚上幾點自動開始？"
        );
        expect(m.feats.BREAKFAST).toBe("過去這一週，你總共吃了幾天早餐？");
        expect(m.bedtimeHeader).toBe(
            "過去這一週，你平均大約什麼時候上床睡覺？"
        );
    });

    it("uses offset 0 when there is no Timestamp column", () => {
        const m = positionalMap(["q1", "q2"]);
        expect(m.offset).toBe(0);
        expect(m.feats.SCREEN_AVG).toBe("q1");
    });
});

describe("parseLeadingNum", () => {
    it('reads plain numbers and the leading token of "N + label" options', () => {
        expect(parseLeadingNum("173")).toBe(173);
        expect(parseLeadingNum("0 沒有開啟勿擾 / 沒有固定時間")).toBe(0);
        expect(parseLeadingNum("3 23–0 點")).toBe(3); // trailing digits ignored
        expect(parseLeadingNum("-2")).toBe(-2);
        expect(parseLeadingNum("2.5")).toBe(2.5);
    });

    it("honours the ∞/inf/無 convention and blanks", () => {
        expect(parseLeadingNum("∞")).toBe(Infinity);
        expect(parseLeadingNum("無")).toBe(Infinity);
        expect(parseLeadingNum("")).toBeNull();
        expect(parseLeadingNum("abc")).toBeNull();
    });
});

describe("parseBedtimeLateness", () => {
    it("maps after-midnight times later than same-evening ones (noon pivot)", () => {
        expect(parseBedtimeLateness("23:00")).toBe(23);
        expect(parseBedtimeLateness("01:00")).toBe(25);
        expect(parseBedtimeLateness("02:30")).toBe(26.5);
        expect(parseBedtimeLateness("04:00")).toBe(28);
        const order = ["23:00", "01:00", "02:30", "04:00"].map((t) =>
            parseBedtimeLateness(t)!
        );
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it("tolerates am/pm and returns null on junk", () => {
        expect(parseBedtimeLateness("12:00 AM")).toBe(24);
        expect(parseBedtimeLateness("11:30 PM")).toBe(23.5);
        expect(parseBedtimeLateness("")).toBeNull();
        expect(parseBedtimeLateness("nope")).toBeNull();
    });
});

describe("validateHeaders — positional", () => {
    it("accepts a raw Google-Form export (label derived from bedtime)", () => {
        const v = validateHeaders(GFORM_HEADERS);
        expect(v.format).toBe("positional");
        expect(v.ok).toBe(true);
    });

    it("rejects a positional export with too few columns", () => {
        const v = validateHeaders(["Timestamp", "q1", "q2"]);
        expect(v.format).toBe("positional");
        expect(v.ok).toBe(false);
        expect(headerErrorMessage(v)).toContain("question order");
    });
});

describe("mapHeaders (moved intact)", () => {
    it("maps by exact + substring and throws on ambiguity", () => {
        const m = mapHeaders(["問題 SCREEN_AVG", "CAFFEINE", "LABEL_OWL"]);
        expect(m.SCREEN_AVG).toBe("問題 SCREEN_AVG");
        expect(m.CAFFEINE).toBe("CAFFEINE");
        expect(() => mapHeaders(["a SCREEN_AVG", "b SCREEN_AVG"])).toThrow(
            /ambiguous/
        );
    });
});
