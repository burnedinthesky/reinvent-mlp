/* Shape adapters between the server wire types and the console seam — the
   field-renaming/rescaling layer HttpAdminService rides on. Pure, no DB. */

import { describe, expect, it } from "vitest";

import { adaptBalance, adaptGenerate, adaptStats } from "../admin-adapters";
import type {
    AdminStats,
    BalanceReport,
    GenerateReport,
    HistBucket,
} from "../types";

describe("adaptBalance", () => {
    const server: BalanceReport = {
        n: 48,
        ownlCount: 25,
        earlyCount: 23,
        balanced: true,
        warning: null,
        features: [{ key: "LATE7", meanClass0: 1.2, meanClass1: 4.8, r: 0.55 }],
        droppedRows: 2,
        fixedCells: 7,
    };

    it("renames every field and derives minority", () => {
        const ui = adaptBalance(server);
        expect(ui.total).toBe(48);
        expect(ui.counts).toEqual({ owl: 25, early: 23 });
        expect(ui.minority).toBe(23);
        expect(ui.warn).toBeNull();
        expect(ui.perFeature).toEqual([
            {
                key: "LATE7",
                name: "晚睡天數",
                meanEarly: 1.2,
                meanOwl: 4.8,
                r: 0.55,
            },
        ]);
        expect(ui.droppedRows).toBe(2);
        expect(ui.fixedCells).toBe(7);
    });

    it("defaults hygiene counts to 0 when the server omits them", () => {
        const ui = adaptBalance({
            ...server,
            droppedRows: undefined,
            fixedCells: undefined,
        });
        expect(ui.droppedRows).toBe(0);
        expect(ui.fixedCells).toBe(0);
    });
});

describe("adaptGenerate", () => {
    const server: GenerateReport = {
        strategy: "wedge",
        seed: 7,
        synthCount: 500,
        revealCount: 100,
        hiddenCount: 400,
        passedAll: false,
        checks: [
            {
                name: "one-line ceiling",
                value: 0.85,
                lo: 0.83,
                hi: 0.87,
                pass: true,
                hint: "",
            },
            {
                name: "max solo-feature AUC",
                value: 0.9,
                lo: 0,
                hi: 0.85,
                pass: false,
                hint: "raise noise",
            },
            {
                name: "signal features (AUC≥.62)",
                value: 7,
                lo: 6,
                hi: Infinity,
                pass: true,
                hint: "",
            },
        ],
    };

    it("scales fraction checks to percents, passes AUC/count through", () => {
        const ui = adaptGenerate(server);
        expect(ui.checks[0]).toEqual({
            name: "one-line ceiling",
            value: 85,
            unit: "%",
            band: [83, 87],
            pass: true,
            knobHint: undefined,
        });
        expect(ui.checks[1].unit).toBe("auc");
        expect(ui.checks[1].value).toBe(0.9);
        expect(ui.checks[1].knobHint).toBe("raise noise");
        expect(ui.checks[2].unit).toBe("n");
        expect(ui.checks[2].band).toEqual([6, Infinity]); // Infinity band preserved
    });

    it("maps passedAll → allPass and defaults preview to empty", () => {
        const ui = adaptGenerate(server);
        expect(ui.allPass).toBe(false);
        expect(ui.preview).toEqual([]);
        expect(ui.iterations).toBe(1); // one failing check
        expect(adaptGenerate({ ...server, passedAll: true }).iterations).toBe(
            1
        );
    });

    it("carries the server preview through", () => {
        const ui = adaptGenerate({
            ...server,
            preview: [{ x: 1, y: -1, cls: 1 }],
        });
        expect(ui.preview).toEqual([{ x: 1, y: -1, cls: 1 }]);
    });
});

describe("adaptStats", () => {
    const hist = (counts: number[]): HistBucket[] =>
        counts.map((count, i) => ({ lo: i * 10, hi: (i + 1) * 10, count }));
    const server: AdminStats = {
        studentCount: 44,
        perPhase: [
            {
                phase: "P1",
                submissions: 90,
                participants: 45,
                scoreHist: hist([1, 2, 3]),
                best: 95,
            },
            {
                phase: "P2",
                submissions: 0,
                participants: 0,
                scoreHist: [],
                best: null,
            },
            {
                phase: "API",
                submissions: 10,
                participants: 2,
                scoreHist: hist([5]),
                best: 0.4,
            },
        ],
        acc: [{ rank: 1, name: "a", value: 95, tag: "P1" }],
        loss: [{ rank: 1, name: "b", value: 0.4, tag: "⌨️" }],
    };

    it("renames fields, derives avg attempts, attaches caps (incl. API)", () => {
        const ui = adaptStats(server, "P1");
        expect(ui.students).toBe(44);
        expect(ui.perPhase[0]).toEqual({
            phase: "P1",
            subs: 90,
            used: 2,
            cap: 3,
        });
        expect(ui.perPhase[1]).toEqual({
            phase: "P2",
            subs: 0,
            used: 0,
            cap: 10,
        });
        expect(ui.perPhase[2]).toEqual({
            phase: "API",
            subs: 10,
            used: 5,
            cap: 100,
        });
        expect(ui.accBoard).toBe(server.acc);
        expect(ui.lossBoard).toBe(server.loss);
    });

    it("picks the current ACC phase histogram, padded to 10 buckets", () => {
        const ui = adaptStats(server, "P1");
        expect(ui.scoreHist).toEqual([1, 2, 3, 0, 0, 0, 0, 0, 0, 0]);
    });

    it("falls back to the latest ACC phase with data when current has none", () => {
        const ui = adaptStats(server, "P2"); // P2 empty → falls back to P1
        expect(ui.scoreHist).toEqual([1, 2, 3, 0, 0, 0, 0, 0, 0, 0]);
        const uiLoss = adaptStats(server, "P3"); // LOSS phase → same ACC fallback
        expect(uiLoss.scoreHist).toEqual([1, 2, 3, 0, 0, 0, 0, 0, 0, 0]);
    });
});
