# Design System — Interactive Tooling

A complete, self-contained specification of the design language used by the
SITCON Camp 2026 ML "stations." It is written so the system can be **lifted into
another interactive-tooling project** (dashboards, teaching canvases, data-viz
apps) without the ML curriculum baggage. Every value here is concrete and
copy-pasteable.

The signature look: **neon-lime on near-black, editorial, monospace-labelled**,
with a small cyan/purple categorical palette. One "hot" focus color, everything
else greyscale, magnitude encoded by opacity and width rather than by hue.

---

## 1. Design principles

These five rules are the soul of the system. If you keep nothing else, keep
these.

1. **One focus accent, at most one hot thing.** Lime (`accent`) means "the thing
   currently under attention" — the selected item, the hovered element, the
   argmax, the active step. Never paint two unrelated things lime. Everything
   not-focused is greyscale (`fg` / `muted`) on the near-black ground.

2. **Category is a separate, restrained palette.** Cyan (`accent2`) and purple
   (`accent3`) distinguish *groups* — never focus. Use 2–3 at a time. **Do not
   rainbow.** For N groups, anchor on cyan + purple + white + grey and blend.

3. **Encode magnitude with opacity and width, not extra hues.** A stronger
   attention link is more opaque and thicker, not a different color. A bigger
   probability is a longer bar at higher opacity. Signed values get a single
   restrained diverging scale (purple ↔ grey ↔ lime), never a rainbow.

4. **Editorial, monospace micro-labels.** Indices, ids, axis labels, column
   headers, timestamps are `font-mono`, uppercase, letter-tracked, muted, and
   zero-padded (`01`, `02`). Headings are semibold and tracked. This "technical
   label" idiom is what makes the surface read as a precise instrument.

5. **Borders over shadows; generous, grid-aligned whitespace.** Separate blocks
   with hairline borders (`border-border`, or `/30`–`/40` for sub-rules). Keep
   radii small and consistent. Shadows appear only on floating islands.

Supporting rules:

- **Dark is canonical.** The near-black surface is the primary design target. A
  light theme exists but is secondary (inverts bg/fg, darkens the accent so lime
  still reads on white).
- **Motion is optional polish.** Subtle fades/slides, ~150–500ms. Always gate
  nontrivial motion on `prefers-reduced-motion`.
- **Colors come from tokens, never hard-coded.** Components read semantic
  utilities (`bg-accent`, `text-muted`) or theme CSS vars. The only sanctioned
  hard-coded hexes are a station-level categorical chip palette (see §9.4).

---

## 2. Token architecture (how the system is wired)

Color and font tokens flow through **three layers**, so both a Tailwind-styled
DOM and an imperative canvas (SVG / WebGL) pull from one source of truth.

```
theme.css  ──►  tailwind-preset.cjs  ──►  utility classes (bg-accent, text-muted…)
 (CSS vars)                                used by all DOM/JSX

theme.css  ──►  viz theme.ts (reads the CSS vars at runtime)  ──►  rgb() strings
 (CSS vars)     via getComputedStyle in an effect                 used by SVG/WebGL fills
```

**Layer 1 — `theme.css`: raw values as space-separated RGB channels.** Stored as
channels (`214 251 0`) rather than hex so Tailwind's opacity modifier can inject
an alpha (`rgb(var(--x) / <alpha-value>)` → `bg-accent/40` works). Light values
on `:root`, dark overrides on `.dark`. Dark mode is **class-based** — put
`class="dark"` on `<html>` (or any ancestor); no JS, SSR-safe.

**Layer 2 — `tailwind-preset.cjs`: map semantic names → CSS vars.** A shared
Tailwind preset both apps consume, so `bg`, `fg`, `muted`, `accent`, etc. resolve
to the same vars everywhere. The preset owns colors, font families, and one
keyframe animation. It defines **no** spacing / radius / shadow / z-index /
font-size scales — the system rides Tailwind's stock defaults for those, and uses
arbitrary values (`text-[10px]`, `rounded-[18px]`) where it needs off-scale sizes.

**Layer 3 — viz `theme.ts`: read the same vars at runtime for canvases.** SVG
and WebGL can't use Tailwind color classes for computed fills, so a small module
reads the `--camp-*` vars via `getComputedStyle` inside an effect and returns
`[r,g,b]` tuples, with a hard-coded dark-palette fallback for SSR / first paint.
This keeps canvases on-theme without hard-coding hues.

