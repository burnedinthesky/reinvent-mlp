# Lecturer notes — feature pairing & current status

A companion to [`user-journey.md`](./user-journey.md). The journey is the
minute-by-minute camp-day runbook; this doc pairs each teaching beat with the
feature that now backs it, states whether that feature is **built and sufficient**,
and — where it isn't — says so plainly and gives the workaround.

> **Read this first.** `user-journey.md` is dated **2026-07-07** and several of its
> ⚠️ **GAP** markers are now **stale** — the blocking gaps have since been built and
> verified. Where the journey and this doc disagree, this doc is current. The
> remaining gaps are real and listed at the end.

Status legend: ✅ built & sufficient · 🔶 built, teach with a caveat · ⚠️ **lacking** — not built or not wired.

---

## What changed since the user journey was written

The journey's "distilled gap checklist" (its §Gap checklist) opens with four
**blocking** items. Their current state:

| Journey gap | Then | **Now** |
| --- | --- | --- |
| **`HttpAdminService`** not wired (A0.3, A2.*) | ⚠️ critical-path | ✅ **built** — the console is 100% live; Import / Generate (incl. terrain re-roll) / Live Ops / Stats / Projector all call real server fns. The old `LocalAdminService`/offline mode was removed. |
| **`/projector` route** not built (A0.9) | ⚠️ accepted, two-window workaround | ✅ **route built** — a live big-screen display polling scene + boards. But it is **board-only**; the dynamic demo scenes are still ⚠️ (see below). |
| **Phase force-push** — students free-navigate (A0.6, B0.4) | 🔶 operational control | ✅ **built** — Live Ops **"students self-select phase"** toggle. Off = every phone hard-locked to the room phase; on = roam freely. |
| **Out-of-phase submit + deadline** enforcement (A0.6/A0.7) | 🔶 verify | ✅ **enforced server-side** — `server/guard.ts` rejects a submission when `phase ≠ room phase` and when the armed deadline has passed. Uni-tier opts out; P6 stays open under `playground_open`. |
| **Uni-tier `API` channel** (A0.11, A3.4.5) | ⚠️ cut or build | ✅ **built** — `POST /api/query` (Bearer token, `{w,b}`, 100-query budget) feeds the LOSS board with a `⌨️` flag. |

Net effect: the **live data path and room control the journey worried about are done.**
What remains lacking is a set of *shared-screen demo visualizations* — real pedagogy
lives on student phones; the projector shows leaderboards.

---

## Feature pairing by phase

Each row: the teaching beat → the feature that backs it → status. Cross-references
are to the journey's step IDs.

### Setup → live dataset (A2)

| Beat | Feature | Status |
| --- | --- | --- |
| Import survey CSV → balance report (A2.4) | Setup section → `adminImportFn` → `cleanRealCsv` → `adaptBalance`; strict 9-col + label header contract (`csv-schema.ts`) | ✅ |
| Generate + verify + activate (A2.5) | Generate section → `adminGenerateFn` → `generateSynth` (`wedge` means) → §4.4 harness → `activateDataset` | ✅ bands render with pass/tune verdicts |
| CSV header contract from a real Google Form (A0.2) | `mapHeaders` accepts headers *containing* the ASCII codename | 🔶 **rehearse with real Form headers.** Chinese question text must contain/(be renamed to) the 9 codenames; the 5-night sleep grid still has to be collapsed to the runtime columns before export. |
| Seed-dataset safety net (A1.2) | `server/store.ts` seed fallback (`buildDataset`) | ✅ whole course is playable pre-import |

### P1 — Guess the 48

| Beat | Feature | Status |
| --- | --- | --- |
| Deck labeling, keyboard flow, sort selector, review mode (B1.1–B1.4) | `P1Guess` | ✅ |
| 3-attempt cap, percentage score (B1.5) | `submitGuess48Fn`, cap 3 | ✅ server-enforced |
| Reveal beat: labels on cards + room histogram (A3.1.3, B1.6) | `labels48` flag; Stats histogram | ✅ (histogram is a basic 10-bucket strip) |

### P2 — Regions

| Beat | Feature | Status |
| --- | --- | --- |
| Scatter, axis pick, rectangle brushing, live known-set accuracy (B2.1–B2.3) | `P2Circles` | ✅ — note regions are **axis-aligned rectangles**, not circles; adjust slide vocabulary |
| Visible-vs-hidden score gap → overfitting (A3.2.2, B2.5) | `submitCirclesFn` returns `acc_visible` + `acc_hidden` | ✅ |
| "Add more views to ensemble-vote" | `scoreCircles` scores **`views[0]` only** | 🔶 **only the first view is scored.** Do **not** teach multi-view voting; teach "choose your one view's axes well." If the UI exposes extra views, say aloud that only view 1 counts. |

