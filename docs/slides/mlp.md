---
marp: true
paginate: true
footer: SITCON Camp 2026 · ML · Part 1
---

<!--
  所以，機器到底是怎麼學習的？ — SITCON Camp 2026 ML Part 1
  Self-contained deck. Render with a bare `npx @marp-team/marp-cli mlp.md`.
  Ports the repo design system (docs/design-system.md): near-black ground,
  greyscale type, hairline borders, mono micro-labels. Lime is a RARE focus
  accent (one hot thing at most) — not a fill.
  Fonts: IBM Plex Sans (+ IBM Plex Sans TC for CJK) sans, Geist Mono mono —
  pulled from Google Fonts (needs network at render time).
  Layout classes:  _class: title | lead | divider | tight
  Section label:   start a slide with `###### 01 · SECTION`
  Utility spans:   <span class="lime|cyan|purple|muted|label|chip">…</span>
  Grids:           <div class="cols"> / <div class="card">
-->

<style>
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Sans+TC:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap");

/* ── Tokens (dark is canonical) ─────────────────────────────────────────── */
:root {
  --camp-bg: 10 10 10;         /* #0A0A0A near-black */
  --camp-fg: 237 237 237;      /* soft white — not pure #FFF */
  --camp-muted: 138 138 138;   /* #8A8A8A            */
  --camp-panel: 20 20 20;      /* #141414            */
  --camp-border: 64 64 64;     /* #404040 hairline   */
  --camp-accent: 214 251 0;    /* #D6FB00 focus lime */
  --camp-accent-fg: 10 10 10;  /* #0A0A0A            */
  --camp-accent-2: 52 227 237; /* #34E3ED cyan       */
  --camp-accent-3: 148 120 220;/* muted purple       */
  --camp-warning: 234 179 78;  /* muted amber        */

  --font-sans: "IBM Plex Sans", "IBM Plex Sans TC", ui-sans-serif, system-ui,
    -apple-system, "Segoe UI", Roboto, "Noto Sans TC", "PingFang TC",
    "Microsoft JhengHei", sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, "JetBrains Mono",
    Menlo, Consolas, "Liberation Mono", monospace;

  --bg: rgb(var(--camp-bg));
  --fg: rgb(var(--camp-fg));
  --muted: rgb(var(--camp-muted));
  --panel: rgb(var(--camp-panel));
  --border: rgb(var(--camp-border));
  --accent: rgb(var(--camp-accent));
  --accent-fg: rgb(var(--camp-accent-fg));
  --accent2: rgb(var(--camp-accent-2));
  --accent3: rgb(var(--camp-accent-3));
  --warning: rgb(var(--camp-warning));
}

/* ── Slide surface ──────────────────────────────────────────────────────── */
section {
  width: 1280px;
  height: 720px;
  padding: 68px 76px;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  font-size: 19px;
  line-height: 1.6;
  letter-spacing: 0.005em;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

/* Hairline top rule. */
section::before {
  content: "";
  position: absolute;
  left: 76px;
  right: 76px;
  top: 44px;
  height: 1px;
  background: rgb(var(--camp-border) / 0.5);
}

/* ── Headings (greyscale — never lime) ──────────────────────────────────── */
h1 {
  color: var(--fg);
  font-size: 34px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
  margin: 0 0 0.5em;
}
h2 {
  color: var(--fg);
  font-size: 25px;
  font-weight: 500;
  letter-spacing: -0.005em;
  margin: 0 0 0.5em;
}
h3 {
  color: var(--fg);
  font-size: 18px;
  font-weight: 600;
  margin: 0.1em 0 0.45em;
}

/* Mono micro-label idiom for h6 — use `###### 01 · SECTION`. */
h6 {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--muted);
  margin: 0 0 1.3em;
}

/* ── Body copy ──────────────────────────────────────────────────────────── */
p { margin: 0 0 0.55em; }
strong { color: var(--fg); font-weight: 600; }
em { color: var(--fg); font-style: italic; }
a { color: var(--fg); text-decoration: underline; text-decoration-color: var(--muted); text-underline-offset: 3px; }

/* Inline mono — subtle technical term, greyscale (not lime). */
code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: var(--fg);
  background: rgb(var(--camp-fg) / 0.06);
  border: 1px solid rgb(var(--camp-border) / 0.7);
  border-radius: 4px;
  padding: 0.04em 0.36em;
}

/* Fenced code blocks — panel on a hairline border. */
pre {
  font-family: var(--font-mono);
  font-size: 14.5px;
  line-height: 1.55;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px 20px;
  overflow: hidden;
}
pre code {
  color: var(--fg);
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
}

/* ── Lists (muted markers) ──────────────────────────────────────────────── */
ul, ol { margin: 0.1em 0 0.55em; padding-left: 0; }
li { margin: 0.42em 0; padding-left: 1.4em; position: relative; list-style: none; }
ul > li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.66em;
  width: 5px;
  height: 5px;
  background: var(--muted);
  border-radius: 1px;
}
ol { counter-reset: item; }
ol > li::before {
  counter-increment: item;
  content: counter(item, decimal-leading-zero);
  position: absolute;
  left: 0;
  top: 0.18em;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--muted);
}
li > ul, li > ol { margin: 0.2em 0; }
li ul > li::before { background: rgb(var(--camp-muted) / 0.6); }

