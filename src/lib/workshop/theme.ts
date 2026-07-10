/* Canvas palette — the TypeScript mirror of the @theme tokens in
   src/styles.css (canvas drawing can't read CSS vars, so the values live here
   as RGB tuples; a vitest keeps the two files in sync). All shared color
   ramps live here too so draw files never hold raw color literals.

   Accent law (design-system.md §3.2): lime = the single focused/hot thing;
   cyan/purple = category; magnitude = opacity/width; everything else grey. */

export type RGB = readonly [number, number, number];

/** Mirror of the `--color-*` tokens in src/styles.css `@theme`. */
export const C = {
    bg: [10, 10, 10],
    fg: [255, 255, 255],
    muted: [158, 158, 158],
    panel: [23, 23, 23],
    border: [88, 88, 88],
    accent: [214, 251, 0],
    accentFg: [10, 10, 10],
    accent2: [52, 227, 237],
    accent3: [114, 53, 255],
    positive: [74, 222, 128],
    warning: [251, 191, 36],
} as const satisfies Record<string, RGB>;

export const rgbCss = (c: RGB, a = 1): string =>
    a >= 1
        ? `rgb(${c[0]} ${c[1]} ${c[2]})`
        : `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;

export const mix = (a: RGB, b: RGB, t: number): RGB => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
];

/** matplotlib-style orange–blue diverging poles + light center (§3.3). */
const RAMP_BLUE: RGB = [59, 127, 196]; // #3b7fc4
const RAMP_ORANGE: RGB = [240, 130, 30]; // #f0821e
const RAMP_WHITE: RGB = [242, 242, 242]; // #f2f2f2

/** Canvas role aliases — derived from tokens, no new hues. */
export const CANVAS = {
    plotBg: rgbCss(C.bg),
    grid: rgbCss(C.border, 0.25),
    ptStroke: rgbCss(C.bg),
    hidden: rgbCss(C.muted, 0.4),
    axis: rgbCss(C.muted),
    axisName: rgbCss(C.muted),
    fogBase: rgbCss(C.panel),
} as const;

/** Canvas font strings (keep draw files off raw font literals). */
export const FONT_MONO = "'IBM Plex Mono', monospace";

/* ---- class colors: owl (1) = purple accent3, early (0) = cyan accent2 ---- */

export const CLASS_COLOR: Record<number, string> = {
    1: rgbCss(C.accent3),
    0: rgbCss(C.accent2),
};
export const CLASS_FILL: Record<number, string> = {
    1: rgbCss(C.accent3, 0.12),
    0: rgbCss(C.accent2, 0.12),
};

/* ---- P5 line colors: L1 = cyan, L2 = purple (category, not focus) ---- */

export const LINE_COLORS: readonly [string, string] = [
    rgbCss(C.accent2),
    rgbCss(C.accent3),
];

/* ---- shared ramps ---- */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Decision-surface ramp (P2 + MLP playground heat): matplotlib-style diverging blue ↔ white ↔
 * orange around t = 0.5, alpha emphasized toward the class extremes so the light
 * mid-band stays nearly transparent (fades to the near-black plot).
 */
export function heatRGBA(t: number): [number, number, number, number] {
    const u = clamp01(Math.abs(t - 0.5) * 2);
    const pole = t < 0.5 ? RAMP_BLUE : RAMP_ORANGE;
    const c = mix(RAMP_WHITE, pole, u); // white center → saturated pole
    return [c[0], c[1], c[2], 60 + u * 140];
}

/**
 * P5 class decision-surface ramp: cyan (class 0 / early) ↔ light center ↔ purple
 * (class 1 / owl), so the surface matches the scatter points and P2's class
 * colors instead of the blue↔orange loss ramp. Kept deliberately faint (peak
 * ~30% opacity) so the grey unlabeled dots stay visible through the surface.
 */
export function classHeatRGBA(t: number): [number, number, number, number] {
    const u = clamp01(Math.abs(t - 0.5) * 2);
    const pole = t < 0.5 ? C.accent2 : C.accent3; // cyan = class 0, purple = class 1
    const c = mix(RAMP_WHITE, pole, u);
    return [c[0], c[1], c[2], 20 + u * 56]; // ~8% mid-band → ~30% at the class poles
}

/**
 * Loss / terrain-height ramp (P3 fog / P4 expedition terrain): matplotlib-style
 * diverging blue → white → orange, §3.3.
 * t01 = 0 → best/lowest loss = blue (cold basins);
 * t01 = 1 → worst/highest loss = orange (warm peaks); mid-slopes are light.
 */
export function lossRamp(t01: number, alpha = 1): string {
    const t = clamp01(t01);
    const c =
        t < 0.5
            ? mix(RAMP_BLUE, RAMP_WHITE, t * 2) // low loss → blue, mid → white
            : mix(RAMP_WHITE, RAMP_ORANGE, (t - 0.5) * 2); // mid → white, high loss → orange
    return rgbCss(c, alpha);
}

/**
 * Signed network-edge style (MLP playground net diagram): diverging lime (positive) ↔
 * purple (negative); magnitude encoded by opacity + width.
 */
export function edgeStyle(w: number): { stroke: string; width: number } {
    const pole = w >= 0 ? C.accent : C.accent3;
    return {
        stroke: rgbCss(pole, Math.min(0.85, 0.18 + Math.abs(w) * 0.22)),
        width: Math.min(4.5, 0.5 + Math.abs(w) * 1.3),
    };
}
