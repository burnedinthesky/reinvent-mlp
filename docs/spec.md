# "Reinventing the MLP" — As-Built Specification

Target: a phone-first, operator-driven classroom app for a ~3-hour SITCON Camp
course, ~48 students split into ten squads. This document describes **what the
repository actually implements** as of 2026-07-09.

The single biggest architectural fact: **there is no Python backend, no data
scripts, and no offline/mock mode.** The entire app — student UI, operator
console, scoring, identity, data cleaning, synthetic generation, and the
verification harness — is **one TanStack Start (React + Vite) TypeScript
application** that always talks to a live Prisma + SQLite backend through
`createServerFn` RPCs. The earlier "offline vs `VITE_USE_SERVER`" split and the
`LocalDataService` / `LocalAdminService` mocks are **gone**: `HttpDataService`
and `HttpAdminService` are the only implementations.

---

## 0. Global decisions (as-built)

1. **One app, one seam, always live.** The client never scores against ground
   truth directly — it calls server functions and gets back only percentages /
   losses. The student seam is `WorkshopDataService`
   (`src/lib/workshop/data-service.ts`), implemented once by `HttpDataService`;
   the console seam is `AdminService` (`admin-service.ts`), implemented by
   `HttpAdminService`. `getWorkshopService()` returns the singleton.
2. **Full anonymity of survey data.** App identity is `(team, name)` composed
   into a display nickname (§1), backed by a bearer token + 4-digit recovery code,
   structurally unlinkable to survey rows. Survey rows carry an auto-assigned
   English pseudonym only.
3. **Two leaderboard currencies.** `ACC` (accuracy, higher-better) = phases P1,
   P2, P5; `LOSS` (smooth loss, lower-better) = phases P3, P4, and the uni-tier
   `API` channel (`constants.ts`: `ACC_PHASES`, `LOSS_PHASES`). P6 is unscored.
4. **Data splits (as-built).**
   - `realRows` — 48 rows (survey rows, or the seeded stand-in). Labels are blind
     in P1 and ship from P2 onward (phase-gated in `server/gate.ts`; no operator
     flip).
   - synthetic points — a visible/`REVEAL` slice (labels gated by `reveal100`) and
     a `HIDDEN` slice (labels never shipped; all ACC scoring runs here).
   - the **seed** dataset (`dataset.ts`) generates a self-contained fallback; the
     **import/generate** pipeline (`dataset-io.ts`) defaults to 100 visible + 400
     hidden.
5. **Canonical 2-D view.** Fixed to **`SCREEN_AVG` (x) × `CAFFEINE` (y)**
   (`features.ts`). Only the **sleep** label (0 = early bird, 1 = night owl) is
   implemented end-to-end.
6. **Phase gating & reveals are server state** (`AppState` table, read via
   `getStateFn`). The client polls `/state` and mirrors `phase` + `reveals` +
   `selfSelect`. In self-select mode a student may flip a *local* copy of the
   reveal flags to explore; the operator otherwise drives them for the room.
7. **Stack (as-built):** React 19 + TanStack Start + TanStack Router (file-based)
   + Vite 8 + Nitro; Tailwind v4 (dark neon-lime design system). All charts are
   hand-drawn on `<canvas>` (no chart library). P4 terrain building and P6 network
   training run off the main thread. Backend = `createServerFn` + Prisma 7 +
   SQLite (`@prisma/adapter-better-sqlite3`) + a hand-rolled numpy-free scoring
   layer. Nitro build output is a self-contained Node server. Tests: Vitest.
8. **Scale reality check:** ~48 users / 10 squads. The heavy precompute is the
   201×201 loss grid + two P4 MLP terrains, built once per active dataset and
   memoized (`server/store.ts`, `lossgrid.ts`, `terrain.ts`).

---

## 1. Identity & anonymization (as-built)

- **Squad + name identity (`constants.ts`, `fn/identity.ts`).** The camp is ten
  fixed squads, labelled `第一小隊 … 第十小隊` (`TEAM_LABELS`, `TEAM_COUNT = 10`).
  A student picks a squad and types a name; `composeIdentity(team, name)` →
  e.g. `第三小隊 小明`, stored as `Student.nickname` and shown on every board.
  `teamOfNickname()` recovers the squad from the composed string.
- **Tokens.** `joinFn` issues a bearer `token` and a 4-digit `code4`; `rejoinFn`
  re-mints the same identity from `(nickname, code4)`. Every submission carries the
  token in its RPC body. The client persists token/code4 in `localStorage`; the
  code is the real recovery path.
