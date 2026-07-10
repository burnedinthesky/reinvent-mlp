# Reinventing the MLP — SITCON Camp 2026

A live, operator-driven, phone-first classroom app that teaches how a multilayer
perceptron works by having a room full of students **build one by hand**, phase
by phase, racing each other as ten squads on a shared leaderboard while an
operator drives the tempo from a console.

---

## Description

Students join on their phones by picking their **squad** (第一小隊 … 第十小隊) and
typing a name; the identity is never linked to their survey answers. They move
through six phases. Each phase is a small, tactile ML game; the scored ones grade
against a hidden test set on the server:

| Phase  | Name             | What students do                                                          | Scored |
| ------ | ---------------- | ------------------------------------------------------------------------- | ------ |
| P1     | Guess the Class  | Hand-label 48 pseudonymous classmates as *night owl* / *early bird*.       | ✅ ACC |
| P2     | Circles          | Brush decision regions (lasso, or line mode) over a scatter plot.          | ✅ ACC |
| P3     | Fog              | Fit a boundary `y = wx + b` on a fogged loss landscape — descent by hand.  | ✅ LOSS |
| P4     | Bots             | Assemble a card-based training loop and run it down MLP loss terrains.     | ✅ LOSS |
| P5     | Neuron           | Hand-tune one sigmoid neuron, then unlock hidden layers and train.         | ✅ ACC |
| P6     | Playground       | A real in-browser MLP trained live over four image datasets (a CNN lab).   | — |

Three surfaces plus two side channels, one backend:

- **`/`** — the student workshop app (phones).
- **`/admin`** — the operator console: import the survey CSV, generate & verify a
  synthetic dataset, manage the squad roster, drive phase/reveal/deadline
  "theater," and watch live per-phase scores.
- **`/leaderboard`** — the big-screen public board: ranks all ten squads on the
  **currently selected room phase**, live, no token required.
- **`/mlp-playground`** — a standalone, purely client-side MLP playground.
- **`/api/query`** — a raw HTTP loss oracle for "uni-tier" students driving
  descent from `curl` / Python.

Everything is **live from the backend** — there is no offline/mock mode. The room
boots fully *gated* (hidden labels and later beats not revealed) and the operator
opens each beat at the dramatic moment.

---

## Feature overview

### Identity & anonymity

- **Squad + name join** — a student picks one of ten fixed squads and types a
  name (`JoinScreen`). The two are composed into a single canonical identity by
  `composeIdentity(team, name)` → e.g. `第三小隊 小明`, stored as
  `Student.nickname` and shown on every board. Under the hood the student still
  receives a bearer **token** (in `localStorage`) plus a **4-digit recovery
  code** (`code4`) that re-mints the same identity after a reload or machine swap.
- **Roster whitelist (optional)** — the operator can upload a roster; when
  enforcement is on, only whitelisted `(team, name)` pairs may join.
- **Structural anonymity** — the survey is filled in an external form with no
  identity fields; the app's `Student` row is unlinkable to any survey answer. The
  survey sheet can be deleted after import with nothing in the app pointing back.

### The six phases

Each phase is a self-contained student view (`src/components/workshop/phases/*`).
Scored phases grade server-side against the active dataset; attempt caps are
enforced by DB row count (single source of truth in
`src/lib/workshop/constants.ts`), never on client trust.

