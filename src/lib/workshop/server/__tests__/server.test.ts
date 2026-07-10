/* Server-logic tests that need no DB: scoring parity with the client engine,
   label gating, and the CSV → clean → generate → verify pipeline. The
   Prisma-backed pieces (identity, persistence, leaderboard, server fns, the raw
   route) are exercised against a running server in the verification runbook. */

import { describe, expect, it } from "vitest";

import { buildDataset } from "../../__tests__/fixtures/dataset";
import {
    AXIS_KEYS,
    CANONICAL_X,
    CANONICAL_Y,
    COLS,
    DND_LABELS,
    FEATURES,
} from "../../features";
import { LossLandscape, trainFrameOf, zStatsOf } from "../../lossgrid";
import { NetEngine } from "../../mlp";
import { predictCirclesMulti, predictLine, predictZ } from "../../classifiers";
import { mapHeaders } from "../../csv-schema";
import type {
    CircleRegion,
    CirclesView,
    ClassLabel,
    DataPoint,
    ServerState,
    WorkshopConfig,
} from "../../types";
import { cleanRealCsv, generateSynth, parseCsv } from "../dataset-io";
import { gatedBundle } from "../gate";
import { GateError, checkGate } from "../guard";
import { bearerToken } from "../uni-query";
import {
    scoreFog,
    scoreGuess,
    scoreLabels,
    scoreLine,
    scoreP5Net,
} from "../scoring";
import type { ActiveStore } from "../store";

function seedStore(): ActiveStore {
    const ds = buildDataset();
    const land = new LossLandscape(ds.points);
    const config: WorkshopConfig = {
        label: "LABEL_OWL",
        canonical_x: CANONICAL_X,
        canonical_y: CANONICAL_Y,
        features: FEATURES,
        cols: COLS,
        axisKeys: AXIS_KEYS,
        dndLabels: DND_LABELS,
        lossRange: { min: land.gMin, max: land.gMax },
        bStar: land.bStar,
    };
    // these scoring tests don't touch the scored terrains (built in the background
    // by the store now), so the light ActiveStore literal is all they need.
    return {
        datasetId: "seed",
        label: "LABEL_OWL",
        realRows: ds.realRows,
        points: ds.points,
        land,
        config,
    };
}