- **Roster whitelist (`server/whitelist.ts`).** The operator can upload a roster of
  allowed `(team, name)` pairs and toggle enforcement; when on, `joinFn` rejects
  non-whitelisted identities.
- **Survey cleaning (`server/dataset-io.ts` `cleanRealCsv`).** Seeded row shuffle,
  per-column median fill, per-feature clamp+round, label from an explicit
  `LABEL_OWL` column or a standardized sleep-composite median split. Pseudonyms are
  `Adjective + Animal` English pairs (e.g. "Sleepy Capybara").

---

## 2. Feature glossary (as-built)

The runtime uses **9 feature columns** (`src/lib/workshop/features.ts`):

| Name | Display | Unit | Range (clamp) | Type | Role |
|---|---|---|---|---|---|
| `SCREEN_AVG` | Screen | min/day | 0–960 | num | **canonical x**, strong |
| `CAFFEINE` | Caffeine | cups/wk | 0–24 | num | **canonical y**, strong |
| `LATE7` | Late nights | /7 | 0–7 | cnt7 | strong |
| `SNACK_DAYS` | Snacks | /7 | 0–7 | cnt7 | strong |
| `LATE_SHOWER` | Late shower | /7 | 0–7 | cnt7 | strong |
| `EARLY_WAKE` | Early wake | /7 | 0–7 | cnt7 | strong (inverse) |
| `GAME_HRS` | Gaming | hr/wk | 0–60 | num | weak-mid |
| `DND_START` | DND start | (banded) | 0–4 | ord(5) | strong |
| `BREAKFAST` | Breakfast | /7 | 0–7 | cnt7 | weak (inverse) |

Axis pickers offer all features **except `DND_START`**. Label: 0 = early bird,
1 = night owl.

---

## 3. Backend component (as-built)

Two layers: **`fn/*`** (`createServerFn` RPC endpoints, the wire surface)
delegating to **`server/*`** (Prisma-backed helpers). The client reaches them
through `HttpDataService` / `HttpAdminService`.

### 3.1 Database schema (Prisma / SQLite)

- **`Student`** — `id (cuid)`, `nickname` (unique, the composed `team+name`),
  `token` (unique, indexed), `code4`, `createdAt`.
- **`Submission`** — `id`, `studentId (FK, cascade)`, `phase`, `payload` (JSON
  string), `score` (primary board value), `score2?` (secondary, e.g.
  `acc_visible`), `flag?`, `createdAt`. Indexed `(studentId, phase)` and
  `(phase)`. `phase ∈ {P1,P2,P3,P4,P5, API}` (P6 is unscored → no rows).
- **`FogQuery`** — `id`, `studentId (FK, cascade)`, `round ('1d'|'2d')`, `w`, `b`,
  `loss`, `seq`, `createdAt`. Backs P3's probe budgets.
- **`AppState`** — `key` (PK) / `value`. Single source of truth for `/state`
  (`phase`, `deadline`, reveal flags, `selfSelect`, roster whitelist).
- **`Dataset`** — `id`, `active` (bool, indexed), `label`, `realRows` (mapped from
  the `real48` column) / `points` / `config` (JSON strings), `meta?`, `source`,
  `createdAt`. One active row = the live scoring bundle.
- **`User`** — legacy scaffold table (email/name), unrelated to the workshop.

### 3.2 Server state (`GET /state`, `server/state.ts`)

```jsonc
{
  "phase": "P1",                 // P1..P6 | NONE
  "deadline": null,              // ISO string or null
  "selfSelect": false,           // students may pick their own phase + local reveals
  "reveals": {
    "reveal100": false,          // ships visible-synthetic labels (P2 on)
    "p2_line_mode": false,       // P2 lasso → w·x + b line boundary
    "p3_wb_plane": false,        // P3 unlock intercept b (off = slope-only w)
    "p3_show_dots": false,       // P3 scatter visible (off = dots hidden)
    "p5_deep": false             // P5 stage 2 — add hidden layers and train
  }
}
```

Reveal flip order and one-line captions live in `constants.ts`
(`REVEAL_KEYS`, `REVEAL_META`). Real/CSV labels are **phase-gated** (blind in P1,
shown from P2), not flag-gated.

### 3.3 Endpoints

**Data (`fn/data.ts`, GET)** — state, config, bundle, real/synth getters. Label
visibility enforced in `server/gate.ts` before anything ships.

**Identity (`fn/identity.ts`, POST)** — `joinFn`, `rejoinFn` (roster-checked).

**Submissions (`fn/submissions.ts`, POST).** Each: auth via token → phase/deadline
gate → attempt-cap check by DB row count → score → record → return.