> Naming note: this repo prefixes vars with `--camp-*`. Rename to your own prefix
> (e.g. `--app-*`) when lifting; the structure is what matters.

---

## 3. Color system

### 3.1 The tokens

| Semantic name | Role | Light (`:root`) | Dark (`.dark`) — canonical |
| --- | --- | --- | --- |
| `bg` | app background | `255 255 255` `#FFFFFF` | `10 10 10` `#0A0A0A` (near-black) |
| `fg` | foreground text; "hot neighbour" marks | `15 23 42` `#0F172A` | `255 255 255` `#FFFFFF` |
| `muted` | secondary text; base marks / strokes | `100 116 139` `#64748B` | `158 158 158` `#9E9E9E` |
| `panel` | cards, rails, floating islands | `248 250 252` `#F8FAFC` | `23 23 23` `#171717` |
| `border` | hairlines, cell strokes | `226 232 240` `#E2E8F0` | `88 88 88` `#585858` |
| `accent` | **FOCUS accent (neon lime)** | `101 118 0` `#657600` | `214 251 0` `#D6FB00` |
| `accent-fg` | text/glyphs on the accent | `255 255 255` | `10 10 10` `#0A0A0A` |
| `accent2` | categorical hue 1 (cyan) | `8 145 178` `#0891B2` | `52 227 237` `#34E3ED` |
| `accent3` | categorical hue 2 (purple); negative pole | `114 53 255` `#7235FF` | `114 53 255` `#7235FF` |
| `positive` | success / good | `22 163 74` `#16A34A` | `74 222 128` `#4ADE80` |
| `warning` | caution / offline / unknown | `217 119 6` `#D97706` | `251 191 36` `#FBBF24` |

The signature is **`#D6FB00` neon lime on `#0A0A0A` near-black**, with `#34E3ED`
cyan and `#7235FF` purple as the only other chromatic notes. The light theme
darkens the accent to `#657600` so lime stays legible on white.

### 3.2 The accent law (most important for canvases)

- **Base marks** (points, chips, cells, links, nodes) render in `fg`/`muted`
  greys on the near-black ground.
- **Lime (`accent`)** is reserved for the **focused / selected / active** element:
  the searched item + its neighbours, the hovered element's outgoing links, the
  argmax, the current step. **At most one hot thing at a time.**
- **Cyan + purple** encode *category*, not focus — clusters, series, heads. Use
  sparingly (2–3), never as a rainbow.
- **Magnitude → opacity / width**, never extra hues.
- **`fg` (white)** is the "warm neighbour" tier — a highlighted set adjacent to
  the single lime focus (e.g. focus point = lime, its k-NN neighbours = white,
  the rest = dimmed grey).

Mark-precedence when styling an element: **focus > highlight/neighbour > category
> greyscale base.**

### 3.3 Shared color scales

These derive everything else from the tokens. Implement them once in the viz
theme module.

- **Categorical palette** — for N groups, anchor on `[accent2, accent3, fg,
  muted]` (cyan, purple, white, grey); for N > 4, linearly blend between anchors.
  Deliberately not a rainbow.

- **Single-hue magnitude ramp** (unsigned heatmaps) — one color (`accent`), where
  **opacity** encodes magnitude:
  `opacity = MIN_OPACITY + (1 − MIN_OPACITY) · clamp01((v − lo)/(hi − lo))`, with
  `MIN_OPACITY = 0.06`. The max cell renders at full opacity as the focus mark.

- **Diverging scale** (signed values) — symmetric about zero, grey at zero:
  ```
  zeroColor = mix(bg, muted, 0.35)          // subtle dark grey
  t = clamp(v / absMax, -1, 1)
  fill = t >= 0 ? mix(zeroColor, accent, t)   // positive → lime
                : mix(zeroColor, accent3, -t) // negative → purple
  ```
  Used identically by heatmaps and vector strips so they read as one system.

---

## 4. Typography

**No web fonts.** The system is built entirely on native system stacks — zero
network cost, instant paint, no FOUT. Two roles:

```
--font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
             "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo,
             Consolas, "Liberation Mono", monospace;
```

- The **CJK fallbacks** (`Noto Sans TC`, `PingFang TC`, `Microsoft JhengHei`) are
  deliberate — the audience is Traditional-Chinese (`lang="zh-Hant-TW"`). Keep or
  swap for your locale.
- `body` gets `font-sans antialiased` globally.

**Type scale in use** (Tailwind defaults + a few arbitrary micro sizes):