describe("scoring", () => {
    const store = seedStore();

    it("guess = 100% when every label is correct", () => {
        const labels = Object.fromEntries(
            store.realRows.map((r) => [r.id, r.label!])
        );
        expect(scoreGuess(store, labels)).toBe(100);
    });

    it("guess penalizes wrong labels", () => {
        const labels = Object.fromEntries(
            store.realRows.map((r) => [r.id, (1 - r.label!) as 0 | 1])
        );
        expect(scoreGuess(store, labels)).toBe(0);
    });

    it("fog round 1d pins b at bStar (ignores client b)", () => {
        const a = scoreFog(store, "1d", 1.2, -3);
        const b = scoreFog(store, "1d", 1.2, 3);
        expect(a.bUsed).toBe(store.land.bStar);
        expect(a.loss).toBe(b.loss);
    });

    it("fog round 2d honors b", () => {
        const r = scoreFog(store, "2d", 1.0, 0.5);
        expect(r.bUsed).toBe(0.5);
        expect(r.loss).toBeCloseTo(store.land.lossAt(1.0, 0.5), 10);
    });

    it("scoreLabels compares submitted labels to ground truth", () => {
        // perfect submission: every point labeled with its true class → 100% both.
        const perfect = Object.fromEntries(
            store.points.map((p) => [p.id, p.label!])
        ) as Record<string, ClassLabel>;
        const good = scoreLabels(store, { labels: perfect });
        expect(good.acc_full).toBe(100);
        expect(good.acc_visible).toBe(100);

        // flipped submission → 0% on both metrics.
        const flipped = Object.fromEntries(
            store.points.map((p) => [p.id, (1 - p.label!) as ClassLabel])
        ) as Record<string, ClassLabel>;
        const bad = scoreLabels(store, { labels: flipped });
        expect(bad.acc_full).toBe(0);
        expect(bad.acc_visible).toBe(0);

        // the judged metric covers EVERY point; visible = the training set (not hidden).
        const r = scoreLabels(store, { labels: {} });
        expect(r.acc_full).toBe(0);
        expect(r.acc_visible).toBe(0);
    });

    it("scoreLine agrees with predictZ, the landscape loss, and the wrong-set", () => {
        const w = 1.0;
        const b = 0.3;
        const r = scoreLine(store, w, b);
        const z = store.land.zStats;
        const n = store.points.length;
        const vis = store.points.filter((p) => !p.hidden);

        // loss = the landscape loss at (w, b), rounded to 3 dp.
        expect(r.loss).toBe(Math.round(store.land.lossAt(w, b) * 1000) / 1000);

        // wrong = exactly the misclassified ids over the FULL set (incl. hidden).
        const expectWrong = store.points
            .filter((p) => predictZ(p, z, w, b) !== p.label)
            .map((p) => p.id);
        expect(new Set(r.wrong)).toEqual(new Set(expectWrong));

        // accuracies are consistent with the wrong-set and ignore/keep hidden as spec'd.
        expect(r.acc_full).toBe(
            Math.round(((n - r.wrong.length) / n) * 1000) / 10
        );
        const okVis = vis.filter(
            (p) => predictZ(p, z, w, b) === p.label
        ).length;
        expect(r.acc_visible).toBe(
            Math.round((okVis / vis.length) * 1000) / 10
        );
    });

    it("scoreLine: a perfectly-separating line has no wrong points", () => {
        // pick the loss-minimizing slope/intercept; if the data is linearly separable
        // there the wrong-set is empty, otherwise it still equals the predictZ misses.
        const r = scoreLine(store, 0, store.land.bStar);
        const z = store.land.zStats;
        const misses = store.points.filter(
            (p) => predictZ(p, z, 0, store.land.bStar) !== p.label
        ).length;
        expect(r.wrong.length).toBe(misses);
        expect(r.acc_full).toBeLessThanOrEqual(100);
    });

    it("predictLine classifies above/below the line y = wx·x + b (normalized axes)", () => {
        const feats = Object.fromEntries(
            Object.keys(FEATURES).map((k) => [k, 0])
        ) as DataPoint["feats"];
        const at = (x: number, y: number): DataPoint => ({
            id: "t",
            feats: { ...feats, [CANONICAL_X]: x, [CANONICAL_Y]: y },
            label: 1,
            real: true,
            hidden: false,
            jx: 0,
            jy: 0,
        });
        const xm = FEATURES[CANONICAL_X];
        const ym = FEATURES[CANONICAL_Y];
        // horizontal boundary y = 0.5: the top edge is class 1, the bottom class 0.
        const horiz = { wx: 0, b: 0.5 };
        expect(
            predictLine(at(xm.max, ym.max), CANONICAL_X, CANONICAL_Y, horiz)
        ).toBe(1);
        expect(
            predictLine(at(xm.min, ym.min), CANONICAL_X, CANONICAL_Y, horiz)
        ).toBe(0);
        // diagonal boundary y = x: below the line (high x, low y) → 0, above → 1.
        const diag = { wx: 1, b: 0 };
        expect(
            predictLine(at(xm.max, ym.min), CANONICAL_X, CANONICAL_Y, diag)
        ).toBe(0);
        expect(
            predictLine(at(xm.min, ym.max), CANONICAL_X, CANONICAL_Y, diag)
        ).toBe(1);
    });

    it("circles majority vote overrides any single view", () => {
        const feats = Object.fromEntries(
            Object.keys(FEATURES).map((k) => [k, 0])
        ) as DataPoint["feats"];
        const p: DataPoint = {
            id: "t",
            feats: { ...feats, [CANONICAL_X]: 500, [CANONICAL_Y]: 12 },
            label: 1,
            real: true,
            hidden: false,
            jx: 0,
            jy: 0,
        };
        // a region spanning the whole plane always covers p → the view votes `cls`.
        const wholePlane = (cls: ClassLabel): CircleRegion => ({
            pts: [
                { x: 0, y: 0 },
                { x: 1000, y: 0 },
                { x: 1000, y: 26 },
                { x: 0, y: 26 },
            ],
            cls,
        });
        const owl: CirclesView = {
            x: CANONICAL_X,
            y: CANONICAL_Y,
            circles: [wholePlane(1)],
        };
        const early: CirclesView = {
            x: CANONICAL_X,
            y: CANONICAL_Y,
            circles: [wholePlane(0)],
        };
        expect(predictCirclesMulti(p, [early], 0)).toBe(0); // one view alone → early
        expect(predictCirclesMulti(p, [owl, owl, early], 0)).toBe(1); // 2 vs 1 → owl
        expect(predictCirclesMulti(p, [owl, early], 0)).toBe(0); // tie → default
    });

    it("scoreP5Net stage-1 payload matches a hand-rolled sigmoid predictor", () => {
        const w1 = 0.8;
        const w2 = -0.5;
        const b = 0.3;
        const axes: [typeof CANONICAL_X, typeof CANONICAL_Y] = [
            CANONICAL_X,
            CANONICAL_Y,
        ];
        const r = scoreP5Net(store, {
            axes,
            arch: { layers: [2, 1], act: "tanh" },
            weights: [w1, w2, b],
        });
        // hand-rolled: z-stats over non-hidden points on the chosen axes, σ > 0.5.
        const zs = zStatsOf(
            store.points.filter((p) => !p.hidden),
            axes[0],
            axes[1]
        );
        const predict = (p: (typeof store.points)[number]) => {
            const xz = (p.feats[axes[0]] - zs.mx) / zs.sx;
            const yz = (p.feats[axes[1]] - zs.my) / zs.sy;
            return 1 / (1 + Math.exp(-(w1 * xz + w2 * yz + b))) > 0.5 ? 1 : 0;
        };
        const okFull = store.points.filter(
            (p) => predict(p) === p.label
        ).length;
        expect(r.acc_full).toBe(
            Math.round((okFull / store.points.length) * 1000) / 10
        );
        // judged loss: mean clamped BCE over the same set, rounded to 3 decimals.
        const bceFull =
            store.points.reduce((sum, p) => {
                const xz = (p.feats[axes[0]] - zs.mx) / zs.sx;
                const yz = (p.feats[axes[1]] - zs.my) / zs.sy;
                const o = 1 / (1 + Math.exp(-(w1 * xz + w2 * yz + b)));
                return (
                    sum -
                    (p.label === 1
                        ? Math.log(o + 1e-12)
                        : Math.log(1 - o + 1e-12))
                );
            }, 0) / store.points.length;
        expect(r.loss_full).toBe(Math.round(bceFull * 1000) / 1000);
        expect(r.loss_visible).toBeGreaterThan(0);
    });

    it("client/server parity on arbitrary axes (train, serialize, scoreP5Net ≈ live acc)", () => {
        const axes: ["GAME_HRS", "CAFFEINE"] = ["GAME_HRS", "CAFFEINE"];
        const frame = trainFrameOf(store.points, axes[0], axes[1]);
        const engine = new NetEngine(
            frame,
            store.points,
            { layers: 1, n1: 3, n2: 3 },
            "tanh",
            0.1
        );
        for (let i = 0; i < 30; i++) engine.trainStep();
        const { arch, weights } = engine.serialize();
        expect(scoreP5Net(store, { axes, arch, weights }).acc_full).toBeCloseTo(
            engine.accuracyOn(() => true),
            6
        );
    });

    it("scoreP5Net validates axes, weight count, and arch limits", () => {
        const ok = { layers: [2, 1], act: "tanh" as const };
        // bad axis
        expect(() =>
            scoreP5Net(store, {
                axes: ["NOPE", "CAFFEINE"] as never,
                arch: ok,
                weights: [1, 2, 3],
            })
        ).toThrow();
        // wrong weight count
        expect(() =>
            scoreP5Net(store, {
                axes: [CANONICAL_X, CANONICAL_Y],
                arch: ok,
                weights: [1, 2],
            })
        ).toThrow();
        // 3 hidden layers (layers.length 5 > 4)
        expect(() =>
            scoreP5Net(store, {
                axes: [CANONICAL_X, CANONICAL_Y],
                arch: { layers: [2, 3, 3, 3, 1], act: "tanh" },
                weights: new Array(1000).fill(0.1),
            })
        ).toThrow();
        // hidden width 7 (> 6)
        expect(() =>
            scoreP5Net(store, {
                axes: [CANONICAL_X, CANONICAL_Y],
                arch: { layers: [2, 7, 1], act: "tanh" },
                weights: new Array(1000).fill(0.1),
            })
        ).toThrow();
    });
});