| Fn | Phase | Cap | Notes |
|---|---|---|---|
| `submitGuessFn {labels}` | P1 | **3** | fraction of `realRows` matched, ×100 |
| `submitP2LabelsFn {sub}` | P2 | **10** | returns `acc_full` + `acc_visible`; lasso or `p2_line_mode` |
| `submitP3LineFn {w,b}` | P3 | **20** | records the landscape loss (LOSS board takes the best/lowest) |
| `submitBotFn {program}` | P4 | **5** | runs the program on the two scored terrains; board value = mean final loss |
| `botSandboxFn {program}` | P4 | **30** | Bowl sandbox run, soft in-memory cap, not scored |
| `submitP5NetFn {sub}` | P5 | **10** | `sub = {axes, arch, weights}`; deep archs rejected while `p5_deep` off; shared cap across both stages |

`LINE_CAP`, `CIRCLE_CAP`, `GUESS_CAP`, `BOT_CAP`, `SANDBOX_CAP`, `P5_CAP` are all
defined once in `constants.ts` and imported by both the enforcing fns and the
admin display table.

**Fog (`fn/fog.ts`, POST).** `fogQueryFn {round, w, b}` → `{loss, remaining}`,
budgets `{'1d': 8, '2d': 20}` enforced via `countFog`. Round `'1d'` pins `b` at the
landscape's `bStar`. Each `'2d'` probe additionally records a `P3` submission so
the best 2d loss lands on the LOSS board.

**Uni-tier (`src/routes/api/query.ts`, raw HTTP POST — now implemented).**
`POST /api/query` with `Authorization: Bearer <token>` and `{w, b}` → `{loss,
remaining}` via `server/uni-query.ts`, budget `API_BUDGET = 100`. Best loss lands
on the `API` LOSS channel. (This was unbuilt in the prior spec.)

**Leaderboard (`fn/leaderboard.ts`, GET).** `teamBoardsFn` powers `/leaderboard`:
for the **currently-selected room phase** it averages each squad's best scores over
its whole roster, returning ranked `PhaseTeamBoard` rows. Public, no token.

**Admin (`fn/admin.ts`, all guarded by `requireAdmin`).** `adminPhaseFn`,
`adminRevealFn`, `adminDeadlineFn`, `adminSelfSelectFn`; `adminImportFn`,
`adminGenerateFn`, `adminGenerateReportFn`; `adminTerrainReportFn` /
`adminRerollTerrainFn` (P4 terrain build status + reseed); `adminDatasetFn` /
`adminDataRowsFn` / `adminPointsFn`; `adminClearDataFn` / `adminResetDbFn`;
`adminGetWhitelistFn` / `adminSetWhitelistFn` (roster); `adminStatsFn` /
`adminPhaseScoresFn` (Scores); `adminDumpFn` (export). Admin auth = a single shared
`ADMIN_TOKEN` (dev default `sitcon-admin`), passed in the RPC body or `?admin_token=`.

### 3.4 Scoring math (`server/scoring.ts`, `lossgrid.ts`, `terrain.ts`, `bots.ts`)

- **P1 guess** (`scoreGuess`): fraction of `realRows` whose submitted label
  matches, ×100.
- **P2** (`scoreCircles`): decision regions (lasso rectangles, or a line in
  `p2_line_mode`) evaluated over the point set; `acc_full` scores every point,
  `acc_visible` the non-hidden set.
- **P3 / fog landscape** (`lossgrid.LossLandscape`): canonical x/y standardized on
  the non-hidden points; a **201×201** logistic-loss grid over `(w,b) ∈ [-4,4]²`.
  Exposes `gMin`, `gMax`, `bStar` (b at the grid argmin — the round-1 pin).
  `submitP3LineFn` and `fogQueryFn` both read this grid.
- **P4 terrains** (`terrain.ts`): three stages — **Bowl** (stage 0, the P3
  landscape, used as the sandbox), **Foothills** (`mlp_a`, H=2), and **Range**
  (`mlp_b`, H=3, a trappy near-flat surface). `SCORED_STAGES = ['mlp_a','mlp_b']`;
  a P4 submission runs the student's training-loop program on each for 100 epochs
  and the board value is the mean final loss. `verifyTerrain()` reports a
  difficulty ladder per stage (surfaced in the console).
