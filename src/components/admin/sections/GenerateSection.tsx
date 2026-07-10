/* Generate — synthetic data with strategies + knobs (spec §4.2–4.4). Pick a
   named strategy, tune sep/noise/mix/flip/seed, and run the §4.4 verification
   harness: seven pass/fail bands plus a live preview of the canonical wedge.
   Real generation + verification run server-side; here it previews honestly off
   a seeded sampler so the sliders visibly move the bands. */

import { useEffect, useState } from "react";

import {
    Island,
    MicroLabel,
    PrimaryButton,
    SegmentedControl,
    Select,
} from "#/components/workshop/ui";
import { LabeledSlider, Verdict } from "../ui";
import { useCanvas } from "#/components/workshop/canvas/useCanvas";
import { C, FONT_MONO, lossRamp, rgbCss } from "#/lib/workshop/theme";
import {
    AXIS_KEYS,
    CANONICAL_X,
    FEATURES,
    formatFeature,
} from "#/lib/workshop/features";
import { SYNTH_STRATEGIES } from "#/lib/workshop/admin-service";
import type {
    AdminService,
    DatasetInfo,
    GenerateParams,
    TerrainReport,
    TerrainReportsResult,
    VerificationReport,
} from "#/lib/workshop/admin-service";
import type { DataPoint, FeatureKey } from "#/lib/workshop/types";

/** ladder means are ordered weakest → strongest; these are their labels
    (v3 refbots: DRUNK / PROBE / SCAN / SCAN_DECAY / FULL). */
const LADDER_LABELS = ["醉猴", "probe", "scan", "+decay", "+jump"] as const;