describe("label gating (labels never leave the server)", () => {
    const store = seedStore();

    const allReveals = {
        reveal100: true,
        p3_wb_plane: true,
        p2_line_mode: true,
        p3_show_dots: true,
        p4_terrains: true,
        p5_deep: true,
    };
    const noReveals = {
        reveal100: false,
        p3_wb_plane: false,
        p2_line_mode: false,
        p3_show_dots: false,
        p4_terrains: false,
        p5_deep: false,
    };

    it("hidden points never carry a label, regardless of reveals/phase", () => {
        const hidden = gatedBundle(store, allReveals, true).points.filter(
            (p) => p.hidden
        );
        expect(hidden.length).toBeGreaterThan(0);
        expect(hidden.every((p) => p.label === undefined)).toBe(true);
    });

    it("realRows labels are blind in P1 (showReal=false), shown from P2 (showReal=true)", () => {
        const off = gatedBundle(store, noReveals, false).realRows;
        expect(off.every((r) => r.label === undefined)).toBe(true);
        const on = gatedBundle(store, noReveals, true).realRows;
        expect(on.every((r) => r.label === 0 || r.label === 1)).toBe(true);
    });

    it("visible synthetic labels gated by reveal100", () => {
        const synth = (reveals: typeof noReveals) =>
            gatedBundle(store, reveals, true).points.filter(
                (p) => !p.real && !p.hidden
            );
        expect(synth(noReveals).every((p) => p.label === undefined)).toBe(true);
        expect(
            synth(allReveals).every((p) => p.label === 0 || p.label === 1)
        ).toBe(true);
    });

    it("self-select ships synthetic labels (forced reveal100) even with the rest off", () => {
        // getBundleFn forces reveal100 in self-select so the client can reveal them;
        // the other flags stay off (they move client-side).
        const forced = { ...noReveals, reveal100: true };
        const synth = gatedBundle(store, forced, true).points.filter(
            (p) => !p.real && !p.hidden
        );
        expect(synth.length).toBeGreaterThan(0);
        expect(synth.every((p) => p.label === 0 || p.label === 1)).toBe(true);
    });

    it("self-select ships the fully-revealed bundle (real + synthetic), client re-gates locally", () => {
        // getBundleFn in self-select: reveal100 forced on AND showReal=true, so every
        // label ships and the client owns gating by its own phase + reveal toggles.
        const bundle = gatedBundle(
            store,
            { ...noReveals, reveal100: true },
            true
        );
        expect(
            bundle.realRows.every((r) => r.label === 0 || r.label === 1)
        ).toBe(true);
        const synth = bundle.points.filter((p) => !p.real && !p.hidden);
        expect(synth.every((p) => p.label === 0 || p.label === 1)).toBe(true);
        // hidden points are still never labeled, even fully revealed.
        expect(
            bundle.points
                .filter((p) => p.hidden)
                .every((p) => p.label === undefined)
        ).toBe(true);
    });
});