### P3 — Fog

| Beat | Feature | Status |
| --- | --- | --- |
| 1-D strip (8 shots) + 2-D plane (20 probes) (B3.2–B3.3) | `fogQueryFn` (`1d`/`2d`), budgets 8/20 | ✅ server-enforced budgets |
| Reload recovery restores lit pixels (B3.4) | `rejoinFn` + `fogMineFn` | ✅ |
| **Unfog** — each student's screen dissolves to the true heatmap with *their* trail (A3.3.3, B3.5) | `unfog` flag, per-student render | ✅ this is the real reveal and it works |
| **Act-1 demo** — accuracy-freezes-but-loss-slides "staircase vs smooth" (A3.3.1) | — | ⚠️ **lacking** — no dedicated interactive scene. Run the journey's A3.3.1 script (drag a P5 line; slow-train P6; deliver the staircase argument verbally). |
| **Collective comet-trail replay** — all students' 2-D trails over the true landscape (A3.3.3) | `fogReplayFn` returns the data **but has no renderer**; projector `p3_reveal` shows a **loss board**, not trails; fog-replay **export is disabled** | ⚠️ **lacking** — the shared Act-3 replay is cut. Lean into the *per-student* unfog moment instead ("look at YOUR trail"). |

### P4 — Expedition (training-loop redesign)

The rebuilt phase (v3 language): students assemble a **training-loop card program** from four
primitive families — **Observe** (Look, Scan), **Variables** (Set A–D), **Logic** (If),
**Actions** (Move / Jump / Step ×) — over **absolute 8 directions** (no heading, no turning).
Every reading lands in a **named slot** (`Look here → A`); there is no hidden register. The
loop *is one epoch*; it runs `×100 EPOCHS` server-side under **batch=1 reading noise** over a
2-D loss terrain, and a **live loss-vs-epoch curve** draws as the replay advances. The bot can
only **sample** the slope, never feel it: `Scan → D` takes eight noisy probes and keeps the
lowest direction — the slope made honest, not a free ∇. Student-facing vocabulary is
**step size**, taught as "= learning rate (LR)". No house bot, no simultaneous race.

| Beat | Feature | Status |
| --- | --- | --- |
| Training-loop builder (compass-rose popovers, typed A–D vars, multi-card If branches, ×100 epochs), deploy, replay (B4.1–B4.3) | `phases/p4/*` (`P4Bots`, `ProgramRail`, `CardRow`/`IfCardRow`, `ParamPopover`, `VarLegend`, `VarWatchPanel`, `LossCurve`), `blocks.ts`, `server/botrun.ts`, `draw/terrain3d.ts` | ✅ |
| **"One classmate per reading"** — surface the batch=1 sampler at the first sandbox confusion | `runProgram` reads one random training point per `sample` (noisy by design); jagged loss curve makes it visible | ✅ say it aloud when a student asks why one spot gives different readings |
| **Discover descent** — probe-first (`Look here → A · Set D=random · Look D → B · If B<A {Move D}`), then the two-card scan descent (`Scan → D · Move D`) | `Scan` = 8 noisy samples, argmin direction — the derivative *sampled*, not handed over; it can point uphill | ✅ reframe: "an MLP does thousands of these probes per step — that's backprop, and its readings are noisy too" |
| **Step-size schedule & patience** | `Step ×0.95` is the LR schedule; `If epochs-since-best > 40 {Jump · Step ×2 · Step ×2}` is the restart (Jump resets the patience counter; a real restart re-explores BIG) | 🔶 decay reliably beats flat step; restarts help only where the surface has real traps (see terrain note) |
| **Scored submissions** over Foothill / Range + terrain reveal + JUDGE curve (A3.4.4) | `submitBotFn` scores the selected stage, `getTerrainFn` reveals the fogged surface; at epoch 100 the smooth **true-loss curve** overlays the jagged one; split per-stage team boards | ✅ this is the real Act-3 reveal |
| **Terrain re-roll** (operator) | Generate section → terrain panel → "Re-roll terrains" (`adminRerollTerrainFn` bumps `terrain_seed`) | ✅ deterministic, reload-stable; rebuild takes a few seconds |
| **SGD wrap** | the batch=1 loop *is* stochastic gradient descent — name it here as the bridge to P6 | ✅ scripted verbal beat |