| Phase | View | Mechanics | Score / cap |
| ----- | ---- | --------- | ----------- |
| **P1 · Guess the Class** | `P1Guess` | Card-deck labeler over 48 pseudonymous classmates with per-feature bars + a class-median tick; label owl/early with `A`/`B` keys, reorder by any feature (sort selector → discovers thresholding), fix stragglers in review mode. | accuracy %, **3 attempts** |
| **P2 · Circles** | `P2Circles` | Scatter of the 48 real points + revealed synthetic + hidden points; pick X/Y axes and brush decision regions. Default **lasso** regions; the operator can flip **line mode** (`p2_line_mode`) to a `w·x + b` boundary. Set a default class; live known-set accuracy. | `acc_full` + `acc_visible`, **10** |
| **P3 · Fog** | `P3Line` | Fit a straight boundary against a **fogged** logistic-loss landscape. Round 1 is slope-only (`w`, `b` pinned); the operator flips **`p3_wb_plane`** to unlock the intercept `b`, and **`p3_show_dots`** to surface the scatter. Gradient descent *by hand* against a smooth loss oracle. | best loss, **20** budget |
| **P4 · Bots** | `p4/P4Bots` | Assemble a **training-loop program** from cards (observe / vars / logic / actions, 8-direction moves), test it in the **Bowl** sandbox, then deploy it across two scored MLP loss **terrains** — **Foothills** (`mlp_a`) and **Range** (`mlp_b`) — each a 100-epoch walk visualized on a 3D loss surface with a loss curve + variable-watch panel. | mean final loss, **5 scored** (+30 sandbox) |
| **P5 · Neuron** | `P5Neuron` | **Stage 1:** hand-tune a single sigmoid neuron (`w1/w2/b` sliders over two z-scored axes) and watch BCE loss + the decision heatmap. **Stage 2** (gated by **`p5_deep`**): add 1–2 hidden layers and train with gradient descent; click a hidden neuron to inspect its learned surface. | `acc_full`, **10** (shared pool) |
| **P6 · Playground** | `P6Playground` | A real in-browser dense MLP trained in a **Web Worker** over four bundled image datasets (MNIST, Fashion-MNIST, KMNIST, CIFAR-10). Pick architecture/activation, watch loss + accuracy climb, hover a neuron to see what it responds to. **No scoring, no leaderboard** — the closing free-play lab. | — |

There is also a reserved **`NONE`** ("Standby") stage — a deliberately blank
"focus screen" the operator can push to pull all eyes off phones.

### Reveal "theater" (server-gated)

Five reveal flags let the operator open each dramatic beat; **hidden data never
ships to the client until its flag is on** (`server/gate.ts`), so a student cannot
cheat by reading the payload. In **self-select** mode students may flip their own
copy of these locally to explore; otherwise the operator drives them for the room.

| Flag | Phase | Opens |
| ---- | ----- | ----- |
| `reveal100` | P2 | ships the 100 synthetic *visible* training labels (Phase 2 on) |
| `p2_line_mode` | P2 | switches P2 from lasso regions to a `w·x + b` line boundary |
| `p3_wb_plane` | P3 | unlocks the intercept `b` — the full `(w, b)` plane (off = slope-only) |
| `p3_show_dots` | P3 | shows the P3 scatter (off = dots hidden until the submit flash) |
| `p5_deep` | P5 | unlocks P5 stage 2 — add hidden layers and train (off = single neuron) |

The 48 real/survey labels are **phase-gated** (blind in P1, shipped from P2
onward) rather than flag-gated.

### Operator console (`/admin`)

Five sections, unlocked by a staged gate (import unlocks Generate; a verified
generate unlocks Live Ops and Scores):

- **Setup** (`import`) — import the survey CSV (paste / upload / published-Sheet
  URL); a strict column + label header contract is checked before import; a
  **balance report** shows owl/early counts and per-feature point-biserial *r*.
  Includes a data table and a danger-zone **Clear** / **Reset DB**.
- **Generate** — synthesize a teaching dataset (strategy `wedge` with
  `sep / noise / mix / flip / seed` knobs), run the **§4.4 verification harness**
  (one-line ceiling, kNN ceiling, balance, max solo-feature AUC, signal-feature
  count) with pass/tune bands, preview the wedge, and **activate**. Also **rerolls
  the P4 loss terrains** and reports their difficulty ladders.
- **Roster** — upload/edit the squad whitelist and toggle join enforcement.
- **Live Ops** — set the phase, toggle **students self-select phase**, flip the
  five reveals, and arm a countdown deadline.
- **Scores** — students joined, submissions + attempt-usage per phase, per-phase
  score boards, and a full JSON **export** dump — live from the submission log.

The console is gated by `ADMIN_TOKEN` (`?admin_token=…` also works).

### Scoring, boards & the uni-tier channel