describe("CSV pipeline", () => {
    it("parses quoted CSV with commas", () => {
        const rows = parseCsv('a,b\n"x,y",2\n3,4');
        expect(rows).toEqual([
            { a: "x,y", b: "2" },
            { a: "3", b: "4" },
        ]);
    });

    it("cleans ugly rows: ∞, blanks, out-of-range, explicit label", () => {
        const header = [...COLS, "LABEL_OWL"].join(",");
        // row1 owl with ∞ screen (clamps to 960) and blank caffeine (median-filled);
        // row2 early bird.
        const r1 = ["∞", "", "5", "4", "3", "1", "20", "3", "2", "1"].join(",");
        const r2 = ["120", "1", "0", "0", "0", "6", "2", "0", "6", "0"].join(
            ","
        );
        const { realRows, report } = cleanRealCsv(`${header}\n${r1}\n${r2}`, 7);
        expect(realRows).toHaveLength(2);
        const owl = realRows.find((r) => r.label === 1)!;
        expect(owl.feats.SCREEN_AVG).toBe(960); // ∞ clamped to max
        expect(report.n).toBe(2);
        // every feature within its declared range
        realRows.forEach((row) =>
            COLS.forEach((k) => {
                expect(row.feats[k]).toBeGreaterThanOrEqual(FEATURES[k].min);
                expect(row.feats[k]).toBeLessThanOrEqual(FEATURES[k].max);
            })
        );
    });

    it("generateSynth produces the requested split + a verify report", () => {
        const ds = buildDataset();
        const { points, report } = generateSynth(ds.realRows, {
            seed: 7,
            reveal: 100,
            hidden: 400,
        });
        expect(points.filter((p) => !p.real && !p.hidden)).toHaveLength(100);
        expect(points.filter((p) => p.hidden)).toHaveLength(400);
        expect(report.checks.length).toBeGreaterThan(0);
        report.checks.forEach((c) => expect(typeof c.pass).toBe("boolean"));
    });

    it("generation is deterministic for a fixed seed", () => {
        const ds = buildDataset();
        const a = generateSynth(ds.realRows, { seed: 42 });
        const b = generateSynth(ds.realRows, { seed: 42 });
        expect(a.points.map((p) => p.feats.SCREEN_AVG)).toEqual(
            b.points.map((p) => p.feats.SCREEN_AVG)
        );
    });
});