> **Terrain hardness (honest status).** The two scored surfaces are frozen tiny MLPs
> (`2→H→1`) with two weights exposed as the (w, b) plane. The reference ladder is
> **DRUNK / PROBE / SCAN / SCAN_DECAY / FULL**; the load-bearing `ref-bot ladder` band
> (醉猴 worst, a scan bot best) passes on both fixture stages, and candidate selection now
> also enforces a **minimum ladder spread** (the flat-terrain gate — a dead ladder can no
> longer win the search; the admin panel shows it as the `ladder spread` band). On these
> frozen-MLP surfaces the trappy region is nearly flat in absolute loss, so structural bands
> (saddle/trap) pass on some re-rolls but not all, and the restart rung (FULL) scores *worse*
> than SCAN_DECAY on trap-free surfaces — expected, and worth narrating. Re-roll to resample
> if a surface reads poorly.

### P5 — Neuron

| Beat | Feature | Status |
| --- | --- | --- |
| Stage 1: hand-tune one sigmoid neuron (`w1/w2/b`); probability heatmap + dashed p=0.5 boundary; loss-only BCE readout | `P5Neuron` | ✅ |
| "Squash the score into a probability" — click the output node to expand the live σ(z) plot as classes split | `draw/sigmoid.ts` | ✅ the stage-1 payoff |
| Stage 2 (operator flips **`p5_deep`**): add hidden layers, train with GD, watch loss AND accuracy, click a neuron to see its surface | shared `NetEngine`, `drawNetDiagram` | ✅ strongest hand-off into P6 |

### P6 — Playground finale

| Beat | Feature | Status |
| --- | --- | --- |
| Train a real MLP live; decision surface morphs; loss sparkline (B6.2) | `P6Playground`, `NetEngine` | ✅ |
| **Money shot:** click a hidden neuron → its learned line over the data (A3.6.2, B6.3) | neuron-click inspect | ✅ |
| Submit net → `🤖` on the ACC board; optionally open to the room (A3.6.4, B6.4) | `submitNetFn` (cap 20), `playground_open` | ✅ |
| **Shared live MLP on the projector** | projector `playground` scene = **ACC board only** | ⚠️ **lacking** — run the finale on a spare student session and project that window; the projector scene shows the ladder, not the surface. |

### Wrap (A4)

| Beat | Feature | Status |
| --- | --- | --- |
| "The ACC board top-to-bottom *is* the course" (A4.1) | ACC/LOSS boards, projector `leaderboard` scene | ✅ the projector is genuinely good at this |
| Full JSON export for retro (A4.2) | `adminDumpFn`, Export section | ✅ (fog-replay export still disabled) |

---

## Still lacking — the current gap list

Ordered by teaching impact. None is blocking; each has a workaround above.

1. **Dynamic projector scenes.** The big-screen display is a themed **leaderboard**.
   The scene names promise more than they draw:
   - `p3_reveal` → loss board (not the comet-trail replay),
   - `playground` → ACC board (not a live MLP surface).
   *Workaround:* project a spare student session for any live visual; use the
   projector for boards and scene captions. *To build later:* render the animations
   the student views already produce (the P4 `terrain3d` walk, the P6 surface, fog
   trails) into the corresponding projector scene bodies.
2. **Collective fog comet-trail replay.** `fogReplayFn` returns every student's 2-D
   query sequence, but nothing renders it and its **export is disabled**. The
   per-student unfog reveal (✅) carries the beat.
3. **P3 Act-1 accuracy-vs-loss toggle.** No interactive "staircase vs smooth" scene;
   it's a scripted verbal beat (journey A3.3.1). A small live both-metrics widget on
   the P5 or P6 view would restore it.
4. **P2 multi-view scoring.** Only `views[0]` is scored. Either hide extra views in
   the UI or state "only view 1 counts" out loud — a messaging fix, not a build.
5. **Stats charts are basic.** Score histogram is a 10-bucket strip; there are no
   per-student solution replays on the operator side. Narrate from the boards.

### Verified-resolved (do **not** treat as gaps anymore)

`HttpAdminService` wiring · `/projector` route existence · phase force-push
(`selfSelect`) · out-of-phase + deadline server enforcement · uni-tier `POST /api/query`.
These were the journey's blocking items; they are done and verified.