| Use | Classes |
| --- | --- |
| Page H1 (landing) | `text-3xl font-bold tracking-tight` |
| Section H2 | `text-xl font-semibold` |
| Card / station title / H3 | `text-lg font-semibold` |
| Body | default or `text-sm`, usually `text-muted` |
| Small print / footer | `text-xs` |
| **Micro-labels** (the idiom) | `font-mono text-[10px] uppercase tracking-wide text-muted` |
| Smaller micro-labels | `text-[9px]` (indices), `text-[11px]` (inline token labels) |
| Dev/status badge | `font-mono text-[10px] uppercase` |

**The micro-label idiom** is pervasive and defines the aesthetic: indices, axis
labels, ids, column headers, timestamps are `font-mono`, `uppercase`,
`tracking-wide`, `text-muted`, and **zero-padded** (`String(i).padStart(2, "0")`
→ `01`). When focused/active they flip to `text-accent`. Headings are
`font-semibold` (section titles: add `uppercase tracking-wider`). Mono is also a
*stylistic accent* — inline technical terms, key words in prose, `重點`-style
callout headings all use `font-mono`, not just code.

Weights used: `font-medium` (500), `font-semibold` (600), `font-bold` (700).

---

## 5. Spacing, radius, shadow, z-index, motion

No custom scales are defined — the system uses Tailwind defaults plus targeted
arbitrary values. The conventions that recur:

**Radius:** `rounded-md` is the default; `rounded-sm` / `rounded-[2px]` for grid
cells and small chips; `rounded-full` for toggles/dots; `rounded-[18px]` /
`rounded-2xl` for the floating dock and large capsules.

**Borders / dividers:** hairlines everywhere — `border-border` between blocks,
`border-border/30`–`/40` for subtle sub-rules, `border-dashed border-border` for
"empty / stub / not-yet" states. Prefer borders to shadows.

**Shadows (only on floating things):** `shadow-md` (tooltips, popovers),
`shadow-lg` (dock, dropdown menus, preset trays), `shadow` (toggle knob). One
signature glow: `shadow-[0_0_10px] shadow-accent/50` on the primary submit
button hover, and `shadow-[0_0_8px_1px] shadow-accent` on the "current item" dot.

**Z-index ladder:** `z-50` title/nav island · `z-40` label tooltips · `z-30`
bottom dock · `z-20` input cap-hint / preset tray · `z-10` slider value bubble /
sticky label gutter.

**Motion** (restrained, optional, reduced-motion-aware):

| Purpose | Spec |
| --- | --- |
| Value bars (probabilities) | `transition-[width,opacity] duration-300` |
| Meter fills | `motion-safe:transition-[width] motion-safe:duration-500` |
| Hover / tooltip reveals | `transition-opacity duration-150` or `transition-all duration-150` |
| Prescribed easing | `cubic-bezier(0.22, 1, 0.36, 1)`, ~300–500ms |
| Indeterminate "working" sweep | keyframe `translateX(-100%)→(500%)`, `1.15s ease-in-out infinite` |
| Fake-compute button beat | ~700ms + `animate-spin` spinner |

Always gate nontrivial animation on `prefers-reduced-motion: reduce` (via a
`usePrefersReducedMotion()` matchMedia hook, or Tailwind's `motion-safe:`
variants). Motion must never be required for the content to read.

---

## 6. Reference token files

Drop these in, rename the prefix, and the whole system comes online.

### 6.1 `theme.css`

```css
:root {
  --camp-font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  --camp-font-mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo,
    Consolas, "Liberation Mono", monospace;

  --camp-bg: 255 255 255;
  --camp-fg: 15 23 42;
  --camp-muted: 100 116 139;
  --camp-panel: 248 250 252;
  --camp-border: 226 232 240;
  --camp-accent: 101 118 0;      /* darkened lime so it reads on white */
  --camp-accent-fg: 255 255 255;
  --camp-accent-2: 8 145 178;
  --camp-accent-3: 114 53 255;
  --camp-positive: 22 163 74;
  --camp-warning: 217 119 6;
}

.dark {
  --camp-bg: 10 10 10;
  --camp-fg: 255 255 255;
  --camp-muted: 158 158 158;
  --camp-panel: 23 23 23;
  --camp-border: 88 88 88;
  --camp-accent: 214 251 0;      /* neon lime — the FOCUS accent */
  --camp-accent-fg: 10 10 10;
  --camp-accent-2: 52 227 237;   /* cyan  — category 1 */
  --camp-accent-3: 114 53 255;   /* purple — category 2 */
  --camp-positive: 74 222 128;
  --camp-warning: 251 191 36;
}
```