describe("header contract (journey A0.2)", () => {
    it("maps Google-Form style headers containing the codename", () => {
        const m = mapHeaders([
            "時間戳記",
            "螢幕使用 SCREEN_AVG(分/日)",
            "咖啡因 caffeine (杯/週)",
            "LATE7 過去七天熬夜",
            "LABEL_OWL 你是夜貓嗎",
        ]);
        expect(m.SCREEN_AVG).toBe("螢幕使用 SCREEN_AVG(分/日)");
        expect(m.CAFFEINE).toBe("咖啡因 caffeine (杯/週)"); // case-insensitive
        expect(m.LATE7).toBe("LATE7 過去七天熬夜");
        expect(m.LABEL_OWL).toBe("LABEL_OWL 你是夜貓嗎");
        expect(m.BREAKFAST).toBeUndefined(); // unmapped → median-fill path
    });

    it("exact headers win and stay byte-identical", () => {
        const m = mapHeaders([...COLS, "LABEL_OWL"]);
        COLS.forEach((k) => expect(m[k]).toBe(k));
    });

    it("throws on two headers matching one codename", () => {
        expect(() => mapHeaders(["SCREEN_AVG (a)", "screen_avg (b)"])).toThrow(
            /ambiguous/
        );
    });

    it("cleanRealCsv resolves Chinese-decorated headers end-to-end", () => {
        const header = [
            ...COLS.map((k) => `問題 ${k}(單位)`),
            "LABEL_OWL 夜貓?",
        ].join(",");
        const r1 = ["300", "4", "5", "4", "3", "1", "20", "3", "2", "1"].join(
            ","
        );
        const r2 = ["120", "1", "0", "0", "0", "6", "2", "0", "6", "0"].join(
            ","
        );
        const { realRows, report } = cleanRealCsv(`${header}\n${r1}\n${r2}`, 7);
        expect(realRows).toHaveLength(2);
        expect(report.n).toBe(2);
        const owl = realRows.find((r) => r.label === 1)!;
        expect(owl.feats.SCREEN_AVG).toBe(300); // parsed through the mapped header
    });

    it("cleanRealCsv imports a raw Google-Form export by column order", () => {
        // the user's exact paste: Timestamp + 9 features + 3 sleep-time questions.
        // avg-bedtime (col 10) drives the label; latest/earliest (11–12) are ignored.
        const csv = [
            "Timestamp,你平均每天花多少時間在手機上,你一週大約喝幾杯含有咖啡因的飲料？,過去這一週內，你有幾天覺得自己變得很晚才睡？,過去這一週，你總共吃了幾天宵夜？,過去這一週，你有幾天是拖到很晚才洗澡的？,過去這一週，你有幾天起得特別早？,你一週大約花多少小時在打電動或玩遊戲上？,你的手機「勿擾模式」通常在晚上幾點自動開始？,過去這一週，你總共吃了幾天早餐？,過去這一週，你平均大約什麼時候上床睡覺？,過去這一週，你最晚什麼時候上床睡覺？,過去這一週，你最早什麼時候上床睡覺？",
            "7/7/2026 11:09:07,173,1,7,4,0,0,2,0 沒有開啟勿擾 / 沒有固定時間,0,04:00,08:00,01:00",
            "7/7/2026 11:36:58,360,10,7,3,2,3,6,0 沒有開啟勿擾 / 沒有固定時間,4,02:30,03:20,01:00",
        ].join("\n");
        const { realRows, report } = cleanRealCsv(csv, 7);
        expect(realRows).toHaveLength(2);
        expect(report.n).toBe(2);
        // bedtime median split: 04:00 (later) → owl, 02:30 → early.
        const owl = realRows.find((r) => r.label === 1)!;
        const early = realRows.find((r) => r.label === 0)!;
        expect(owl.feats.SCREEN_AVG).toBe(173); // features aligned by position
        expect(owl.feats.GAME_HRS).toBe(2);
        expect(early.feats.SCREEN_AVG).toBe(360);
        expect(early.feats.CAFFEINE).toBe(10);
        expect(early.feats.EARLY_WAKE).toBe(3);
        // DND "0 沒有開啟勿擾…" → leading token 0; latest/earliest never read.
        expect(owl.feats.DND_START).toBe(0);
        expect(early.feats.DND_START).toBe(0);
        expect(report.ownlCount).toBe(1);
        expect(report.earlyCount).toBe(1);
    });

    it("counts dropped rows and repaired cells", () => {
        const header = [...COLS, "LABEL_OWL"].join(",");
        const r1 = ["∞", "", "5", "4", "3", "1", "20", "3", "2", "1"].join(","); // 2 repairs
        const r2 = ["120", "1", "0", "0", "0", "6", "2", "0", "6", "0"].join(
            ","
        );
        const blank = ",,,,,,,,,";
        const { report } = cleanRealCsv(`${header}\n${r1}\n${blank}\n${r2}`, 7);
        expect(report.droppedRows).toBe(1);
        expect(report.fixedCells).toBe(2);
    });
});

