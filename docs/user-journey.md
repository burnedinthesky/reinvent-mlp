# User Journeys — Student & Teacher (mapped to the as-built spec, 2026-07-07)

Two end-to-end walkthroughs of camp day. Every step names the feature it touches
(component / server fn) and carries a status marker:

- ✅ built and sufficient
- ⚠️ **GAP** — not built or not wired; workaround given inline
- 🔶 built but needs a decision / verification before camp day

Gaps referenced repeatedly: `/projector` route (not built), `HttpAdminService`
(console not wired to backend), phase force-push (students can free-navigate),
uni-tier `API` channel (not built).

---

# Journey A — Teacher / Operator

## A0. Pre-camp (days before)

| # | Action | Feature touched | Status |
|---|---|---|---|
| A0.1 | Author the Google Form: the 5-night sleep grid + LATE7 (label questions) and **exactly the 9 runtime features** (`SCREEN_AVG, CAFFEINE, LATE7, SNACK_DAYS, LATE_SHOWER, EARLY_WAKE, GAME_HRS, DND_START, BREAKFAST`). Anonymity settings: no email collection, no sign-in, no name/age/grade questions. | Google Form (external) | ✅ external |
| A0.2 | **Define the CSV header contract.** Form headers are Chinese question text; `cleanRealCsv` needs the ASCII column names. Decide now: either add a header-rename row in the Sheet before export, or verify/extend `cleanRealCsv`'s header mapping. Also confirm which columns `deriveOwl`'s sleep-composite reads, and whether the 5-night grid must be pre-collapsed to one column in the Sheet. | `dataset-io.cleanRealCsv`, `deriveOwl` | 🔶 must be pinned down and rehearsed |
| A0.3 | Dry-run the full data path twice on fake responses (incl. blanks, `∞`, absurd values, diagonal grid answers): export → Import → balance report → Generate → verification bands → activate. Stopwatch it — must fit ~10 min. | Admin **Import** + **Generate** sections | ⚠️ **GAP**: console runs on `LocalAdminService`; parts of import/generate are mocked. **Wiring `HttpAdminService` to `fn/admin.ts` is the critical-path pre-camp task.** Fallback if not done in time: a dev script that calls `cleanRealCsv`/`generateSynth`/`verify`/`activateDataset` directly from a Node REPL — decide which path is real before camp. |
| A0.4 | Build & deploy: `pnpm build` with `VITE_USE_SERVER=1`, run `node .output/server/index.mjs` on the podium machine; set a real `ADMIN_TOKEN` (not `sitcon-admin`). | Nitro build | ✅ |
| A0.5 | LAN check on an actual lab machine: reach `http://<server-ip>:<port>/`, Firefox rendering, no internet-dependent assets at runtime. | deployment | ✅ (verify) |
| A0.6 | Verify **out-of-phase submission behavior**: with server phase = P1, can a student who free-navigates to P5 submit? Attempt caps are per-phase, but confirm whether submissions are rejected when `phase ≠ AppState.phase`. If not rejected, the mitigation is operational (verbal control + reveals as the real gates) — know which world you're in. | `fn/submissions.ts`, `server/state.ts` | 🔶 verify; likely relies on operational control |
| A0.7 | Verify the **deadline is enforced server-side** (does `adminDeadlineFn`'s deadline reject late submissions, or is the 720 s client `Timer` cosmetic?). If cosmetic: plan to close each phase by *changing phase / flipping reveals*, which does gate server-side. | `adminDeadlineFn`, `Timer` | 🔶 verify |
| A0.8 | Preload the survey URL + the app URL as bookmarks/home tabs on every lab machine. | ops | ✅ external |
| A0.9 | Decide the projector story. `/projector` is **not built**. Plan: projector shows (a) the **admin Stats section** for leaderboards/histograms, and (b) a **spare student session** logged in as `講師` for any student-view demo. Rehearse switching between the two (two browser windows, Alt-Tab). | Admin **Stats**, student UI | ⚠️ **GAP** accepted; workaround is the two-window setup |
| A0.10 | Script the P3 Act-1 demo with existing surfaces (see A3.2) and rehearse it — the dedicated demo scene does not exist. | — | ⚠️ **GAP** accepted; script below |
| A0.11 | Decide: uni-tier API channel is **not implemented**. Either cut it from the lesson plan (recommended) or build `POST /api/query` before camp. Do not announce it and improvise. | reserved `API` phase | ⚠️ **GAP** — cut or build |
| A0.12 | Rehearse the P6 finale on the seed dataset: find one hyperparameter setting that converges < 1 min and one that entertainingly diverges. Write both on a sticky note. | `P6Playground` | ✅ |

## A1. Day-of setup (T−30 min)

| # | Action | Feature | Status |
|---|---|---|---|
| A1.1 | Start the server; open `/admin`; pass `TokenGate`. | `AdminConsole`, `TokenGate` | ✅ |
| A1.2 | Confirm `StatusStrip`: phase P1, all reveals off, no deadline, **active dataset = seed** (app is playable pre-import — this is the safety net if the live pipeline fails: you can run the whole course on the seed dataset). | `StatusStrip`, seed fallback | ✅ |
| A1.3 | Open the projector windows per A0.9. | — | ✅ (workaround) |
| A1.4 | Smoke-test join from one lab machine: nickname → token + code4 → P1 renders. | `joinFn`, `JoinScreen` | ✅ |

## A2. Survey → live dataset (0:00–0:12)

| # | Action | Feature | Status |
|---|---|---|---|
| A2.1 | Announce the survey; explicitly: 「手機拿出來」 (screen time / DND settings are on their phones) and 「完全匿名,亂寫只會害到等下的你自己」. | Form | ✅ |
| A2.2 | Watch response count reach ~48; close the form. | Form | ✅ |
| A2.3 | Export responses → CSV (apply the A0.2 header contract). | Sheet | 🔶 per A0.2 |
| A2.4 | Admin **Import**: paste CSV / upload / Sheet URL; label choice = `LABEL_OWL`; read the **balance report** (owl/early counts; `balanced` = minority in 20–28; per-feature point-biserial r). If unbalanced: the sleep composite is a median split so this should not happen, but the escape hatch is the seed dataset (A1.2). | `adminImportFn`, `cleanRealCsv` | ⚠️ depends on A0.3 wiring |
| A2.5 | Admin **Generate**: strategy `wedge`, defaults (`sep=1, noise=1.3, mix=0.55, flip=0.05, reveal=100, hidden=400`); read the **verification bands** (one-line 0.83–0.87, kNN ≤ oneLine+0.08, balance 0.46–0.54, max solo AUC ≤ 0.85, ≥6 signal features); nudge `sep` if a band fails; check the wedge preview canvas looks like a wedge; **activate**. | `adminGenerateFn`, `verify`, `activateDataset` | ⚠️ depends on A0.3 wiring |
| A2.6 | Sanity-check from the spare student session: P1 shows 48 pseudonymous rows with real-looking values. | `getBundleFn`, `gate.ts` | ✅ |

## A3. Running the phases

### P1 — Guess the 48 (0:12–0:27)

| # | Action | Feature | Status |
|---|---|---|---|
| A3.1.1 | LiveOps: phase → P1; arm countdown. Announce: 3 attempts, score is a percentage only. | `adminPhaseFn`, `adminDeadlineFn` | ✅ (deadline per A0.7) |
| A3.1.2 | While students label: watch **Stats** (submission counts per phase, score histogram) on the projector. | `adminStatsFn`, Stats section | ✅ (some charts basic) |
| A3.1.3 | Close the phase (timer or verbal). **Reveal beat:** flip `labels48`. Students' P1 view now has answers; on the projector, talk through the histogram: best human ~X%, chance = 50%. | `adminRevealFn(labels48)` | ✅ |
| A3.1.4 | Lecture beat: "what were you doing when you sorted by 宵夜? You were drawing a boundary." Segue to P2. | — | ✅ (talk) |

### P2 — Regions on the synthetic cloud (0:27–0:52)

| # | Action | Feature | Status |
|---|---|---|---|
| A3.2.1 | Flip `reveal100` (visible-synthetic labels ship); phase → P2; countdown. Announce: free-form lasso regions (not literal circles), 10 attempts, two scores (visible vs hidden). | `adminRevealFn(reveal100)`, `adminPhaseFn` | ✅ — **multi-view majority vote is now built**: students add multiple views (each its own X/Y axes + lassos) from the left drawer, and **every** view is scored by majority vote (ties → the uncovered default class). Teach ensemble voting for real: "add a view on different axes and let them vote." The drawer's preview toggle recolors points by the combined decision. |
| A3.2.2 | Mid-phase, on projector Stats: point at visible-vs-hidden score gaps opening up (overfitting foreshadowed, unnamed). | Stats | ✅ |
| A3.2.3 | Close; reveal beat on the ACC board (top lasso regions ~high-80s hidden). No per-student solution replay exists — narrate from the board, or ask the leader to show their screen on the projector via the spare-window swap. | leaderboard | 🔶 workaround |

### Break (0:52–1:02)

### P3 — Fog (1:02–1:32)

| # | Action | Feature | Status |
|---|---|---|---|
| A3.3.1 | **Act 1 demo (~8 min) — improvised, scripted at A0.10.** The dedicated slider-line + staircase-vs-smooth scene is not built. Working script with existing surfaces: (1) on the spare student session open **P5**, drag ONE line around the labeled cloud — "a line is just knobs"; (2) open **P6**, set 0 hidden layers, train slowly — "watch the loss number fall smoothly as the line settles"; (3) verbally deliver the staircase argument ("if I scored by accuracy, the number would freeze, freeze, freeze, jump — useless for knowing if I'm getting warmer") — the interactive accuracy/loss toggle does not exist, so this beat is words + a slide, not a demo. | P5 view, P6 view | ⚠️ **GAP** — script covers it; build the toggle later if time permits |
| A3.3.2 | Phase → P3. Round 1: students probe the 1-D strip (8 shots, `b` pinned at `bStar`). Then round 2: 20 clicks on the (w,b) plane. | `fogQueryFn`, budgets 8/20 | ✅ |
| A3.3.3 | Close. **Act 3 reveal:** flip `unfog` — each student's own screen dissolves to the true heatmap with their probes on it (a decentralized reveal — lean into it: "look at YOUR trail; raise your hand if you walked straight into the valley"). | `adminRevealFn(unfog)` | ✅ for per-student; ⚠️ **GAP**: the all-students comet-trail replay (`fogReplayFn` exists server-side) has no renderer and export is disabled — the collective replay beat is cut unless built |
| A3.3.4 | Best 2d probes are already on the LOSS board (each 2d query records a P3 submission); show board on projector. | leaderboard | ✅ |

### P4 — Bot race (1:32–1:57)

| # | Action | Feature | Status |
|---|---|---|---|
| A3.4.1 | **Before opening:** seed the house bot 醉猴 (flag 🐒). | `adminSeedBotFn` | ✅ (needs HttpAdminService wiring per A0.3, or seed via server call) |
| A3.4.2 | Phase → P4. Brief demo on the spare session: drag four blocks, deploy, watch the 100-step walk. Announce: 5 bots max, beat the monkey. `gradient` and its lock icon are visible but disabled. | `P4Bots`, `blocks.ts` | ✅ |
| A3.4.3 | Mid-phase: flip `slope_unlocked` — the ∇ block unlocks on every screen at once (server also enforces). Deliver the calculus pitch. | `adminRevealFn(slope_unlocked)` | ✅ |
| A3.4.4 | Close; race commentary from the LOSS board. Per-student replays exist on their own screens; the all-bots simultaneous race render does not — narrate top-3 configs from the board (`payload` has the block choices; Stats/dump can surface them). | leaderboard, `adminDumpFn` | 🔶 workaround |
| A3.4.5 | (Uni tier — per A0.11, cut or pre-built.) | `API` channel | ⚠️ **GAP** |

### Break (1:57–2:07)

### P5 — Neuron (2:07–2:32)

| # | Action | Feature | Status |
|---|---|---|---|
| A3.5.1 | Phase → P5; countdown. Announce: one neuron, three sliders (`w1/w2/b`), 10 attempts, same ACC ladder — beat your P2 score. Pick the two axes from the dock. | `adminPhaseFn` | ✅ |
| A3.5.2 | **σ payoff:** click the output node to expand the σ(z) plot; drag the sliders and watch the two classes split to opposite ends of the S-curve as the loss falls. "The neuron squashes a score into a probability." | `P5Neuron`, `draw/sigmoid.ts` | ✅ |
| A3.5.3 | **Going-deep beat:** flip **`p5_deep`**; the `① Neuron / ② Deep` switcher appears. On the spare session add a hidden layer and press ▶ — "one neuron was a line; stack them and train, and the network draws the boundary itself." Hand-off into P6. | `p5_deep` reveal, `NetEngine` | ✅ |

### P6 — Playground finale (2:32–2:47)

| # | Action | Feature | Status |
|---|---|---|---|
| A3.6.1 | On the projector (spare session): P6. Load = automatic (trains on visible points). Set 1 hidden layer × 2 neurons, tanh, the rehearsed LR; train. | `P6Playground`, `NetEngine` | ✅ |
| A3.6.2 | **Money shot:** pause; click hidden neuron 1, then neuron 2 — each renders its activation surface / layer-1 **line** over the data. "It drew your two lines. Nobody told it to." | neuron-click inspect | ✅ |
| A3.6.3 | Crowd mode: take shouted hyperparameters, comply, including the divergent LR from the sticky note (A0.12). | LR/layer controls | ✅ |
| A3.6.4 | Submit the trained net → 🤖 lands on the ACC board, ideally at #1. Optionally flip `playground_open` and give students 5 min to beat it from their seats. | `submitNetFn` (cap 20), `playground_open` | ✅ |

## A4. Wrap & post-camp

| # | Action | Feature | Status |
|---|---|---|---|
| A4.1 | Recap on projector: the ACC board read top-to-bottom **is the course** — human guesses → lasso regions → (line ~85) → two lines → 🤖. LOSS board = the story of finding it blind. | leaderboard | ✅ |
| A4.2 | Export the full JSON dump for retro / post-analysis. | `adminDumpFn`, Export section | ✅ (fog-replay export disabled) |
| A4.3 | Shut down; the SQLite file + dump are the archive. Survey Sheet can be deleted (nothing in the app links back to it). | — | ✅ |

---

# Journey B — Student

## B0. Arrival & survey (0:00–0:12)

| # | Action | Feature | Status |
|---|---|---|---|
| B0.1 | Sit down; the lab machine has two tabs preloaded: survey + app. | ops | ✅ |
| B0.2 | Take out phone (teacher's instruction); fill the anonymous survey: read screen-time weekly average off the phone, check DND settings, recall past-7-days counts, fill the 5-night bedtime grid. Submit. Nothing identifies them. | Google Form | ✅ external |
| B0.3 | Open the app tab → `JoinScreen` → choose a nickname (≤24 chars, must be unique — a taken name errors) → receive the **4-digit recovery code** → write it down (localStorage may not survive a machine swap). | `joinFn`, `JoinScreen` | ✅ |
| B0.4 | Land in `AppShell`: header with phase stepper, timer, avatar. Waits on P1. (Note: the stepper is clickable — a curious student can wander into other phases early; labels/locks are still server-gated, but expect wandering.) | `AppShell`, `Header` | 🔶 free navigation is a known behavior |

## B1. P1 — Guess the 48 (0:12–0:27)

| # | Action | Feature | Status |
|---|---|---|---|
| B1.1 | Card deck appears: one pseudonymous classmate per card ("Sleepy Capybara"), per-feature bars with a class-median tick. | `P1Guess` deck mode | ✅ |
| B1.2 | Label with `A`/`B` keys (owl/early), navigate `←`/`→`; progress rail fills toward 48/48. | keyboard flow | ✅ |
| B1.3 | Use the **sort selector** to reorder the deck by a feature (e.g. SNACK_DAYS) and label in runs — discovers thresholding without the word for it. | sort selector | ✅ |
| B1.4 | Switch to **review mode**, scan all 48 assignments, fix stragglers. | review mode | ✅ |
| B1.5 | Submit (attempt 1/3) → gets a single percentage. Adjusts strategy, submits again (≤3). Server refuses a 4th. | `submitGuess48Fn` | ✅ |
| B1.6 | Reveal: labels appear on the cards; checks which classmates they got wrong; sees own guess vs the room on the projector histogram. (May privately spot their own row.) | `labels48` reveal | ✅ |

## B2. P2 — Regions (0:27–0:52)

| # | Action | Feature | Status |
|---|---|---|---|
| B2.1 | Scatter canvas: 148 colored points (48 real + 100 revealed synthetic) + grey hidden points. Picks X/Y axes from the dropdowns (all features except DND_START); ordinal axes render jittered. | `P2Circles`, `plotGeom`, `pointPx` | ✅ |
| B2.2 | Selects the A or B brush; click-drags **free-form lasso** regions (polygons) over clusters; moves with drag / resizes with wheel; deletes mistakes. | region editing | ✅ |
| B2.3 | Sets `default_cls` for uncovered points. Watches the **live known-points accuracy** update per edit. | local mirror | ✅ |
| B2.4 | Tries different axis pairs to find the most separating view; can **add multiple views** from the left drawer (each its own axes + lassos) and combine them by **majority vote**. All views count toward the score; the drawer shows the aggregate accuracy and a preview toggle that recolors points by the ensemble decision. | multi-view drawer, `predictCirclesMulti` | ✅ |
| B2.5 | Submits (≤10): gets `acc_visible` AND `acc_hidden`; notices hidden is lower than visible; grinds the gap; watches the ACC board move. | `submitCirclesFn` | ✅ |

## B3. P3 — Fog (1:02–1:32)

| # | Action | Feature | Status |
|---|---|---|---|
| B3.1 | Watches the teacher's Act-1 demo (line = knobs; loss = smooth "warmer/colder"). | — | ✅ (talk/demo) |
| B3.2 | Round 1: a single `w` knob over a fogged strip; spends 8 shots; each lights a column with a loss value; hunts the dip (some kids bisect — that's the point). | `fogQueryFn ('1d')` | ✅ |
| B3.3 | Round 2: clicks the fogged (w,b) plane; 20 probes; each lights one pixel + updates best-so-far. Budget pips count down; server refuses probe 21. | `fogQueryFn ('2d')` | ✅ |
| B3.4 | If the page reloads / machine hiccups: rejoin with nickname + code4; lit pixels restore. | `rejoinFn`, `fogMineFn` | ✅ |
| B3.5 | **Unfog moment:** their screen dissolves to the true landscape with their own probe trail on it; sees how close (or lost) they were; best probe already sits on the LOSS board. | `unfog` reveal | ✅ |

## B4. P4 — Bot builder (1:32–1:57)

| # | Action | Feature | Status |
|---|---|---|---|
| B4.1 | Drag-and-drop blocks into four slots: start / probe / move / step. Reads each block's one-liner. The ∇ gradient block is visibly **locked**. | `P4Bots`, `blocks.ts` | ✅ |
| B4.2 | Names the bot; deploys; watches the 100-step walk animate on the fog map; reads final/best loss on the HUD. | `submitBotFn`, `botmap` | ✅ |
| B4.3 | Iterates (≤5 bots), chasing 醉猴 and classmates on the LOSS board; replays old bots from the chip list. | bot chips, replay | ✅ |
| B4.4 | Mid-phase the ∇ block **unlocks on screen**; rebuilds with gradient descent; watches it glide instead of stumble; notices `big` steps orbit the valley while `decay` settles. | `slope_unlocked` | ✅ |

## B5. P5 — Neuron (2:07–2:32)

| # | Action | Feature | Status |
|---|---|---|---|
| B5.1 | Scatter over dock-chosen axes; a single sigmoid neuron drives a probability heatmap with a dashed p=0.5 boundary. Drag `w1/w2/b` (range [-4,4]); the BCE loss readout falls live. | `P5Neuron`, `draw/p5main.ts` | ✅ |
| B5.2 | Clicks the output node in the preview island → an inline σ(z) plot expands; every known point is a dot at (z, σ(z)) that slides toward 0 or 1 as the sliders move. | `draw/sigmoid.ts` | ✅ |
| B5.3 | Submits (≤10, shared pool); the server scores the neuron on the hidden set over the chosen axes; the score lands on the ACC board. | `submitP5NetFn` | ✅ |
| B5.4 | When the operator flips **`p5_deep`**: a `② Deep` stage appears — add 1–2 hidden layers × 1–6 neurons, press ▶ to train (tanh, LR select), watch loss AND accuracy, click a neuron to see its surface. Same submit. | `p5_deep` reveal, `NetEngine` | ✅ |

## B6. P6 — Playground (2:32–2:47)

| # | Action | Feature | Status |
|---|---|---|---|
| B6.1 | Watches the finale demo; shouts a hyperparameter suggestion; sees loss explode or converge. | — | ✅ |
| B6.2 | If `playground_open`: opens P6 on own machine; sets layers/neurons/activation/LR; `Space` to train; watches decision surface morph + loss sparkline fall. | `P6Playground` | ✅ |
| B6.3 | Clicks a hidden neuron → sees *its* line over the data; clicks through all of them. | neuron inspect | ✅ |
| B6.4 | Submits the net (≤20) → a 🤖 entry with their nickname on the ACC board; maybe dethrones the teacher's. | `submitNetFn` | ✅ |
| B6.5 | Final board: scrolls the day's ladder — their P1 guess % at the bottom, their 🤖 at the top. | leaderboard | ✅ |

---

# Gap checklist distilled (build/verify order before camp)

1. **`HttpAdminService`** — wires Import / Generate / LiveOps / seed-bot / Stats to the
   real backend. Without it the live data path (A2) doesn't exist outside dev tools.
   *Blocking.*
2. **Header contract for `cleanRealCsv`** (A0.2) — mapping from Form headers + sleep-grid
   collapse to the 9 runtime columns + label. *Blocking for live data; seed dataset is
   the fallback.*
3. **Out-of-phase submission check + deadline enforcement** (A0.6/A0.7) — verify, then
   decide whether to add a server-side `phase` guard. *Small; do it.*
4. **Leaderboard surface on the projector** — Stats section suffices; confirm the ACC/LOSS
   boards there render top-10 + tags. *Verify only.*
5. **P3 Act-1 accuracy-vs-loss toggle** — currently a verbal beat; a small addition to the
   P5 or P6 view (show both metrics live) would restore the demo. *Nice-to-have.*
6. **Fog comet-trail replay renderer** (`fogReplayFn` already returns the data) — restores
   the collective Act-3 beat. *Nice-to-have.*
7. **All-bots race render** — per-student replays exist; the shared race is theater, not
   pedagogy. *Nice-to-have.*
8. **Uni-tier `API` channel** — cut from the lesson plan or build `POST /api/query`.
   *Decide.*
9. **P2 multi-view scoring** — ✅ **DONE.** Multiple views (each its own axes + lassos)
   combine by majority vote and all views are scored (`predictCirclesMulti` /
   `scoreCircles`). The left aggregation drawer switches views, shows the aggregate
   accuracy, and previews the ensemble. Teach ensemble voting for real.