/* ── Tables ─────────────────────────────────────────────────────────────── */
section table {
  border-collapse: collapse;
  width: 100%;
  font-size: 16px;
  margin: 0.25em 0;
  background: transparent !important;
  border: none !important;
}
section table thead,
section table tbody,
section table tr,
section table tr:nth-child(2n),
section table tr:nth-child(2n+1) {
  background: transparent !important;
}
section table th {
  font-family: var(--font-mono);
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  text-align: left;
  font-weight: 400;
  padding: 7px 12px;
  background: transparent !important;
  border: none !important;
  border-bottom: 1px solid var(--border) !important;
}
section table td {
  padding: 8px 12px;
  color: var(--muted);
  background: transparent !important;
  border: none !important;
  border-bottom: 1px solid rgb(var(--camp-border) / 0.35) !important;
}
section table tr td:first-child { color: var(--fg); }

/* ── Blockquote — the one restrained callout (thin lime rule) ───────────── */
blockquote {
  margin: 0.35em 0;
  padding: 12px 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-left: 2px solid var(--accent);
  border-radius: 6px;
  color: var(--fg);
  font-size: 17px;
}
blockquote strong { color: var(--fg); }

/* ── Pagination + footer ────────────────────────────────────────────────── */
section::after {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.14em;
  color: rgb(var(--camp-muted) / 0.7);
  bottom: 36px;
  right: 76px;
}
footer {
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(var(--camp-muted) / 0.6);
  left: 76px;
  bottom: 34px;
}

hr { border: none; border-top: 1px solid rgb(var(--camp-border) / 0.4); margin: 0.5em 0; }

/* ═══════════════════════════════════════════════════════════════════════
 * Layout classes — apply per slide with `<!-- _class: title -->`
 * ═══════════════════════════════════════════════════════════════════════ */

/* title — opening slide: title anchored upper-left, speaker lower-left. */
section.title { justify-content: flex-start; padding: 96px; }
section.title::before { display: none; }
section.title h6 { margin-bottom: 1.6em; }
section.title h1 {
  font-size: 52px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.18;
  margin: 0;
  max-width: 82%;
}
section.title .subtitle {
  font-family: var(--font-mono);
  font-size: 17px;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-top: 1.1em;
}
section.title .speaker {
  margin-top: auto;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
section.title .speaker .who { font-size: 22px; font-weight: 600; color: var(--fg); }
section.title .speaker .tag {
  font-family: var(--font-mono);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--muted);
}

/* lead — centered title slide. */
section.lead { justify-content: center; padding: 76px 96px; }
section.lead h1 { font-size: 46px; font-weight: 600; letter-spacing: -0.02em; }
section.lead h6 { margin-bottom: 1.5em; }
section.lead p { color: var(--muted); font-size: 20px; max-width: 60%; }
section.lead::before { display: none; }

/* divider — quiet section break. */
section.divider { justify-content: center; }
section.divider::before { display: none; }
section.divider h6 { color: var(--muted); }
section.divider h1 { font-size: 44px; }
section.divider h2 { color: var(--muted); font-weight: 350; font-size: 22px; max-width: 68%; }

/* tight — denser body for reference-heavy slides. */
section.tight { font-size: 16.5px; }
section.tight li { margin: 0.18em 0; }
section.tight h1 { font-size: 30px; }
section.tight table { font-size: 15px; }

/* ── Utility spans (inline HTML) ───────────────────────────────────────── */
.mono { font-family: var(--font-mono); }
.label {
  font-family: var(--font-mono);
  font-size: 0.62em;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
}
.lime { color: var(--accent); }
.cyan { color: var(--accent2); }
.purple { color: var(--accent3); }
.muted { color: var(--muted); }
.warn { color: var(--warning); }

/* chip — a bordered mono tag. */
.chip {
  font-family: var(--font-mono);
  font-size: 0.64em;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.15em 0.55em;
  white-space: nowrap;
}

/* columns — two-up grid; wrap slide body in <div class="cols">. */
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; align-items: start; }
.cols.wide { grid-template-columns: 1.3fr 1fr; }

/* card — a panel block for grids. */
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 16px 20px; }
.card h3 { margin-top: 0; }
</style>

<!-- _class: title -->
<!-- _paginate: false -->

###### SITCON CAMP 2026 · ML · PART 1

# 所以，機器到底<br>是怎麼學習的？

<p class="subtitle">SITCON Camp 2026 · ML Part 1</p>

<div class="speaker"><span class="who">Ak</span><span class="tag">Speaker</span></div>

---

###### 講者介紹 · WHO'S TALKING

# Ak

<p><a href="https://kuo.is">kuo.is</a></p>

- 論文發表於 <strong>LLM@IJCAI'23</strong> 與 <strong>SAP@AAAI'24</strong>
- 曾在國科會的 <strong>TAIDE</strong> 計劃打造台灣自己的語言模型
- <strong>SITCON 2025</strong> 議程組長、<strong>2026</strong> 議程組員
- 即將至 <strong>Datalab</strong> 實習，研究語言模型加速