- **P5 neuron** (`scoreP5Net`): rebuilds the net from flat weights via the shared
  `buildForward` (≤2 hidden layers, widths ≤6), standardizes inputs over the chosen
  axes (parity with the client's train frame), sigmoid output, threshold 0.5.
  `acc_full` over all points, `acc_visible` over the non-hidden set. Stage 1 ships
  a single-neuron `{layers:[2,1], weights:[w1,w2,b]}`; stage 2 a trained MLP.

---

## 4. Data component (as-built, TypeScript — no Python)

`src/lib/workshop/dataset-io.ts` (pure, no Prisma) is driven from the admin console
and persisted via `activateDataset` into the `Dataset` table.

- **`cleanRealCsv(csvText, seed)`** → `{realRows, report}`. Quote/comma-aware parse,
  `∞`/`inf`/`無` handling, seeded shuffle, median fill, clamp+round, pseudonyms,
  label from `LABEL_OWL` or derived. `balanceReport` = owl/early counts + per-feature
  point-biserial `r`.
- **`generateSynth(realRows, opts)`** → `{points, report}`. Defaults
  `strategy='wedge'`, `sep=1`, `noise=1.3`, `mix=0.55`, `flip=0.05`, `seed=7`,
  `reveal=100`, `hidden=400`. Emits real + `s*` (reveal) + `h*` (hidden) points.
- **`verify(points)`** — the §4.4 harness as `VerifyCheck` bands: one-line ceiling
  0.83–0.87, kNN(9) ≤ oneLine + 0.08, balance 0.46–0.54, max solo-feature AUC ≤ 0.85,
  ≥ 6 signal features (AUC ≥ 0.62).
- **Seed dataset (`dataset.ts` `buildDataset`)** — the no-import fallback;
  `server/store.ts` falls back to it so the app is fully playable pre-import.
- **Loss grid + terrains** are computed at load time from the active dataset's
  non-hidden points and memoized per dataset id.

---

## 5. Frontend component (as-built)

React SPA, **phone-first**, dark neon-lime design system. Charts are hand-drawn on
`<canvas>` via a shared sizing hook and draw modules under `src/lib/workshop/draw/`.

### 5.1 Shell & state

- **`WorkshopApp`** → `WorkshopProvider` + switch between `JoinScreen` and
  `AppShell` on `store.screen`.
- **`JoinScreen`** — squad picker (`setTeam`) + name field (`setName`) → `join()`.
- **`AppShell`** — `Header` (logo, phase stepper, countdown timer, identity chip;
  per-phase reveal toggles when self-select is on) + `PhaseView`.
- **State (`src/state/WorkshopContext.tsx`)** — a `useReducer` store, one persisted
  serializable slice per phase (`p1`…`p6`) so work survives phase switches. The
  non-serializable P4 program engine and the P6 CNN engine (`cnnEngineRef`) live on
  the context so they survive remounts. A second reducer holds loaded server data
  (`config`, `realRows`, `points`, `reveals`, `selfSelect`, `ready`).

### 5.2 Phase views (`src/components/workshop/phases/`)

- **P1 — Guess the Class (`P1Guess.tsx`).** Card-deck labeler over 48 pseudonymous
  classmates: keyboard `A`/`B` + `←`/`→`, per-feature bars with a class-median tick,
  deck vs review mode, sort selector. Submit → `submitGuess` (3 attempts).
- **P2 — Circles (`P2Circles.tsx`).** Canvas scatter; brush decision regions
  (lasso by default, or a `w·x + b` line under `p2_line_mode`), assign class, pick
  X/Y axes, set `default_cls`, live known-set accuracy. Submit → `submitP2Labels`
  (10 attempts).
- **P3 — Fog (`P3Line.tsx`).** Fit a straight boundary against a fogged logistic
  loss landscape. Slope-only by default; `p3_wb_plane` unlocks the intercept `b`;
  `p3_show_dots` surfaces the scatter. Budget 20 (`LINE_CAP`); a LOSS phase.
- **P4 — Bots (`phases/p4/P4Bots.tsx`).** A **training-loop card program**
  (observe / vars / logic / actions, 8-direction moves, ∇ gradient, a card cap and
  a loss-curve + variable-watch panel). Test in the **Bowl** sandbox
  (`botSandbox`, soft cap 30), then deploy across the two scored terrains
  (**Foothills** / **Range**) as a 100-epoch walk on a 3D loss surface. Submit →
  `submitBot` (5 scored). Sub-components: `CardRow`, `IfCardRow`, `ProgramRail`,
  `ParamPopover`, `VarLegend`, `VarWatchPanel`, `LossCurve`, `varinfer.ts`.
- **P5 — Neuron (`P5Neuron.tsx`).** **Stage 1:** hand-tune one sigmoid neuron
  (`w1/w2/b` sliders, range [-4,4]) over z-scored axes; probability heatmap with a
  dashed p=0.5 boundary and a live σ(z) inset. **Stage 2** (gated by `p5_deep`):
  add 1–2 hidden layers × 1–6 neurons and train with gradient descent — steppers /
  LR / loss + accuracy sparkline, neuron-click activation-surface inspection. One
  `{axes, arch, weights}` payload; submit → `submitP5Net` (10 attempts, shared).
- **P6 — Playground (`P6Playground.tsx`).** A real in-browser **dense MLP over
  image datasets** — MNIST, Fashion-MNIST, KMNIST, CIFAR-10 (`lib/workshop/cnn/`).
  Datasets ship as gzipped raw-pixel blobs (`public/datasets/*.bin.gzip` + a JSON
  manifest), decoded via `DecompressionStream('gzip')` on the main thread; training
  runs in a **Web Worker** (`trainer.worker.ts` via `client.ts`), with architecture
  presets, activation choice, and hover-a-neuron activation visualization. **No
  scoring, no leaderboard** — the closing free-play lab.

### 5.3 Operator console (`/admin`, `src/components/admin/`)

`AdminConsole` = `TokenGate` (password → `ADMIN_TOKEN`, persisted; also accepts
`?admin_token=`) + `StatusStrip` (live phase / countdown / reveal chips /
active-dataset badge) + a staged left nav (a section unlocks once its gate is met):

- **Setup** (`import`, gate `none`) — CSV paste / file / Sheet URL, label choice,
  balance report; data table + Clear / Reset DB.
- **Generate** (gate `imported`) — strategy + sliders, verification bands, wedge
  preview, activate; rerolls + reports the P4 terrains.
- **Roster** (gate `none`) — squad whitelist upload/edit + enforcement toggle.
- **Live Ops** (gate `generated`) — set phase, toggle self-select, flip the five
  reveals, arm/clear the countdown.
- **Scores** (gate `generated`) — students joined, per-phase submission + attempt
  stats, per-phase score boards, full JSON export.

The console runs entirely on the real `HttpAdminService` → `fn/admin.ts` endpoints.

### 5.4 Public board & standalone playground

- **`/leaderboard`** — a public, read-only page ranking all ten squads on the
  currently-selected room phase (average over the whole roster); polls every 2 s,
  shows the operator's armed countdown. Replaces the never-built `/projector`.
- **`/mlp-playground`** — a standalone, purely client-side MLP playground. Reuses
  the workshop provider to join and pull the dataset bundle, then trains in-browser
  with no server scoring.

---

## 6. Implemented vs. not (summary)

**Implemented:**

- Squad `(team, name)` identity with token/`code4` recovery and an optional roster
  whitelist.
- All six phases P1–P6 with real interaction; P1/P2/P3/P4/P5 scored server-side with
  DB-enforced attempt caps (3 / 10 / 20 / 5 / 10, + 30 sandbox); P6 the unscored CNN
  lab.
- Fog probe budgets 8 / 20; the 201×201 loss grid + two P4 MLP terrains, memoized.
- Server-gated reveals (`reveal100`, `p2_line_mode`, `p3_wb_plane`, `p3_show_dots`,
  `p5_deep`), phase-gated real labels, self-select mode.
- The public per-phase **squad leaderboard** (`/leaderboard`) and the standalone
  `/mlp-playground`.
- The raw **`POST /api/query`** uni-tier channel (Bearer token, 100-query budget →
  the `API` LOSS channel).
- CSV clean + synth generate + verification harness; dataset activation & landscape
  caching; the fully wired admin console (`HttpAdminService`) — Setup / Generate /
  Roster / Live Ops / Scores, including export.

**Not present (removed or never built):** the offline / `VITE_USE_SERVER` dual-mode
and the `Local*Service` mocks; the `/projector` route (superseded by
`/leaderboard`); the house-bot seeding + projector-scene picker from the original
plan.

---

## 7. Running it

```bash
pnpm install
pnpm db:generate
pnpm db:push        # create prisma/dev.db from schema.prisma
pnpm dev            # http://localhost:3000 (always live backend)
pnpm test           # Vitest
pnpm build          # Nitro self-contained Node server → node .output/server/index.mjs
```

Admin console: `/admin` (token `sitcon-admin` in dev, or `?admin_token=…`).
Camp-day data path: survey form → Sheet CSV → admin **Setup** (balance report → pick
label) → **Generate** (verification report + terrain build) → activate → **Roster**
→ **Live Ops** → open P1. All of it happens **inside the app**; no external scripts.