### 6.2 `tailwind-preset.cjs`

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],                 // each app declares its own globs
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg:       "rgb(var(--camp-bg) / <alpha-value>)",
        fg:       "rgb(var(--camp-fg) / <alpha-value>)",
        muted:    "rgb(var(--camp-muted) / <alpha-value>)",
        panel:    "rgb(var(--camp-panel) / <alpha-value>)",
        border:   "rgb(var(--camp-border) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--camp-accent) / <alpha-value>)",
          fg:      "rgb(var(--camp-accent-fg) / <alpha-value>)",
        },
        accent2:  "rgb(var(--camp-accent-2) / <alpha-value>)",
        accent3:  "rgb(var(--camp-accent-3) / <alpha-value>)",
        positive: "rgb(var(--camp-positive) / <alpha-value>)",
        warning:  "rgb(var(--camp-warning) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--camp-font-sans)"],
        mono: ["var(--camp-font-mono)"],
      },
      keyframes: {
        indeterminate: {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(500%)" },
        },
      },
      animation: { indeterminate: "indeterminate 1.15s ease-in-out infinite" },
    },
  },
};
```

### 6.3 Per-app `tailwind.config.js`

```js
const preset = require("@camp/ui/tailwind-preset");
module.exports = {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx}",           // or "./app/**/*.{ts,tsx,mdx}" for Next
    "./index.html",                   // Vite only
    "../../packages/ui/src/**/*.{ts,tsx}",   // scan shared packages so their
    "../../packages/viz/src/**/*.{ts,tsx}",  // utility classes get generated
  ],
};
```

### 6.4 Global stylesheet (per app)

Import order matters: **tokens first, then app globals.**

```css
/* imported after `@import "@camp/ui/theme.css";` in the app entry */
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }     /* #root only for the SPA */
body { @apply bg-bg text-fg font-sans antialiased; }
```

### 6.5 Runtime theme reader for canvases (`viz/theme.ts`, essentials)

```ts
export type RGB = [number, number, number];

const VARS = {
  bg: "--camp-bg", fg: "--camp-fg", muted: "--camp-muted",
  border: "--camp-border", accent: "--camp-accent",
  accent2: "--camp-accent-2", accent3: "--camp-accent-3",
} as const;

// Dark palette mirror — SSR / first-paint fallback.
const FALLBACK = {
  bg: [10,10,10], fg: [255,255,255], muted: [158,158,158], border: [88,88,88],
  accent: [214,251,0], accent2: [52,227,237], accent3: [114,53,255],
} as Record<keyof typeof VARS, RGB>;

export function readThemeColors() {
  if (typeof document === "undefined") return { ...FALLBACK };
  const cs = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const k in VARS) {
    const [r,g,b] = cs.getPropertyValue(VARS[k]).trim().split(/[\s,]+/).map(Number);
    if ([r,g,b].every(Number.isFinite)) out[k] = [r,g,b];
  }
  return out;
}

export function useThemeColors() {          // read once on mount (client only)
  const [c, setC] = useState(FALLBACK);
  useEffect(() => setC(readThemeColors()), []);
  return c;
}

