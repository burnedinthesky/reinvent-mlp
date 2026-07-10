import { describe, expect, it } from "vitest";

import { circlesAccuracy } from "../classifiers";
import { buildDataset } from "./fixtures/dataset";
import { LossLandscape, trainFrameOf, zStatsOf } from "../lossgrid";
import { NetEngine } from "../mlp";
import { neuronBce, singleNeuronView } from "../neuron";
import { CANONICAL_X, CANONICAL_Y } from "../features";

describe("dataset", () => {
    it("is deterministic and well-shaped", () => {
        const a = buildDataset();
        const b = buildDataset();
        expect(a.realRows).toHaveLength(48);
        expect(a.points).toHaveLength(208);
        expect(a.points.filter((p) => p.hidden)).toHaveLength(60);
        expect(a.points.filter((p) => !p.hidden)).toHaveLength(148);
        // same seed → identical first row features
        expect(a.realRows[0].feats).toEqual(b.realRows[0].feats);
        expect(a.realRows.filter((r) => r.label === 1)).toHaveLength(24);
    });
});

describe("loss landscape", () => {
    it("has a finite minimum inside the grid", () => {
        const ds = buildDataset();
        const land = new LossLandscape(ds.points);
        expect(land.gMin).toBeLessThan(land.gMax);
        expect(land.bStar).toBeGreaterThanOrEqual(-4);
        expect(land.bStar).toBeLessThanOrEqual(4);
        expect(
            land.lossAt(land.bStar >= 0 ? 1 : -1, land.bStar)
        ).toBeGreaterThan(0);
    });
});

describe("mlp", () => {
    it("drives training loss down on the visible set", () => {
        const ds = buildDataset();
        const frame = trainFrameOf(ds.points);
        const eng = new NetEngine(
            frame,
            ds.points,
            { layers: 1, n1: 4, n2: 3 },
            "tanh",
            0.3
        );
        const first = eng.trainStep();
        for (let i = 0; i < 400; i++) eng.trainStep();
        const last = eng.lastLoss!;
        expect(last).toBeLessThan(first);
        const acc = eng.accuracyOnAll();
        expect(acc).toBeGreaterThan(60); // well above chance on a separable set
    });

    it("trains loss down on a non-canonical frame", () => {
        const ds = buildDataset();
        const frame = trainFrameOf(ds.points, "GAME_HRS", "CAFFEINE");
        const eng = new NetEngine(
            frame,
            ds.points,
            { layers: 1, n1: 4, n2: 3 },
            "tanh",
            0.3
        );
        const first = eng.trainStep();
        for (let i = 0; i < 400; i++) eng.trainStep();
        expect(eng.lastLoss!).toBeLessThan(first);
    });
});

describe("z-stats + train frame", () => {
    it("zStatsOf defaults to the canonical axes", () => {
        const ds = buildDataset();
        const vis = ds.points.filter((p) => !p.hidden);
        const def = zStatsOf(vis);
        const explicit = zStatsOf(vis, CANONICAL_X, CANONICAL_Y);
        expect(def).toEqual(explicit);
    });

    it("zStatsOf on a non-canonical axis matches the hand-computed mean/std", () => {
        const ds = buildDataset();
        const vis = ds.points.filter((p) => !p.hidden);
        const xs = vis.map((p) => p.feats.GAME_HRS);
        const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
        const sx = Math.sqrt(
            xs.reduce((s, v) => s + (v - mx) * (v - mx), 0) / xs.length
        );
        const z = zStatsOf(vis, "GAME_HRS", "CAFFEINE");
        expect(z.mx).toBeCloseTo(mx, 9);
        expect(z.sx).toBeCloseTo(sx, 9);
    });

    it("trainFrameOf splits zStats (all non-hidden) from trainZ (known-label only)", () => {
        const ds = buildDataset();
        const frame = trainFrameOf(ds.points, "GAME_HRS", "CAFFEINE");
        const vis = ds.points.filter((p) => !p.hidden);
        const known = vis.filter((p) => p.label === 0 || p.label === 1);
        // zStats is over ALL non-hidden points (label-free) — matches the server.
        expect(frame.zStats).toEqual(zStatsOf(vis, "GAME_HRS", "CAFFEINE"));
        // trainZ only carries the known-label subset (avoids undefined-label points).
        expect(frame.trainZ).toHaveLength(known.length);
        expect(frame.trainZ.every((p) => p.s === 1 || p.s === -1)).toBe(true);
    });
});

describe("single neuron (stage 1)", () => {
    it("neuronBce at (0,0,0) is ln 2 (p = 0.5 everywhere)", () => {
        const ds = buildDataset();
        const frame = trainFrameOf(ds.points);
        expect(neuronBce(frame, 0, 0, 0)).toBeCloseTo(Math.LN2, 9);
    });

    it("a sensible boundary lowers the loss below ln 2", () => {
        const ds = buildDataset();
        const frame = trainFrameOf(ds.points);
        // y (caffeine) up ⇒ more owl: a positive w2 should separate better than flat.
        expect(neuronBce(frame, 0, 1.5, 0)).toBeLessThan(Math.LN2);
    });

    it("singleNeuronView.valueAt spot-checks the sigmoid over z-scored inputs", () => {
        const ds = buildDataset();
        const frame = trainFrameOf(ds.points);
        const w1 = 0.7;
        const w2 = -0.4;
        const b = 0.2;
        const view = singleNeuronView(frame, w1, w2, b);
        const zs = frame.zStats;
        const rawx = 300;
        const rawy = 8;
        const xz = (rawx - zs.mx) / zs.sx;
        const yz = (rawy - zs.my) / zs.sy;
        const expected = 1 / (1 + Math.exp(-(w1 * xz + w2 * yz + b)));
        expect(view.valueAt("out", rawx, rawy)).toBeCloseTo(expected, 9);
        expect(view.sizes).toEqual([2, 1]);
    });
});

describe("classifiers", () => {
    it("score a trivial owl-everywhere region", () => {
        const ds = buildDataset();
        const owlEverywhere = circlesAccuracy(
            ds.points,
            { x: "SCREEN_AVG", y: "CAFFEINE", circles: [] },
            1,
            (p) => p.real
        );
        // with no circles + default owl, accuracy = fraction of owls
        expect(owlEverywhere).toBeGreaterThan(0);
    });
});
