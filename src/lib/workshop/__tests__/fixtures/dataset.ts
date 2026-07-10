/* TEST FIXTURE ONLY — a deterministic synthetic dataset for exercising the
   scoring / loss-landscape / MLP / classifier engines in unit tests. This is the
   old prototype seed generator (buildData / sampleFeatures / makePseudos); it was
   removed from the shipping app when the seed fallback was dropped, and lives here
   solely so the engine tests have a stable, known-shaped dataset. Not imported by
   any production code path. */

import { WEDGE_MEANS, makePseudos } from "../../dataset-shared";
import { COLS } from "../../features";
import { createRng } from "../../rng";
import type { Rng } from "../../rng";
import type {
    ClassLabel,
    DataPoint,
    FeatureKey,
    FeatureValues,
    RealRow,
} from "../../types";

const DATA_SEED = 20260705;

type Arch = "game" | "caff" | "none";

export interface WorkshopDataset {
    realRows: RealRow[];
    /** all 208 points (48 real + 100 visible + 60 hidden). */
    points: DataPoint[];
    /** per-feature median across the real 48 (for the P1 deck bar tick). */
    med: Record<FeatureKey, number>;
}

function clampRound(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, Math.round(x)));
}

function sampleFeatures(rng: Rng, cls: ClassLabel, arch: Arch): FeatureValues {
    // game→a1 spur, caff→a2 spur, none→corner blob; shared 'wedge' means so this
    // seed generator and the real generator agree on the archetype shape.
    const key = arch === "game" ? "a1" : arch === "caff" ? "a2" : "none";
    const [mzx, mzy] = WEDGE_MEANS[key];
    const zx = mzx + rng.gauss() * 0.55;
    const zy = mzy + rng.gauss() * 0.55;
    const owl = cls === 1;
    return {
        SCREEN_AVG: clampRound(360 + zx * 150, 0, 960),
        CAFFEINE: clampRound(4.2 + zy * 2.9, 0, 24),
        LATE7: clampRound((owl ? 4.6 : 1.4) + rng.gauss() * 1.4, 0, 7),
        SNACK_DAYS: clampRound(
            (owl ? 3.4 : 1.1) + (arch === "game" ? 1.2 : 0) + rng.gauss() * 1.4,
            0,
            7
        ),
        LATE_SHOWER: clampRound(
            (owl ? 3.0 : 1.0) + (arch === "caff" ? 1.3 : 0) + rng.gauss() * 1.4,
            0,
            7
        ),
        EARLY_WAKE: clampRound((owl ? 1.6 : 4.6) + rng.gauss() * 1.4, 0, 7),
        GAME_HRS: clampRound(
            (owl ? 12 : 5) + (arch === "game" ? 11 : 0) + rng.gauss() * 6,
            0,
            60
        ),
        DND_START: clampRound((owl ? 3.1 : 1.1) + rng.gauss() * 0.95, 0, 4),
        BREAKFAST: clampRound((owl ? 2.6 : 4.8) + rng.gauss() * 1.4, 0, 7),
    };
}

export function buildDataset(): WorkshopDataset {
    const rng = createRng(DATA_SEED);
    const pseudos = makePseudos(rng, 48);

    const specs: { cls: ClassLabel; arch: Arch }[] = [];
    for (let i = 0; i < 24; i++)
        specs.push({ cls: 1, arch: rng() < 0.55 ? "game" : "caff" });
    for (let i = 0; i < 24; i++) specs.push({ cls: 0, arch: "none" });
    for (let i = specs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [specs[i], specs[j]] = [specs[j], specs[i]];
    }

    const realRows: RealRow[] = specs.map((sp, i) => ({
        id: "r" + i,
        pseudo: pseudos[i],
        label: sp.cls,
        feats: sampleFeatures(rng, sp.cls, sp.arch),
        real: true,
    }));

    const med = {} as Record<FeatureKey, number>;
    COLS.forEach((k) => {
        const vs = realRows.map((r) => r.feats[k]).sort((a, b) => a - b);
        med[k] = (vs[23] + vs[24]) / 2;
    });

    const points: DataPoint[] = [];
    realRows.forEach((r) =>
        points.push({
            id: r.id,
            feats: r.feats,
            label: r.label,
            real: true,
            hidden: false,
            jx: 0,
            jy: 0,
        })
    );
    const mk = (n: number, hidden: boolean) => {
        for (let i = 0; i < n; i++) {
            const cls: ClassLabel = rng() < 0.5 ? 1 : 0;
            const arch: Arch =
                cls === 1 ? (rng() < 0.55 ? "game" : "caff") : "none";
            let lab: ClassLabel = cls;
            if (rng() < 0.05) lab = (1 - lab) as ClassLabel;
            points.push({
                id: (hidden ? "h" : "s") + i,
                feats: sampleFeatures(rng, cls, arch),
                label: lab,
                real: false,
                hidden,
                jx: 0,
                jy: 0,
            });
        }
    };
    mk(100, false);
    mk(60, true);
    points.forEach((p) => {
        p.jx = rng() - 0.5;
        p.jy = rng() - 0.5;
    });

    return { realRows, points, med };
}
