# P4 Redesign — "Expedition" Specification

> **⚠️ Superseded again by the v3 UX & language overhaul (2026-07-09,
> `~/.claude/plans/quirky-moseying-frost.md`).** v3 replaced the hidden `loss`
> register with explicit `Look → 〈A–D〉` slot bindings, added the 8-probe
> `Scan → 〈A–D〉` observe card, renamed `LR ×` to `Step ×` ("step size
> (= learning rate)"), made Jump reset `epochs since best`, rebuilt the ref
> ladder (DRUNK/PROBE/SCAN/SCAN_DECAY/FULL), added the flat-terrain
> ladder-spread gate, and rebuilt the editor rail (setup blocks + REPEAT
> C-bracket + SCORE strip). Current reference: `p4-usage-guide.md`.

> **⚠️ Superseded in part by the "Training Loop" redesign (2026-07).** The
> Apple-Shortcuts card language specified below (relative-heading
> Peek/Feel/∇/Step/Turn/Stride/Jump/If, 8-card cap, `slope_unlocked` ∇ gate) was
> **replaced** by a 6-card, 4-category primitive language: **OBSERVE** `Look`,
> **VARIABLES** `Set A–D`, **LOGIC** `If` (multi-card then/else branches),
> **ACTIONS** `Move`/`Jump`/`LR ×`. Deltas that override this doc:
> - **Absolute 8 directions** (N…NW compass rose), no heading, no Turn card.
> - **Typed A–D variables** (numbers or directions, validator-inferred); students
>   hand-build argmin rather than using a `Step toward lowest peek` card.
> - **∇ Slope and all `slope_unlocked` plumbing removed** entirely.
> - Loop cap **20** (If counts as 1; branches ≤3 each, uncounted); the loop is
>   framed as a **×100-epoch training loop** with a **live loss-vs-epoch curve**
>   (smooth true-loss revealed at JUDGE), a **variable watch panel**, and
>   compass-rose param **popovers** (no tap-to-cycle).
> - Reference ladder rewritten to **DRUNK / PROBE / ARGMIN / DECAY / RESTART**.
>
> **Unchanged:** stages & terrain generation, scoring model, seeding scheme,
> reveal/fog + reload recovery, sandbox/expedition modes and caps, the 3-D
> renderer core, admin terrain panel, DB schema. The rest of this doc still
> describes those faithfully; treat §2–3 (the card language) as historical.

Status: **agreed design, not yet built** (2026-07-07). This document specifies the
replacement for the current P4 bot builder described in `spec.md §3.4 / §5.4` and
`user-journey.md B4`. Decisions locked with the course owner:

1. **Language:** Apple-Shortcuts-style linear card list with magic-value chips
   (not parameterized slots, not nested Blockly).
2. **Training mechanic:** **batch = 1 everywhere** — every loss reading samples one
   random training point; the judged score is always the true full-batch loss.
3. **Terrain:** the P3 **Bowl** stays as the bridge/sandbox stage; the **scored
   stages are data-derived** (tiny frozen MLP over the live dataset, 2 free
   weights) and deliberately **hard to optimize** (local minima, saddles,
   plateaus), validated by a hardness harness.
4. **Visualization:** hand-rendered **canvas isometric 3D** heightfield with
   fog-of-war and a top-down (w, b) minimap. No new dependencies.

---

## 0. Learning objectives & why this replaces the current P4

The current blocks (`neighbors4`, `decay`, `gradient`) *are* the concepts — a
student picks the answer off a shelf. The redesign hands out only dumb
primitives (peek, step, turn, jump, multiply-stride, if) and engineers the
terrain and budget so the concepts are **rediscovered under pressure**:

| Concept | How the student runs into it |
|---|---|
| **Training (SGD, batch=1)** | Every reading asks *one random classmate*: the same spot gives different numbers. The judge at the end asks the whole class (true loss). Noisy signal vs. true objective — felt, not lectured. |
| **Automated parameter search via loss descent** | The whole phase: their P3 hand-dragged anchor becomes a programmed walker on the same (w, b)-style plane. |
| **Gradient descent** | Students compose `Peek ×4 → Step toward lowest peek` themselves. The mid-phase `slope_unlocked` reveal then names it: the ∇ compass card does their 4 peeks in one reading — "that's the derivative." |
| **Learning-rate decay** | The 100-iteration budget + noise + a narrow valley: big fixed strides orbit and ping-pong, small ones run out of time. `Stride ×0.9` is on the shelf; the *insight* isn't. With batch=1 noise, decay is genuinely *necessary* to settle — the honest reason LR schedules exist. |
| **Non-convex loss surfaces** | The scored terrain comes from the *same dataset* pushed through a tiny neural net with two free knobs. More knobs ⇒ wilder terrain. Local minima motivate restarts; saddles/plateaus motivate patience. Foreshadows P6: "the playground net's landscape looks like this, in thousands of dimensions." |

**Bridge from P3 (mandatory continuity):** P3 ends with the student dragging an
anchor around the (w, b) square chasing a judged loss. P4 opens on *the exact
same landscape* ("The Bowl") with the pitch: "you dragged the anchor 20 times by
hand — now build the robot that drags it." The student's own P3 probe dots
(`store.p3.probes`, already client-side) render as ghost dots on the Bowl's
minimap.

---

## 1. Phase structure & pedagogical beats (25-minute slot)

Two run modes, three stages:

- **Stage 0 — The Bowl** (`bowl`). The P3 `LossLandscape` grid, unchanged.
  **Sandbox:** unlimited-ish test runs (soft cap §6.4), never recorded, never on
  the board. Terrain visible from the start (post-P3 it is public knowledge).
- **Stage 1 — Foothills** (`mlp_a`). Data-derived, moderately hard (≥2 minima,
  ≥1 saddle). Scored.
- **Stage 2 — The Range** (`mlp_b`). Data-derived, hard (≥3 minima, plateaus,
  narrow global valley). Scored.

A **scored Expedition** runs the student's one program on *both* scored stages
(fresh bot per stage, same program). Board value = mean of the two final true
losses. `BOT_CAP = 5` expeditions, server-enforced as today.

Beat sheet:

| Time | Beat | Mechanic |
|---|---|---|
| 0–3 min | Live demo: build 醉猴 (`Turn random → Step ahead`) in the editor, deploy on the Bowl, watch it stumble in 3D. | card editor + iso view |
| 3–10 min | Sandbox on the Bowl. Students discover greedy peeking, meet the reading noise ("why does the same spot give two numbers?" — answer it out loud: *one classmate per question*). | sandbox runs, batch=1 |
| ~10 min | **∇ reveal** (`slope_unlocked`): compass card unlocks on every screen. Pitch: "most of you built peek-around-and-step. Calculus does your four peeks in one reading — meet the derivative." | reveal + locked card |
| 10–22 min | Expeditions. First deploy reveals the Foothills/Range terrain (rise-from-flat animation) after the run replays on fog. Students post-mortem their traps, iterate: restarts, decay, patience counters. | 5 scored runs |
| 22–25 min | Wrap on the LOSS board: top programs narrated (payload carries the card list). Closing: "noisy one-classmate readings + shrinking steps = **stochastic gradient descent**. On Friday's net the terrain has thousands of axes — same robot." | leaderboard |

The compass is **not strictly dominant**: it reads the *single-sample* downhill
direction (batch=1, like every other reading), so it is noisy, and it stalls on
plateaus/saddles where |∇|≈0 while crude peek-around can escape. Exploration
stays alive after the unlock.

---

## 2. The bot machine (execution model)

Runs server-side only (§6). All randomness from the existing deterministic
per-(student, attempt) rng (`hashSeed(id) + used`); sandbox runs use
`hashSeed(id) + 1000 + sandboxCount` so they never collide with scored seeds.

**State per run:**

| Field | Init | Notes |
|---|---|---|
| `pos: {w, b}` | setup card | clamped to `[-4, 4]²` (existing `clampG` range) |
| `heading: number` | setup card | degrees, 0 = +w axis, CCW |
| `stride: number` | setup card | distance per Step, in grid units |
| `here: Reading` | sampled on spawn | see reading semantics below |
| `best: Reading` | `= here` | lowest `here` sample seen (noisy) |
| `sinceBest: number` | 0 | iterations since `best` improved |
| `tray: Peek[]` | empty | peeks accumulated since the last Step |

**Reading semantics (batch = 1).** A reading at `(w, b)` picks one training
point uniformly from the landscape's `trainZ` slice (non-hidden points — same
population the true grid averages over) and returns that single point's loss
term under the stage's model at `(w, b)`. For the Bowl this is the per-point
logistic term from `lossgrid.ts`; for MLP stages the per-point BCE term (§4).
Displayed readings therefore jiggle; the true grid is only used by the judge,
the terrain render, and the reference bots.