- **Two leaderboard currencies, never mixed:** an **ACC** metric (best hidden-set
  accuracy: P1, P2, P5) and a **LOSS** metric (best smooth loss: P3, P4, and the
  uni-tier `API` channel) — see `ACC_PHASES` / `LOSS_PHASES` in `constants.ts`.
- **Team leaderboard** (`/leaderboard`) — ranks all ten squads on the
  **currently-selected room phase**; a squad's value is the **average over its
  whole roster**, so a squad with no scorers lands on 0% (ACC) / a worst-case loss
  (LOSS). Public, read-only, polls every ~2 s.
- **Uni-tier `POST /api/query`** — a raw HTTP loss oracle (Bearer token, `{w,b}`
  body, 100-query budget) so "uni-tier" students can drive descent from `curl` /
  Python instead of the GUI. Best loss lands on the `API` LOSS channel.

### Resilience

- **Fully-gated boot** — the room starts with hidden data unrevealed and reveals
  off; safe to run before the first beat.
- **Server-authoritative deadline** — the armed countdown is enforced server-side
  (`server/guard.ts` rejects late submissions); the client clock is display-only.
- **Disconnect guard** — the student poll flips offline after ~2 failed ticks and a
  blocking "Reconnecting…" overlay prevents acting outside operator control until
  the room is reachable again.
- **Seed fallback** — with no imported dataset the app runs on a built-in synthetic
  seed, so the whole course is playable even if the live data pipeline fails.

---

## Systems overview

**Stack:** TanStack Start + TanStack Router (React 19, file-based) · Vite 8 ·
Nitro · Tailwind CSS v4 · Prisma 7 + SQLite (better-sqlite3 driver adapter).
All charts are hand-drawn on `<canvas>` (no chart library); P4's terrain and P6's
training run off the main thread.

### The service seam

The UI never talks to the network directly. It goes through two typed seams:

- **`WorkshopDataService`** (`src/lib/workshop/data-service.ts`) — the student
  app's data interface. Its one implementation, **`HttpDataService`**, calls
  TanStack `createServerFn` RPCs in `src/lib/workshop/fn/*`.
- **`AdminService`** (`src/lib/workshop/admin-service.ts`) — the console's data
  interface, implemented by **`HttpAdminService`**, calling the `/admin` server
  functions (gated by `ADMIN_TOKEN`).

```
 React UI ──> WorkshopDataService / AdminService  (typed seams)
                     │
                     ▼
             Http*Service  ──> createServerFn (fn/*)  ──┐
                                                        ├─> server logic ──> Prisma ──> SQLite
   curl / Python ──> POST /api/query (raw HTTP route) ──┘
```

The raw **`POST /api/query`** route (`src/routes/api/query.ts`) is a plain HTTP
surface over the same `uniQuery` handler, so "uni-tier" students can hit the loss
oracle with `curl`/`requests` using an `Authorization: Bearer <token>` header.

### Server responsibilities

- **Reveal gating is enforced server-side** (`server/gate.ts`). Hidden-set labels
  never ship to the client; the 48 survey labels ship only from P2 onward
  (phase-gated), synthetic visible labels only after `reveal100`. The client
  cannot cheat by reading the payload.
- **`AppState`** (a key/value table) is the single source of truth for
  `phase`, `deadline`, the reveal flags, `selfSelect`, and the roster whitelist.
  An operator flip is durable across restarts and reaches every client on its next
  poll.
- **Scoring** runs against the active `Dataset` row and a memoized loss
  landscape (`server/store.ts`, `server/scoring.ts`); P4 additionally builds two
  MLP **terrains** (`terrain.ts`) once per dataset. Attempt caps and query budgets
  are enforced authoritatively from DB row counts, not client trust.
- **P5 & P6 are a deliberate client/server split**: the net trains *in-browser*;
  for P5 only the serialized weights go to the server for hidden-set scoring, and
  P6 never scores at all.

### Live sync

The student app polls `GET /state` every few seconds so admin reveals, phase
changes, and the countdown deadline converge on every phone within one poll. If
the poll can't reach the room for two ticks, a reconnecting overlay blocks the
phone until it's back. The `/leaderboard` board polls the current phase + squad
scores every ~2 s.