export function GenerateSection({
    service,
    onDataset,
}: {
    service: AdminService;
    onDataset: (d: DatasetInfo | null) => void;
}) {
    const [params, setParams] = useState<GenerateParams>(
        SYNTH_STRATEGIES[0].defaults
    );
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<VerificationReport | null>(null);
    const [points, setPoints] = useState<DataPoint[] | null>(null);
    const [feat, setFeat] = useState<FeatureKey>(CANONICAL_X);
    const [terrains, setTerrains] = useState<TerrainReport[] | null>(null);
    const [terrainStatus, setTerrainStatus] = useState<
        TerrainReportsResult["status"] | null
    >(null);
    const [rerolling, setRerolling] = useState(false);
    // bumped after a re-roll to restart the terrain poll against the new build.
    const [terrainPoll, setTerrainPoll] = useState(0);

    // Rehydrate the last generate's analytics on mount so verification bands, the
    // wedge preview, and the before/after histogram survive a reload — the report
    // is persisted server-side (Dataset.meta) and points are re-fetchable.
    useEffect(() => {
        let alive = true;
        Promise.all([service.getGenerateReport(), service.getPoints()])
            .then(([r, pts]) => {
                if (!alive || !r) return;
                setReport(r);
                setPoints(pts.length ? pts : null);
            })
            .catch(() => {
                /* pre-generate state or a transient error — leave the panel blank */
            });
        return () => {
            alive = false;
        };
    }, [service]);

    // fetch the P4 terrain hardness reports on mount + poll while the surfaces are
    // still being carved in the background (~19 s off the event loop server-side).
    // A re-roll bumps the status back to 'building', so this same poll picks up the
    // fresh build without extra wiring.
    useEffect(() => {
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = () => {
            service
                .getTerrainReports()
                .then((res) => {
                    if (!alive) return;
                    setTerrainStatus(res.status);
                    if (res.reports.length) setTerrains(res.reports);
                    // keep polling while the build runs so the panel fills in on completion.
                    if (res.status.state === "building")
                        timer = setTimeout(tick, 2000);
                })
                .catch(() => {
                    /* no active dataset yet — leave the terrain panel hidden */
                });
        };
        tick();
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
        };
    }, [service, terrainPoll]);

    const reroll = async () => {
        setRerolling(true);
        try {
            await service.rerollTerrain();
            // the rebuild is now in flight; restart the poll so it fills in the fresh
            // reports once the new build lands.
            setTerrainPoll((n) => n + 1);
        } finally {
            setRerolling(false);
        }
    };

    const set = (patch: Partial<GenerateParams>) =>
        setParams((p) => ({ ...p, ...patch }));
    const pickStrategy = (id: string) => {
        const s = SYNTH_STRATEGIES.find((x) => x.id === id);
        if (s) setParams(s.defaults);
    };

    const run = async () => {
        setBusy(true);
        const r = await service.generate(params);
        setReport(r);
        onDataset(await service.getDataset());
        setPoints(await service.getPoints());
        setBusy(false);
    };

    return (
        <div className="space-y-5">
            <div>
                <MicroLabel accent>Generate</MicroLabel>
                <h2 className="mt-1 font-display text-xl font-semibold text-fg">
                    Synthetic data
                </h2>
                <p className="text-sm text-muted">
                    Shape the 500-point wedge — one line ≈85%, two lines ≈93–95%
                    — then verify it clears the teaching bands. Running this
                    unlocks the rest of the console.
                </p>
            </div>

            <Island className="space-y-5 p-5">
                <div className="flex items-center gap-2">
                    <MicroLabel>Strategy</MicroLabel>
                    <SegmentedControl
                        value={params.strategy}
                        onChange={pickStrategy}
                        size="sm"
                        options={SYNTH_STRATEGIES.map((s) => ({
                            value: s.id,
                            label: s.name,
                        }))}
                    />
                </div>
                <p className="text-xs text-muted">
                    {
                        SYNTH_STRATEGIES.find((s) => s.id === params.strategy)
                            ?.desc
                    }
                </p>

                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    <LabeledSlider
                        label="sep"
                        value={params.sep}
                        min={0.5}
                        max={1.6}
                        step={0.05}
                        onChange={(v) => set({ sep: v })}
                        format={(v) => `${v.toFixed(2)}×`}
                    />
                    <LabeledSlider
                        label="noise"
                        value={params.noise}
                        min={0.8}
                        max={2}
                        step={0.05}
                        onChange={(v) => set({ noise: v })}
                        format={(v) => `${v.toFixed(2)}×`}
                    />
                    <LabeledSlider
                        label="mix"
                        value={params.mix}
                        min={0.3}
                        max={0.8}
                        step={0.01}
                        onChange={(v) => set({ mix: v })}
                        format={(v) =>
                            `${Math.round(v * 100)}/${Math.round((1 - v) * 100)}`
                        }
                    />
                    <LabeledSlider
                        label="flip"
                        value={params.flip}
                        min={0}
                        max={0.15}
                        step={0.01}
                        onChange={(v) => set({ flip: v })}
                        format={(v) => `${Math.round(v * 100)}%`}
                    />
                    <LabeledSlider
                        label="seed"
                        value={params.seed}
                        min={1}
                        max={99}
                        step={1}
                        onChange={(v) => set({ seed: v })}
                    />
                </div>

                <div className="flex justify-end">
                    <PrimaryButton onClick={run} disabled={busy}>
                        {busy ? "Generating…" : "Generate & verify"}
                    </PrimaryButton>
                </div>
            </Island>

            {report && (
                <div className="grid grid-cols-[1fr_260px] gap-5 max-lg:grid-cols-1">
                    <VerificationView report={report} />
                    <Island className="p-4">
                        <MicroLabel>Canonical wedge</MicroLabel>
                        <div className="mt-2 aspect-square w-full">
                            <WedgePreview report={report} />
                        </div>
                        <p className="mt-2 text-[11px] text-muted">
                            class 1 = <span className="text-accent3">owl</span>,
                            class 0 ={" "}
                            <span className="text-accent2">early</span>
                        </p>
                    </Island>
                </div>
            )}

            {report && points && (
                <Island className="space-y-3 p-5">
                    <div className="flex items-center justify-between gap-3">
                        <MicroLabel>
                            Feature distribution · before / after
                        </MicroLabel>
                        <Select
                            value={feat}
                            onChange={(e) =>
                                setFeat(e.target.value as FeatureKey)
                            }
                            aria-label="Histogram feature"
                        >
                            {AXIS_KEYS.map((k) => (
                                <option key={k} value={k}>
                                    {FEATURES[k].name}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div className="h-56 w-full">
                        <DistributionHistogram points={points} feat={feat} />
                    </div>
                    <p className="text-[11px] text-muted">
                        <span className="text-accent">■ after</span> (real +
                        synthetic) ·{" "}
                        <span className="text-accent3">▭ before</span> (real
                        only). y-axis = share of each set, so the ~
                        {points.filter((p) => p.real).length}-row real set stays
                        comparable.
                    </p>
                </Island>
            )}

            {(terrains ||
                terrainStatus?.state === "building" ||
                terrainStatus?.state === "error") && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <MicroLabel accent>
                                Expedition terrain · §4
                            </MicroLabel>
                            <p className="mt-1 text-sm text-muted">
                                The two scored MLP surfaces the bots climb, with
                                their hardness bands and the reference-bot
                                ladder (醉猴 worst → a scan bot best). Re-roll
                                for fresh surfaces.
                            </p>
                        </div>
                        <PrimaryButton onClick={reroll} disabled={rerolling}>
                            {rerolling ? "Re-rolling…" : "Regenerate"}
                        </PrimaryButton>
                    </div>

                    {/* slim progress row while the surfaces are still being carved. */}
                    {terrainStatus?.state === "building" && (
                        <Island className="space-y-2 p-4">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-mono text-muted">
                                    Carving terrains — {terrainStatus.phase}
                                </span>
                                <span className="font-mono text-accent">
                                    {Math.round(terrainStatus.progress * 100)}%
                                </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                                <div
                                    className="h-full rounded-full bg-accent transition-[width] duration-1000"
                                    style={{
                                        width: `${Math.round(terrainStatus.progress * 100)}%`,
                                    }}
                                />
                            </div>
                        </Island>
                    )}
                    {terrainStatus?.state === "error" && !terrains && (
                        <Island className="p-4">
                            <p className="text-xs text-warning">
                                Terrain build failed — it will retry on the next
                                fetch. Try re-rolling.
                            </p>
                        </Island>
                    )}

                    {terrains && (
                        <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
                            {terrains.map((t) => (
                                <TerrainCard key={t.stage} terrain={t} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* One scored-terrain card: heading, band table (reusing the Verdict verdict dot),
   the 5 ladder means, and a top-down loss-heatmap preview. */
function TerrainCard({ terrain }: { terrain: TerrainReport }) {
    const passed = terrain.checks.filter((c) => c.pass).length;
    const ladderMin = Math.min(...terrain.ladder);
    const ladderMax = Math.max(...terrain.ladder);
    return (
        <Island className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
                <h3 className="font-display text-lg font-semibold text-fg">
                    {terrain.name}{" "}
                    <span className="font-mono text-xs text-muted">
                        H={terrain.H}
                    </span>
                </h3>
                <span
                    className={`font-mono text-[11px] ${
                        passed === terrain.checks.length
                            ? "text-positive"
                            : "text-warning"
                    }`}
                >
                    {passed}/{terrain.checks.length} bands
                </span>
            </div>

            <div className="aspect-square w-full">
                <TerrainPreview terrain={terrain} />
            </div>

            <div className="divide-y divide-border/50">
                {terrain.checks.map((c) => (
                    <div
                        key={c.name}
                        className="flex items-center gap-3 py-1.5"
                    >
                        <div className="flex-1">
                            <div className="text-sm text-fg">{c.name}</div>
                            {!c.pass && c.knobHint ? (
                                <div className="font-mono text-[11px] text-warning/90">
                                    → {c.knobHint}
                                </div>
                            ) : null}
                        </div>
                        <span className="font-mono text-sm text-fg">
                            {c.value}
                        </span>
                        <span className="w-20 text-right font-mono text-[11px] text-muted">
                            {c.band[1] === Infinity
                                ? `≥ ${c.band[0]}`
                                : c.band[0] === 0
                                  ? `≤ ${c.band[1]}`
                                  : `${c.band[0]}–${c.band[1]}`}
                        </span>
                        <Verdict pass={c.pass} />
                    </div>
                ))}
            </div>

            <div>
                <MicroLabel>Ref-bot ladder · mean true loss</MicroLabel>
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                    {terrain.ladder.map((v, i) => {
                        const best = v === ladderMin;
                        const worst = v === ladderMax;
                        return (
                            <div key={LADDER_LABELS[i]} className="text-center">
                                <div
                                    className={`font-mono text-xs ${
                                        best
                                            ? "text-positive"
                                            : worst
                                              ? "text-warning"
                                              : "text-fg"
                                    }`}
                                >
                                    {v.toFixed(2)}
                                </div>
                                <div className="font-mono text-[10px] text-muted">
                                    {LADDER_LABELS[i]}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Island>
    );
}

/* Top-down loss heatmap over [-4, 4]² from the downsampled preview grid: low loss
   = hot lime (the valleys the bots seek), high loss = dim grey ridge. Mirrors the
   P4 terrain-3D fill ramp so the console preview matches what students see. */
function TerrainPreview({ terrain }: { terrain: TerrainReport }) {
    const { ref } = useCanvas(
        (ctx, w, h) => {
            const { preview, pn, gMin, gMax } = terrain;
            const span = gMax - gMin || 1;
            const cw = w / pn;
            const ch = h / pn;
            for (let j = 0; j < pn; j++) {
                for (let i = 0; i < pn; i++) {
                    const t = (preview[j * pn + i] - gMin) / span;
                    ctx.fillStyle = lossRamp(t, 1);
                    // b axis up-positive: flip the row so low b is at the bottom.
                    ctx.fillRect(i * cw, (pn - 1 - j) * ch, cw + 1, ch + 1);
                }
            }
            // center axes at w=0, b=0.
            ctx.strokeStyle = rgbCss(C.bg, 0.5);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(w / 2, 0);
            ctx.lineTo(w / 2, h);
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
        },
        [terrain]
    );
    return <canvas ref={ref} className="h-full w-full" />;
}

/* Overlaid frequency histogram for one feature: filled bars = the full set
   (real + synthetic), outlined bars = real rows only. Each series is normalized
   to its own share so the small real set stays visible against the ~500 synth. */
function DistributionHistogram({
    points,
    feat,
}: {
    points: DataPoint[];
    feat: FeatureKey;
}) {
    const { ref } = useCanvas(
        (ctx, w, h) => {
            const m = FEATURES[feat];
            const intRange = m.max - m.min;
            // one bin per integer for the small /7-style features; ~14 bins otherwise.
            const nBins = intRange > 0 && intRange <= 12 ? intRange + 1 : 14;
            const before = bucketize(
                points.filter((p) => p.real).map((p) => p.feats[feat]),
                m.min,
                m.max,
                nBins
            );
            const after = bucketize(
                points.map((p) => p.feats[feat]),
                m.min,
                m.max,
                nBins
            );
            const beforeN = before.reduce((s, v) => s + v, 0) || 1;
            const afterN = after.reduce((s, v) => s + v, 0) || 1;
            const bf = before.map((v) => v / beforeN);
            const af = after.map((v) => v / afterN);
            const yMax = Math.max(0.0001, ...bf, ...af);

            const padL = 34;
            const padB = 22;
            const padT = 12;
            const padR = 10;
            const pw = w - padL - padR;
            const ph = h - padT - padB;
            const base = padT + ph;
            const binW = pw / nBins;
            const toY = (frac: number) => base - (frac / yMax) * ph;

            // horizontal gridlines + y-axis share ticks (0, 50%, 100% of yMax).
            ctx.font = `9px ${FONT_MONO}`;
            ctx.textBaseline = "middle";
            ctx.textAlign = "right";
            for (let i = 0; i <= 2; i++) {
                const frac = (yMax * i) / 2;
                const y = toY(frac);
                ctx.strokeStyle = rgbCss(C.border, 0.3);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padL, y);
                ctx.lineTo(w - padR, y);
                ctx.stroke();
                ctx.fillStyle = rgbCss(C.muted, 0.8);
                ctx.fillText(`${Math.round(frac * 100)}%`, padL - 5, y);
            }

            // 'after' filled bars.
            ctx.fillStyle = rgbCss(C.accent, 0.35);
            for (let i = 0; i < nBins; i++) {
                const y = toY(af[i]);
                ctx.fillRect(
                    padL + i * binW + 1,
                    y,
                    Math.max(1, binW - 2),
                    base - y
                );
            }
            // 'before' outlined bars over the same bins.
            ctx.strokeStyle = rgbCss(C.accent3, 0.9);
            ctx.lineWidth = 1.5;
            for (let i = 0; i < nBins; i++) {
                if (bf[i] <= 0) continue;
                const y = toY(bf[i]);
                ctx.strokeRect(
                    padL + i * binW + 1,
                    y,
                    Math.max(1, binW - 2),
                    base - y
                );
            }

            // x-axis ticks in real feature units (min / mid / max).
            ctx.fillStyle = rgbCss(C.muted, 0.8);
            ctx.textBaseline = "top";
            const ticks: Array<[number, CanvasTextAlign]> = [
                [m.min, "left"],
                [(m.min + m.max) / 2, "center"],
                [m.max, "right"],
            ];
            for (const [val, align] of ticks) {
                ctx.textAlign = align;
                const px = padL + ((val - m.min) / (intRange || 1)) * pw;
                ctx.fillText(
                    formatFeature(feat, Math.round(val)),
                    px,
                    base + 5
                );
            }
        },
        [points, feat]
    );
    return <canvas ref={ref} className="h-full w-full" />;
}

/** Count values into nBins equal-width buckets over [min, max]; out-of-range
    values clamp into the edge bins. */
function bucketize(
    values: number[],
    min: number,
    max: number,
    nBins: number
): number[] {
    const bins = new Array<number>(nBins).fill(0);
    const span = max - min || 1;
    for (const v of values) {
        let idx = Math.floor(((v - min) / span) * nBins);
        if (idx < 0) idx = 0;
        if (idx >= nBins) idx = nBins - 1;
        bins[idx]++;
    }
    return bins;
}

function VerificationView({ report }: { report: VerificationReport }) {
    return (
        <Island className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
                <MicroLabel>Verification · §4.4</MicroLabel>
                <span
                    className={`font-mono text-[11px] ${report.allPass ? "text-positive" : "text-warning"}`}
                >
                    {report.allPass
                        ? "all bands clear"
                        : `${report.iterations} retune passes`}
                </span>
            </div>
            <div className="divide-y divide-border/50">
                {report.checks.map((c) => (
                    <div key={c.name} className="flex items-center gap-3 py-2">
                        <div className="flex-1">
                            <div className="text-sm text-fg">{c.name}</div>
                            {!c.pass && c.knobHint ? (
                                <div className="font-mono text-[11px] text-warning/90">
                                    → {c.knobHint}
                                </div>
                            ) : null}
                        </div>
                        <span className="font-mono text-sm text-fg">
                            {c.value}
                            {c.unit === "%" ? "%" : ""}
                        </span>
                        <span className="w-24 text-right font-mono text-[11px] text-muted">
                            {c.band[1] === Infinity
                                ? `≥ ${c.band[0]}`
                                : c.band[0] === 0
                                  ? `≤ ${c.band[1]}`
                                  : `${c.band[0]}–${c.band[1]}`}
                        </span>
                        <Verdict pass={c.pass} />
                    </div>
                ))}
            </div>
        </Island>
    );
}

function WedgePreview({ report }: { report: VerificationReport }) {
    const { ref } = useCanvas(
        (ctx, w, h) => {
            const pad = 10;
            const toX = (v: number) => pad + ((v + 3) / 6) * (w - 2 * pad);
            const toY = (v: number) => h - pad - ((v + 3) / 6) * (h - 2 * pad);
            // faint axes at 0
            ctx.strokeStyle = rgbCss(C.border, 0.4);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(toX(0), pad);
            ctx.lineTo(toX(0), h - pad);
            ctx.moveTo(pad, toY(0));
            ctx.lineTo(w - pad, toY(0));
            ctx.stroke();
            for (const p of report.preview) {
                ctx.beginPath();
                ctx.arc(toX(p.x), toY(p.y), 2.4, 0, Math.PI * 2);
                ctx.fillStyle = rgbCss(
                    p.cls === 1 ? C.accent3 : C.accent2,
                    0.8
                );
                ctx.fill();
            }
        },
        [report]
    );
    return <canvas ref={ref} className="h-full w-full" />;
}