**Loop.** `REPEAT ×100` iterations (unchanged rail). Each iteration executes
the program's cards top-to-bottom. Every `Step`/`Jump` automatically takes a
fresh reading at the new position and updates `here`/`best`/`sinceBest`
(moving = you learn, noisily, where you are; peeking is optional extra
sensing). `sinceBest` increments once per iteration when `best` doesn't
improve.

**Termination & judging.** After 100 iterations the run ends **where it
stands**. The judged score for a stage is the **true full-batch loss at the
final position** — not the best-sampled position. Rationale: with noise, "best
sample" rewards lucky draws; final-position scoring forces *convergence*, which
is what makes decay the winning move, and mirrors real training ("you ship the
weights you end with"). The HUD contrasts the bot's last noisy `here` with the
judge's true number — a small generalization beat for free.

**Bounds.** Program ≤ 8 loop cards ⇒ ≤ 800 card executions, ≤ ~800 readings,
trajectory ≤ ~300 moves per stage. All well within existing payload norms.

---

## 3. The card language

### 3.1 Program shape

```jsonc
{
  "setup": {
    "start":   "center" | "random",
    "stride":  0.1 | 0.25 | 0.5 | 1.0 | 2.0,     // preset dial
    "heading": "random" | 0 | 45 | ... | 315      // 45° dial
  },
  "loop": [ Card, ... ]                            // 1..8 cards
}
```

### 3.2 Card catalog

Direction dials are **relative to heading** in 45° steps (`ahead`, `±45°`,
`±90°`, `±135°`, `behind`) — there is deliberately **no absolute-position card**
(no "go to (x, y)"). Programs can only express *strategies*, never coordinates,
so revealing terrain after a run cannot be gamed.

| # | Card | Params | Semantics | Chip output |
|---|---|---|---|---|
| S1 | **Peek** `〈dir〉` | direction dial | reading one `stride` away in that direction (no move); appended to the tray | `Reading` |
| S2 | **Feel here** | — | fresh reading at current position; updates `here` | `Reading` |
| S3 | **∇ Slope compass** 🔒 | — | fills the tray with the single-sample steepest-descent direction (central differences on one sampled point's loss term). Locked until `slope_unlocked`; server rejects when locked. | direction in tray |
| A1 | **Step** `〈dir〉` | direction dial **or** `toward lowest peek` | move one `stride`; `toward lowest peek` aims at the tray's argmin (no-op if tray empty); the tray clears; heading updates to the direction moved; auto-reading at the new spot | — |
| A2 | **Turn** `〈amount〉` | ±45°, ±90°, 180°, random | rotate heading | — |
| A3 | **Jump somewhere random** | — | teleport uniform in `[-4,4]²`; auto-reading; tray clears | — |
| M1 | **Stride ×** `〈f〉` | ×0.5, ×0.9, ×0.95, ×1.1, ×2 | multiply stride, clamped to `[0.01, 2.0]` | — |
| L1 | **If** `〈A〉 〈<|>〉 〈B〉 → 〈card〉` (else `〈card〉`) | A, B ∈ chips or a number dial; each branch holds exactly **one** non-If card (else optional) | linear conditional, Shortcuts-style — no nesting | — |

**Magic chips** (readable anywhere a card takes a value): `Reading` (most
recent reading), `Here`, `Best`, `Steps since best`, and number dials. The
"semi-context continuum": each Sense card's output is auto-bound to `Reading`,
so `Peek ahead → If Reading < Here → Step ahead → else Turn 90°` reads like a
sentence with no explicit variables.

**Reference programs** (used in demos, the house bot, and the terrain harness §4.3):

- 醉猴 (house bot): `Turn random · Step ahead`
- Wall-bouncer: `Peek ahead · If Reading < Here → Step ahead else Turn 90°`
- Hand-built gradient: `Peek ahead · Peek +90° · Peek behind · Peek −90° · Step toward lowest peek`
- Decaying descent: gradient program + `Stride ×0.95`
- Restarting descent: decaying descent + `If Steps since best > 20 → Jump somewhere random`

All five are expressible within the 8-card cap — that is the calibration bar
for the catalog: if a planned card isn't needed by one of these, it stays out.

### 3.3 Editor UX (`P4Bots.tsx` rewrite)

Keeps the current two-panel layout, program-rail chrome (`▶ ON DEPLOY`,
`REPEAT ×100`), category chip colors (`blocks.ts` §9.7 palette), and drag
physics. Changes:

- The crate offers the 8 card types; **tap to append, drag to insert/reorder**,
  tap a placed card's `×` to remove. Cap 8 loop cards; the deploy button reads
  `fill the loop` → `Deploy` accordingly.
- In-card **param dials**: tapping a param cycles presets (direction, factor,
  chip choice). No free-text numbers except the If-comparison number dial.
- Chips render as small colored pills inside cards (sense = teal family, state
  chips = slate) so the data flow is visible.
- The ∇ card renders locked exactly like today's gradient block until
  `slope_unlocked`.
- Right panel gains **stage tabs** (`Bowl · Foothills · Range`), a
  **Sandbox / Expedition** mode toggle (sandbox fixes the stage to Bowl), and
  keeps the bot-chip list (one chip per expedition, showing its board score).

---

## 4. Terrains

### 4.1 Stage 0 — the Bowl

The existing `LossLandscape` 201×201 grid, byte-for-byte. No new math. Ghost
dots from `store.p3.probes` on the minimap tie it to P3.

### 4.2 Data-derived scored stages (`mlp_a`, `mlp_b`)

New pure module `src/lib/workshop/terrain.ts` (client-safe, like
`lossgrid.ts`):

- **Model:** MLP `2 → H(tanh) → 1(sigmoid)`, BCE loss over the landscape's
  `trainZ` slice (same z-scored canonical features, same non-hidden population
  as the Bowl — the terrain is honestly "your data through a small net").
  `H = 2` for Foothills, `H = 3` for the Range.
- **Freeze procedure (seeded, deterministic):**
  1. Init weights from a seeded rng; train `T = 300` full-batch GD steps
     (lr 0.5) so the frozen weights sit in a realistic basin — this is what
     makes the surface structured rather than random noise.
  2. Choose one **free-weight pair** from a curated list (e.g. the two input
     weights of one hidden neuron; or one layer-1 weight × its neuron's output
     weight — cross-layer pairs interact and fold the surface).
  3. Sweep the pair over `[-4, 4]²` at 201×201 (others frozen), producing a
     grid in the exact shape `LossLandscape` exposes (`grid`, `gMin`, `gMax`,
     `lossAt`, `clampG` all reused).
  4. Run the hardness harness (§4.3). If it fails, advance the seed / pair and
     retry (cap ~64 candidates; keep the best-scoring candidate as fallback so
     activation can never wedge).
- **Per-point loss term** for batch=1 readings: the single point's BCE term
  under the same frozen model — consistent with how the Bowl's per-point
  logistic term relates to its grid.
- **Lifecycle:** built once per active dataset alongside the Bowl landscape and
  memoized in `server/store.ts` (same pattern/id-key as today). Grid build cost
  is ~201²×|train|×tiny-MLP forward per candidate — seconds, paid once at
  activation.

### 4.3 Hardness harness (`verifyTerrain`)

Mirrors the dataset `verify()` band pattern; every band renders in the admin
console (§8) with pass/tune verdicts. On the lightly-smoothed grid:

| Band | Foothills target | Range target | Why |
|---|---|---|---|
| local minima count | ≥ 2 | ≥ 3 | restarts must matter |
| global-basin fraction (cells whose steepest-descent flow reaches the global min) | 0.10–0.50 | 0.05–0.35 | findable but not trivial |
| saddle count (4-neighbor mixed-sign pattern) | ≥ 1 | ≥ 1 | the plateau/saddle beat |
| trap gap `(best local min − global min) / (gMax − gMin)` | ≥ 0.05 | ≥ 0.08 | escaping traps must move the board (3 decimals) |
| plateau fraction (|∇| < ε) | 0.05–0.5 | 0.05–0.5 | some flats, not a pancake |
| **reference-bot ladder** | monotone | monotone | 醉猴 > wall-bouncer > gradient > +decay > +restarts in mean final true loss over K = 16 seeded runs, with margins ≥ 0.01 between adjacent tiers |

The reference-bot ladder is the load-bearing band: it certifies that on this
terrain *better ideas score better*, which is the entire pedagogical contract.

---

## 5. Visualization (canvas isometric 3D)

New module `src/lib/workshop/draw/terrain3d.ts`; `draw/botmap.ts` is retired
from P4 (the projector may keep it until its scene is rebuilt).

- **Mesh:** downsample the 201×201 grid to 67×67 (every 3rd sample) for the
  surface; full resolution still backs readings and the minimap. Dimetric
  projection, painter's algorithm back-to-front; quads filled with the existing
  `lossColor` ramp (height & color both encode loss) plus a subtle ridgeline
  wireframe at reduced alpha. Height exaggeration tuned per stage from
  `gMin/gMax` so valleys read at lab-desk distance.
- **Camera:** fixed pitch; **drag-to-orbit yaw in 15° snaps** (pointer drag on
  the canvas; no inertia). Double-click resets. Re-projection redraws whole
  frames as elsewhere in the codebase — no scene graph.
- **Bot:** pulsing marker with a drop line to the surface; **trail ribbon**
  follows the surface height; peeks render as brief radar pings at their sample
  spots with the sampled value floating up; jumps draw a dashed arc.
- **Fog-of-war:** unrevealed stages render as a flat fogged plane. During a
  first expedition replay the bot walks the fog showing only readings; when the
  replay ends, the **terrain rises from flat** (height animates in, ~700 ms)
  and stays revealed for that student (§6.3). The Bowl starts revealed.
- **Minimap:** a corner top-down square — visually the P3 `WBSquare` (grid
  every 2 units, center axes) — showing trail, probe pings, current position,
  and on the Bowl the student's P3 ghost dots. This is the standing P3 bridge.
- **HUD:** `STEP n/100 · READ x.xxx (1 classmate) · STRIDE s` during replay;
  after a scored run adds `JUDGE x.xxx (whole class)` in accent. Stage tabs
  carry per-stage judged loss once run.
- **Replay:** per-stage, from the returned event log, reusing the current
  45 ms-tick pattern; the bot-chip list replays any past expedition.

Stretch (not in scope, noted for the projector gap in `lecturer-notes.md`):
the same renderer can draw all students' final positions on one terrain for a
real `p4_race` scene.

---

## 6. Server

### 6.1 Program schema & validation

`BotProgram` replaces `BotConfig` in `types.ts` (delete `BotConfig`; keep a
migration note in the PR, no data migration — old submissions' payloads are
historical JSON). Strict hand-rolled validation in the `scoreNet` style:
`loop.length ∈ [1, 8]`, every card a known discriminant with enum-checked
params, If-branches exactly one non-If card, all numbers from the preset lists.
Reject otherwise; never interpret unvalidated input. The ∇ card is rejected
server-side while `slope_unlocked` is off (existing behavior, new shape).

### 6.2 Interpreter (`server/botrun.ts`, replaces `bots.simulateBot`)

Pure function `runProgram(stage: StageTerrain, rng: Rng, prog: BotProgram):
StageRunResult`. Implements §2 semantics; emits a compact event log
(`move | peek | jump | stride | turn` with positions/values) that the client
replays verbatim — the client never re-simulates. Deterministic: same seed +
program + stage ⇒ identical run (unit-tested).

### 6.3 Endpoints (`fn/submissions.ts`, `fn/data.ts`)

- **`submitBotFn {token, prog}`** (cap `BOT_CAP = 5`, guarded by phase/deadline
  as today): validates, runs the program on **each scored stage** with
  per-stage seeds (`hashSeed(id) + used*STAGES + stageIdx`), computes per-stage
  true final loss, records one `P4` submission with
  `score = mean(trueFinalLoss)`, `payload = {prog, perStage: [{stage, finalPos,
  trueLoss}]}`. Returns event logs + judged numbers **+ the scored stages'
  grids** (first time; client caches) — revealing terrain after a scored run is
  safe because the language has no absolute-move card.
- **`botSandboxFn {token, prog}`** (new): validates and runs on the **Bowl
  only**; soft cap 30/student (in-memory counter is fine — losing it on restart
  is harmless); **no submission row**. Returns the event log + judged number
  for the Bowl.
- **`getTerrainFn {token, stage}`** (new, GET): ships a stage grid to a student
  who already has ≥1 P4 submission (reload recovery for the revealed-terrain
  state). Bowl ships to anyone (it's derivable from public data anyway).
- `adminSeedBotFn` reseeds 醉猴 as the two-card drunk-walk program through the
  same pipeline (flag `🐒` unchanged).

### 6.4 Scoring & board

LOSS board unchanged in shape: `P4` rows, lower is better, value = **mean true
final loss across scored stages**, best-per-student. The uni-tier `API` channel
and P3 rows are unaffected.

---

## 7. Client state & module inventory

**`WorkshopContext` `p4` slice** (breaking rewrite, serializable as before):

```ts
p4: {
  prog: { setup: Setup; loop: Card[] }   // the editor's working program
  mode: 'sandbox' | 'expedition'
  runs: ExpeditionRun[]                  // ≤5; {name, prog, perStage: {stage, events, trueLoss}[]}
  sandboxRun: StageRunView | null        // last sandbox run, ephemeral
  revealed: StageId[]                    // stages whose terrain has been shipped
  view: { run: number; stage: StageId; step: number }
  botName: string
  camYaw: number
}
```

`SlotKey` and the old `cfg` shape are deleted (grep: `blocks.ts`, `P4Bots.tsx`,
`WorkshopContext.tsx`, `admin-adapters.ts` stats bins if they name slots).

| Module | Fate |
|---|---|
| `lib/workshop/blocks.ts` | rewritten → card catalog + chip metadata (keeps §9.7 palette exports) |
| `lib/workshop/bots.ts` | deleted → `server/botrun.ts` (interpreter) |
| `lib/workshop/terrain.ts` | **new** — MLP terrain builder + `verifyTerrain` (pure, unit-testable) |
| `lib/workshop/draw/terrain3d.ts` | **new** — iso renderer + minimap |
| `lib/workshop/draw/botmap.ts` | retired from P4 |
| `components/workshop/phases/P4Bots.tsx` | rewritten (card editor + stage tabs + 3D view) |
| `lib/workshop/types.ts` | `BotConfig` → `BotProgram`, `BotResult` → per-stage results |
| `lib/workshop/data-service.ts` / `http-data-service.ts` | `submitBot(prog)`, `botSandbox(prog)`, `getTerrain(stage)` |
| `fn/submissions.ts`, `server/store.ts` | per §6 |
| `server/__tests__` | interpreter determinism, validation rejects, harness bands, reference-bot ladder |

---

## 8. Admin & ops

- **Generate section:** after dataset activation, render the two stages'
  `verifyTerrain` band tables (pass/tune verdicts, same visual language as the
  dataset bands) plus a small top-down preview of each terrain. A `terrain
  seed` field allows re-rolling if the operator dislikes a surface; the
  fallback-candidate rule (§4.2) guarantees activation always succeeds.
- **Reveals:** `slope_unlocked` unchanged (now gates the ∇ card). No new
  reveal flags — stage terrain reveal is per-student, driven by their first
  expedition.
- **House bot:** seed 醉猴 before opening the phase, as today (A3.4.1).
- **Lecturer script deltas** (`lecturer-notes.md` update, same PR): the
  batch=1 "one classmate per question" line at first sandbox confusion; the
  reframed ∇ pitch; the saddle/plateau "gradient isn't magic" beat; the
  SGD-naming wrap line.

## 9. Out of scope / stretch

- Projector `p4_race` scene on the iso renderer (existing gap, now cheaper).
- Momentum card (`keep 〈%〉 of last move`) — deliberately excluded from v1;
  candidate for a locked bonus card if the Range proves too punishing in
  rehearsal.
- Energy/reading budget economy (was option 2C) — cut with the batch-dial idea;
  the 8-card × 100-iteration bound is the only budget.
- Client-side simulation of any kind — everything stays server-authoritative.

## 10. Open questions (small, decide during build)

1. Foothills/Range display names & Chinese equivalents for slides.
2. Whether sandbox runs show on a local-only "practice" chip row (probably yes,
   capped at the last 3) — pure UI.
3. Exact height-exaggeration and downsample factor per stage — tune on real
   generated terrain during rehearsal.