### Routes

| Route             | Surface                                                  |
| ----------------- | -------------------------------------------------------- |
| `/`               | Student workshop app                                     |
| `/admin`          | Operator console (`?admin_token=…` or token gate)        |
| `/leaderboard`    | Public per-phase squad leaderboard (read-only, no token) |
| `/mlp-playground` | Standalone client-side MLP playground                    |
| `/api/query`      | Raw uni-tier loss oracle (`POST`, Bearer token)          |

---

## Dev guide

Prerequisites: Node 20+ and `pnpm`.

```bash
pnpm install

# database: generate the client and create the local SQLite file
pnpm db:generate
pnpm db:push            # creates prisma/dev.db from schema.prisma

pnpm dev                # http://localhost:3000
```

Server functions run in dev automatically via the Nitro plugin — the app always
talks to the live backend (there is no offline flag).

Because the room boots **fully gated**, the first-run flow is:

1. Open **`/admin`** and enter the `ADMIN_TOKEN` (dev default: `sitcon-admin`).
2. **Setup** → import a survey CSV (paste, upload, or a published-Sheet URL).
3. **Generate** → synthesize & verify the training set and build the P4 terrains
   (unlocks Live Ops + Scores).
4. **Roster** → optionally upload the squad whitelist and enable enforcement.
5. **Live Ops** → set the phase, flip reveals (`reveal100`, `p3_wb_plane`,
   `p5_deep`, …), toggle self-select, arm a countdown.
6. Open **`/`** in another tab, pick a squad + name, and watch phase/reveal/
   deadline propagate within one poll. Open **`/leaderboard`** for the big screen.

Useful scripts:

```bash
pnpm test             # vitest
pnpm lint             # eslint
pnpm format           # prettier --write + eslint --fix
pnpm check            # prettier --check
pnpm db:studio        # inspect the SQLite DB
pnpm db:reset         # drop & re-migrate (wipes local data)
pnpm generate-routes  # regenerate the route tree after adding a route
```

**P6 dataset assets.** The Playground CNN lab reads pre-built blobs from
`public/datasets/` (MNIST / Fashion-MNIST / KMNIST / CIFAR-10). These are
**committed to the repo**, so a fresh clone builds and runs without any extra
step. They are *not* generated at build time — a Vite guard (`p7-dataset-guard`)
instead **hard-fails `pnpm dev` and `pnpm build`** if any of the four is missing
or isn't the expected 2000-train + 200-val split. Only regenerate them if you need
to refresh or repair the assets:

```bash
node scripts/build-datasets.mjs              # download real sets, sample subsets
node scripts/build-datasets.mjs --synthetic  # offline: deterministic fakes
node scripts/build-datasets.mjs --only=cifar10,mnist   # rebuild a subset
```

---

## Deployment guide

The app builds to a self-contained Nitro node server.

```bash
pnpm install
pnpm db:generate

# apply the schema to the target database
pnpm exec prisma migrate deploy    # or: pnpm db:push for a fresh SQLite file

pnpm build                         # emits .output/
node .output/server/index.mjs      # serves the app (default port 3000)
```

Required environment on the host:

| Variable        | Purpose                                                              |
| --------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`  | SQLite path, e.g. `file:./prisma/dev.db` (the default fallback).     |
| `ADMIN_TOKEN`   | **Set a real value** — gates every `/admin` endpoint. The dev default `sitcon-admin` must not ship to a live camp. |
| `PORT`          | Optional; server port (default 3000).                               |

Camp-day (single-host LAN) layout:

- Run the node server on the **podium machine**; put every device on the same LAN.
- **`/`** on student phones, **`/admin`** on the operator's laptop
  (`/admin?admin_token=…` to skip the gate), **`/leaderboard`** on the big screen.
- The SQLite file *is* the workshop state — back it up between sessions; use the
  console's **Scores → Export** (full dump) for a snapshot. **Setup → Clear data**
  wipes submissions/datasets back to the seed state for the next run.