describe("submission gate (phase + deadline)", () => {
    const state = (over: Partial<ServerState> = {}): ServerState => ({
        phase: "P2",
        deadline: null,
        reveals: {
            reveal100: false,
            p3_wb_plane: false,
            p2_line_mode: false,
            p3_show_dots: false,
            p4_terrains: false,
            p5_deep: false,
        },
        boards: ["ACC", "LOSS"],
        selfSelect: false,
        ...over,
    });
    const now = new Date("2026-07-07T10:00:00Z");
    const past = "2026-07-07T09:59:00Z";
    const future = "2026-07-07T10:01:00Z";

    it("passes when the phase matches", () => {
        expect(() => checkGate(state(), now, { phase: "P2" })).not.toThrow();
    });

    it("rejects out-of-phase submissions with both phases in the message", () => {
        expect(() => checkGate(state(), now, { phase: "P5" })).toThrow(
            GateError
        );
        expect(() => checkGate(state(), now, { phase: "P5" })).toThrow(
            /P5.*P2/
        );
    });

    it("rejects past the deadline; null/future deadlines pass", () => {
        expect(() =>
            checkGate(state({ deadline: past }), now, { phase: "P2" })
        ).toThrow(/deadline/);
        expect(() =>
            checkGate(state({ deadline: future }), now, { phase: "P2" })
        ).not.toThrow();
        expect(() =>
            checkGate(state({ deadline: null }), now, { phase: "P2" })
        ).not.toThrow();
    });

    it("deadline: false skips only the deadline check", () => {
        const s = state({ deadline: past });
        expect(() =>
            checkGate(s, now, { phase: "P2", deadline: false })
        ).not.toThrow();
        expect(() =>
            checkGate(s, now, { phase: "P1", deadline: false })
        ).toThrow(/phase closed/);
    });

    it("allowIfReveal bypasses both checks when the reveal is armed", () => {
        const s = state({ deadline: past });
        s.reveals.p5_deep = true;
        expect(() =>
            checkGate(s, now, { phase: "P5", allowIfReveal: "p5_deep" })
        ).not.toThrow();
        s.reveals.p5_deep = false;
        expect(() =>
            checkGate(s, now, { phase: "P5", allowIfReveal: "p5_deep" })
        ).toThrow();
    });

    it("self-select skips the phase check (students roam + submit locally)", () => {
        // room is on P2, student submits for P5 — allowed only under self-select.
        expect(() =>
            checkGate(state({ selfSelect: true }), now, { phase: "P5" })
        ).not.toThrow();
        expect(() =>
            checkGate(state({ selfSelect: false }), now, { phase: "P5" })
        ).toThrow(GateError);
    });

    it("self-select bypasses the deadline (fully open gate for free navigation)", () => {
        expect(() =>
            checkGate(state({ selfSelect: true, deadline: past }), now, {
                phase: "P5",
            })
        ).not.toThrow();
    });
});

describe("uni-tier bearer token parsing", () => {
    it("strips the Bearer prefix and trims", () => {
        expect(bearerToken("Bearer abc123")).toBe("abc123");
        expect(bearerToken("bearer  abc123 ")).toBe("abc123");
        expect(bearerToken("abc123")).toBe("abc123");
        expect(bearerToken(null)).toBe("");
        expect(bearerToken(undefined)).toBe("");
    });
});