export const rgbCss = (c: RGB, a = 1) =>
  a >= 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB =>
  [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
```

---

## 7. Layout system

The app is a **full-bleed interactive canvas with floating "islands" over it** —
not a document with scrollbar chrome. This is the defining structural pattern.

### 7.1 The station shell (`StationLayout`)

A single layout primitive wraps every canvas. It owns layout only — no state.

```
┌─────────────────────────────────────────────┐
│ ▸ Title  ⓘ ← top-left island (z-50)          │
│                                               │
│                                               │
│            [ full-bleed canvas ]              │
│         (max-w-5xl column, or full)           │
│                                               │
│         ┌───────────────────────┐             │
│         │ input │ · │ controls  │ ← dock (z-30)│
│         └───────────────────────┘             │
└─────────────────────────────────────────────┘
```

- **Root:** `relative flex h-full min-h-0 flex-col overflow-hidden bg-bg text-fg`
- **Top-left island** (`absolute left-4 top-4 z-50`, `pointer-events-none` with
  `[&>*]:pointer-events-auto`): the title (`text-lg font-semibold`, or a nav
  dropdown injected via context) + an optional `ⓘ` info button
  (`h-6 w-6 text-muted hover:text-accent`) that reveals a **takeaway popover** on
  group-hover: `rounded-md border border-border bg-panel px-4 py-3 text-sm
  shadow-md`, with a `font-mono text-sm font-semibold text-accent` heading. Pure
  CSS, no state.
- **Canvas main:** `relative min-h-0 flex-1 overflow-auto`. Default = centered
  readable column `mx-auto h-full max-w-5xl` with `p-5 pb-28` (the `pb-28` clears
  the dock). A `fullBleed` flag switches to edge-to-edge `h-full w-full`.
- **Bottom-center dock** (`absolute inset-x-0 bottom-4 z-30 flex justify-center`):
  a floating island `pointer-events-auto flex items-stretch gap-4 rounded-[18px]
  border border-border bg-panel p-3 shadow-lg`, split into **input (left)** and
  **controls (right)** by a `w-px self-stretch bg-border` divider. Only rendered
  when there's an input or controls.

Props: `title`, `input?` (single primary input, left of dock), `controls` (right
of dock — sliders/toggles/buttons), `children` (the canvas), `takeaway?` (the
info-popover content), `fullBleed?`. A header-title context lets the app swap the
`<h1>` for a nav dropdown without the layout knowing about routing.

Rule of thumb: **only controls live in the dock; rich readouts belong on the
canvas**, placed by the content component.

### 7.2 Full-bleed canvas idiom

Inside a `fullBleed` station, content typically uses:

```
absolute inset-0 overflow-auto px-8 pt-16 pb-28   // pt-16/pb-28 clear the islands
  └─ flex min-h-full … justify-center             // vertically centered, scrolls on overflow
```

### 7.3 Two-app pattern (catalog + player)

The reference project splits into two apps sharing one token layer:

- **Catalog app** (Next.js, light theme): a traditional document — header nav,
  centered `max-w-5xl` main, footer. Landing hero + a card grid index
  (`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`); each card
  `rounded-lg border border-border bg-panel p-4 transition-colors
  hover:border-accent`. Links cross-origin into the player via plain `<a href>`.
- **Player app** (Vite SPA, hard-locked dark via `class="dark"` on `<html>`): the
  full-bleed canvases. Navigation is **not a sidebar** — it's a dropdown folded
  into each canvas's top-left title. A single registry array drives both routes
  and the nav menu.

You don't need two apps to use the system — but the split (a light document-style
catalog + a dark full-bleed player) is a clean model for "index + immersive
tool."

### 7.4 Responsive posture

Desktop-first. The only responsive utilities in the whole system are the catalog
grid's `sm:`/`lg:` column counts. Canvases fill the viewport via
`h-full min-h-0 flex-1 overflow-hidden` rather than breakpoints. Reading width is
a design lever, not a breakpoint: `max-w-5xl` (main column), `max-w-2xl` (hero
copy); `fullBleed` opts a canvas out of the cap. If you need real mobile support,
that's net-new work.

---

## 8. Component library

A small set of controls, all theme-driven. Props and the exact class recipes so
you can rebuild them anywhere. Selected-state convention throughout:
`bg-accent text-accent-fg` for the active segment, `text-muted hover:text-fg` for
inactive.

**`LabeledSlider`** — range + label + live mono readout.
Row `mb-1 flex items-baseline justify-between`; label `text-sm font-medium`;
readout `font-mono text-xs text-muted`; input `w-full accent-accent`.
Props: `label, value, min, max, step=1, onChange, format?`.

**`Toggle`** — accessible switch (`role="switch"`, `aria-checked`).
Track `relative h-6 w-11 shrink-0 rounded-full transition-colors` +
(`checked ? "bg-accent" : "bg-border"`); knob `absolute left-0.5 top-0.5 h-5 w-5
rounded-full bg-white shadow transition-transform` + `translate-x-5`/`-x-0`.
Props: `label, checked, onChange`.

**`SegmentedControl<T>`** — horizontal pick-one, generic over a string union.
Group `inline-flex rounded-md border border-border bg-panel p-0.5`; button
`rounded px-3 py-1 text-sm transition-colors` + selected/inactive convention.
Props: `label?, value, options: {label,value}[], onChange`.

**`RunButton`** — primary button with a built-in **fake loading beat**
(pedagogy: make "compute costs time" visible even when replaying precomputed
data; `onRun` fires *after* the beat). `inline-flex items-center gap-2 rounded-md
bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity
disabled:opacity-60`; spinner `h-3 w-3 animate-spin rounded-full border-2
border-accent-fg/40 border-t-accent-fg`.
Props: `label="Run", runningLabel="Computing…", durationMs=700, onRun?, disabled?`.

**`LiveStatus`** — one quiet mono line about an async round-trip; presentational,
parent owns the state machine. `font-mono text-xs` + tone.
States → tone: `pending`→`text-muted`, `live`→`text-accent`,
`cached`/`rejected`→`text-warning`; `idle`→renders nothing.

**`SuggestInput`** — the primary dock text field. Auto-growing textarea capped
then scrolls; prebuilt example **chips surface on focus-while-empty** in an
upward-opening tray; a `LiveStatus` band sits behind a bottom gradient scrim; lime
submit arrow (`bg-accent text-accent-fg`, hover glow `shadow-[0_0_10px]
shadow-accent/50`). Enter submits, Shift+Enter = newline. Native `maxLength` hard
cap prevents oversized requests; a `font-mono text-[11px] text-warning` cap hint
appears near the limit.

**`DockControls` + block controls** — a two-column grid
`grid-cols-[auto_minmax(8rem,auto)] items-center gap-x-5 gap-y-3.5` that aligns
`[label | control]` rows:
- **`BlockSlider`** — a tall block with a `linear-gradient(to right, bg, accent)`
  fill (`opacity-50` idle → `100` on hover), a slim `bg-fg` handle (`w-1` → `w-2`
  on hover), a value bubble that pops above on hover, and step ticks `bg-fg/30`.
- **`BlockToggle<T>` / `BlockButtons`** — blocky full-width pick-one / action row
  for the dock, same selected-segment convention.
- **`InfoLabel`** — a label with a dotted underline (`underline decoration-dotted
  decoration-muted underline-offset-2 cursor-help`) revealing an `info` tooltip
  on group-hover.

**On-canvas hover tooltip (the group-hover idiom)** — reused everywhere: wrap the
target in `group relative`, drop a `pointer-events-none absolute … rounded-md
border border-border bg-panel px-3 py-2 text-xs opacity-0 transition-opacity
duration-150 group-hover:opacity-100` panel. This is the same shape as the
takeaway popover and `InfoLabel` — one tooltip language across the system.

---

## 9. Visualization primitives

Design rules for canvases, then the concrete primitives. **Every primitive:**

- takes data purely via props (no fetching, no lesson/domain state);
- is **resize-aware** via a `useResizeObserver` hook (a `ResizeObserver` created
  only inside `useEffect`, feature-detected; returns `{width:0, height:0}` until
  the first measure — render nothing while width is 0);
- reads color from `useThemeColors()` (never hard-coded hues);
- is **SSR-safe** — nothing touches `window` during render; d3 is used only for
  pure scale math (not DOM), three.js is **lazy-imported inside the effect**.

### 9.1 Scatter2D (d3 scales + React-rendered SVG)

- Props: `data: {x,y,category?,label?}[]`, `colorBy=true`, `highlight?: string[]`
  (spotlight set → white), `focus?: string` (single lime query), `height=360`,
  `fill=false`, `onHover`, `onSelect` (lasso, stubbed).
- Constants: `MARGIN = {top:16, right:16, bottom:24, left:32}`; 5% domain padding;
  degenerate domain expands ±1.
- Marks: circle radius by state — focus `7`, hover `6`, neighbour `5`, base `4`;
  `stroke-bg strokeWidth 1`. Opacity: dimmed field `0.18` when a highlight is
  active, else `0.85`; focus/neighbour `1`. Color precedence
  focus(`accent`) > neighbour(`fg`) > category > `muted`.
- Tooltip: SVG `<text>` at `+8/-8`, `fill-fg font-mono text-[10px]`.

### 9.2 Scatter3D (three.js, lazy-imported)

- Adds `z`, `autoRotate=false`. GL context created **once, keyed on `data`**;
  highlight/color changes only repaint the vertex-color buffer — never tear down
  the renderer.
- Camera `PerspectiveCamera(55°, near 0.1, far 2000)`, `pixelRatio = min(dpr, 2)`;
  `PointsMaterial({size:0.1, sizeAttenuation, alphaTest:0.5, transparent})` with a
  64px canvas disc sprite. OrbitControls: `enableDamping`, `rotateSpeed 0.45`,
  `zoomSpeed 0.6`, `autoRotateSpeed 0.6`. Raycaster `Points.threshold = 0.12`;
  picking suspended during drag. Framing fits the bbox, view dir `(0.22,0.16,1)`,
  distance ×1.06.
- Color: `THREE.Color.setRGB(..., SRGBColorSpace)`; dimmed field `mix(base, bg,
  0.82)`; focus lime, neighbour white.
- Tooltip: DOM overlay `border-border bg-panel/90 px-2 py-1 font-mono text-sm
  text-fg shadow-sm backdrop-blur`.

### 9.3 AttentionLines / link diagrams (pure SVG, quadratic-bezier arcs)

Generalizes to any "row of nodes with weighted links." `weights[i][j]` in 0..1.
- Constants: `PAD_X = 40`, label `20` below node, `baselineY = height*0.72`, arc
  lift `min(baselineY-10, 0.14*height + 0.4*span)`, `threshold=0.05`.
- Encoding (magnitude = opacity AND width, one greyscale channel): background arcs
  `stroke=muted`, opacity `hasFocus ? 0.05 : 0.1+0.4*w`, width `0.5+1.5*w`. The
  focused node's outgoing arcs go lime: opacity `0.2+0.8*w`, width `1+4*w`. A
  self-link ring: radius `5+8*selfWeight`. Nodes r `4`/`3`. Labels `font-mono
  text-[11px]`; zero-padded index micro-label `text-[9px] uppercase tracking-wide`.

### 9.4 Heatmap (pure SVG)

The workhorse matrix view. Props: `matrix`, `rowLabels?`, `colLabels?`,
`min?/max?` (fix domain to keep the scale stable while values animate),
`showValues=false`, `format` (2 d.p.), `highlightMax=true`, `highlightCol?`
(outline a whole column as the active step), `diverging=false`, `height=360`,
`topGutter?`, `colLabelAngle=0` (rotate long labels), `onHoverCell?`,
`activeCell?` (crosshair outline), `activeCellStrokeClass="stroke-accent"`.
- Constants: inter-cell `GAP = 2`, cell `rx=2` stroke `0.5`, `MIN_OPACITY = 0.06`;
  left gutter `72` with row labels else `8`; top gutter `22` with col labels else
  `8`; active outlines `rx=3 strokeWidth 1.5`.
- Two modes: **single-hue** (`fill-accent`, opacity ramp, max cell solid = focus
  mark) and **diverging** (signed, purple↔grey↔lime, `overflow:visible` for
  rotated labels).
- Labels `font-mono text-[10px] uppercase tracking-wide`, `fill-accent` when
  active else `fill-muted`. Hover readout DOM chip top-right `border-border
  bg-panel px-2 py-1 font-mono text-[10px]`.

### 9.5 VectorStrip (flexbox divs — the "embedding row" idiom)

A single vector as a row of colored cells; same diverging scale as the heatmap so
strips and matrices read as one system. Props: `values`, `maxAbs?` (share across
strips to keep one scale), `emphasis=1` (whole-strip opacity `0.15 + 0.85*emphasis`
— encode "how much this contributes" without a new hue), `highlight=false`
(`ring-1 ring-accent`), `cellSize=16`. Cells `gap-px rounded-[2px] border
border-border/40`.

### 9.6 Stub convention

Not-yet-built primitives render a clearly-marked placeholder that echoes the
props they received: `border-dashed border-border bg-panel` with a `stub` badge
(`bg-warning/20 text-warning font-mono text-[10px] uppercase`). This lets stations
wire against a typed signature before the real render exists.

### 9.7 Station-level categorical chips (the one sanctioned hard-coded palette)

For "identity chips" (one color per item, meaning nothing beyond "distinct item"),
a station-level array of **darkened hexes with white glyphs** is allowed — the
only place hard-coded hexes live, because it's an app-specific idiom, not a
reusable primitive:

```
#3f6f52 green   #2f6470 teal    #7a4a54 rose   #5a4d84 purple
#7a6234 gold    #3a5578 slate   #6a4a6e plum   #4a6a44 olive
```

Cycled by position; id shown in `text-white/70 text-[9px]`; cross-highlight =
`ring-1 ring-white`; special states use tokens (subword split → lime, unknown →
`border-dashed border-warning text-warning`).

---

## 10. Interaction patterns

Recurring behaviours worth reusing wholesale.

- **The universal state pattern.** Plain React `useState` in the content
  component; controls are controlled inputs whose `onChange` updates state;
  derived canvas data is a `useMemo` of that state; the viz re-reads its props.
  No imperative wiring, no refs into the canvas. This is the entire architecture.

- **Load-then-play, never compute live.** Heavy work is precomputed offline and
  shipped as small artifacts; the app loads JSON / small models inside an effect
  with an `alive` guard and plays them back. (In this repo it's an explicit
  "golden rule" — the browser never trains.)

- **Fake-compute beat.** A `RunButton` + a `generation` counter dramatize
  "compute is happening" (spinner, ~700ms) before revealing a precomputed result,
  so the cost of computation stays legible.

- **Live-inference status machine.** When a real backend is optional: booleans
  `pending / failed / shown` → a derived `LiveState` → `<LiveStatus>`. Debounce
  the call (~300–400ms) inside an effect, clear on cleanup; keep the last good
  result on screen on failure; recorded presets stay offline-safe. Transparency
  over spinner theatrics — one mono line stating latency or "showing cached."

- **Value-bar field.** For distributions: rows of `[label | track | %]`, track
  `h-3.5/h-4 rounded-sm bg-panel overflow-hidden`, fill `bg-accent` at width
  `(v/max)*100%` and opacity `isMax ? 1 : 0.35 + 0.5*v`; the max row's label goes
  `text-accent`, the rest `text-muted`.

- **Cross-highlight via hover round-trip.** A primitive emits `onHover(id)`; the
  station stores it and feeds it back as `focus`/`highlight`/`activeCell`, so
  hovering one view lights the corresponding mark in another. The primitive owns
  no lesson state — hover is just data flowing up and back down.

- **Row-aligned pipeline columns.** When several stacked views must line up row
  i, share one `rowH` constant across all of them and drive every column's cell
  height from it, with explicit gutter/offset constants — geometry over guesswork.

- **DOM-measured connectors.** For diagram wires between cards, draw an SVG
  overlay whose endpoints are read from real DOM rects in `useLayoutEffect` (so
  they survive reflow/scroll); orthogonal routing with rounded corners; solid
  feed lines `stroke-muted/50`, dashed bypass wires `strokeDasharray "5 6"`.

---

## 11. Package boundaries

To keep the system reusable across many canvases, enforce strict layering:

- **`ui`** — layout shell, controls, buttons, theme tokens. Generic, reusable,
  SSR-safe. **No** viz/canvas drawing, **no** data fetching.
- **`viz`** — visualization primitives that take data via props. Client-only,
  resize-aware. **No** controls, **no** hard-coded lesson data, **no** fetching.
- **`data`** — loaders for precomputed artifacts. **No** React, **no** components.
- **app / content module** — the only place domain logic and hard-coded copy
  live. Composes `ui` + `viz` + `data`.

Heuristic: reused by ≥2 canvases and generic → push into a package; specific to
one screen → keep it local. Heavy engines (`three`, WebGL, wasm inference) are
**lazy-imported inside effects**, never at module scope or during render.

---

## 12. Replication checklist

To stand this up in a new interactive-tooling project:

- [ ] Add `theme.css` (§6.1) with your prefix; light on `:root`, dark on `.dark`.
      Toggle dark by putting `class="dark"` on `<html>`.
- [ ] Add the Tailwind preset (§6.2); each app config sets `presets: [preset]`,
      `darkMode: "class"`, and content globs that include shared packages (§6.3).
- [ ] Import tokens **before** app globals; set `body { @apply bg-bg text-fg
      font-sans antialiased }` and `html, body, #root { height: 100% }` (§6.4).
- [ ] Add the runtime theme reader (§6.5) so canvases pull the same colors.
- [ ] Build the layout shell: full-bleed canvas + top-left title island +
      bottom-center control dock (§7.1).
- [ ] Build controls with the selected-segment convention `bg-accent
      text-accent-fg` / `text-muted hover:text-fg` (§8).
- [ ] For every canvas primitive: props-only, resize-aware, `useThemeColors`,
      SSR-safe, lazy-import heavy engines (§9).
- [ ] Apply the accent law: one lime focus, cyan/purple for category, greyscale
      base, magnitude via opacity/width (§3.2).
- [ ] Use the micro-label idiom: `font-mono text-[10px] uppercase tracking-wide
      text-muted`, zero-padded indices (§4).
- [ ] Gate all nontrivial motion on `prefers-reduced-motion` (§5).
- [ ] Enforce package boundaries; no fetching in viz, no hard-coded hues in
      primitives (§11).

---

*This document is descriptive of the SITCON Camp 2026 ML station system and
written to be reused independently. Rename the `--camp-*` prefix and the `@camp/*`
package names to fit your project; everything else transfers as-is.*
