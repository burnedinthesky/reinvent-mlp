# P4 "Expedition" — Usage Guide

A practical guide to the rebuilt Phase 4. Covers the operator runbook, the student
card language, the admin terrain tools, scoring, and the known limitations. The
*design rationale* lives in [`p4-redesign-spec.md`](./p4-redesign-spec.md); the
*teaching beats* live in [`lecturer-notes.md`](./lecturer-notes.md); this doc is the
"how to use it" reference.

---

## 1. What P4 is

Students assemble a small **training-loop card program** from four families of primitives —
**OBSERVE** (`Look`, `Scan`), **VARIABLES** (`Set A–D`), **LOGIC** (`If`), **ACTIONS**
(`Move` / `Jump` / `Step ×`) — over **absolute 8 directions** and **typed A–D variables**, and
deploy it. The loop *is one epoch*; it runs **server-side** for **×100 epochs** over a 2-D
loss surface under **batch = 1 reading noise**, drawing a **live loss-vs-epoch curve**, and is
scored by the true full-batch loss where it ends. The bot can never *feel* the slope — it can
only **sample** it: `Look` takes one noisy probe, `Scan` takes eight (one per direction) and
keeps the lowest-reading direction. Every reading lands in a **named slot the student chose**
(no hidden state), so probe-first descent, greedy scan descent, step-size (learning-rate)
schedules, and restart heuristics are **composed by the student**, not picked off a shelf.

Three surfaces in one editor (the sidebar Surface selector):

| Surface | Stage | Scored? | Cap |
|---|---|---|---|
| **Practice** | The Bowl (P3 logistic landscape) | no (never on the board) | 30 test runs/student (soft, in-memory) |
| **Foothill** | `mlp_a` (H=2 frozen MLP) | yes — per-stage team board | shares `BOT_CAP` = 30 submissions with Range |
| **Range** | `mlp_b` (H=3 frozen MLP) | yes — per-stage team board | shares `BOT_CAP` = 30 submissions with Foothill |

---

## 2. Operator runbook

1. **Activate a dataset** (admin console → Setup → Import, then Generate → *Generate & verify*).
   The two scored MLP terrains build automatically from the active dataset — see §3.
   - First load after activation pays a **one-time ~15–20 s** terrain build (both stages), then
     it's memoized until the dataset or terrain seed changes.
2. **Review terrain hardness** in the admin Generate section's *Expedition Terrain* panel (§3).
   Re-roll if a stage looks weak.
3. **Open Phase 4**: Live Ops → set the room phase to **P4**. (Turn off "students self-select"
   to hard-lock everyone to P4.)
4. Students land on the editor, on the **Practice** Bowl. They start with the one-card
   醉猴 (`Move 🎲 random`); deploy, and meet the reading noise + the jagged loss curve.
5. **Discover descent**: guide the room from 醉猴 → probe-first (`Look here → A · Set D=random ·
   Look D → B · If B<A {Move D}`) → the two-card scan descent (`Scan → D · Move D`). `Scan` is
   the slope made honest: eight noisy samples, not a free ∇ — it can and will point uphill
   sometimes. Then layer `Step ×0.95` (a learning-rate schedule) and a patience restart.
6. Students switch the Surface to **Foothill** or **Range** and spend their shared submission
   attempts. The first submission reveals that stage's terrain (rise-from-flat) and posts to its
   per-stage team board; at epoch 100 the smooth true-loss curve overlays the jagged batch=1 one
   at JUDGE.
7. **Wrap** on the LOSS board (top programs are narrated from their card lists).

There is **no house-bot seeding step** — the old 醉猴 `adminSeedBotFn`/`🐒` flow was cut;
students build 醉猴 themselves in the 0–3 min demo.

---

## 3. Admin terrain panel (`/admin` → Generate → "Expedition Terrain · §4")

Open the console at `/admin` (dev token `sitcon-admin`, or append `?admin_token=sitcon-admin`).
Under **Generate**, below the dataset bands, the **Expedition Terrain** panel shows, per stage:

- **Hardness bands** (pass/tune verdicts), the harness that certifies the surface is honestly
  non-convex:

  | Band | What it measures | Foothills (H=2) | Range (H=3) |
  |---|---|---|---|
  | local minima | cells lower than all 8 neighbours | ≥ 2 | ≥ 3 |
  | global-basin frac | fraction whose steepest descent reaches the global min | 0.10–0.50 | 0.05–0.35 |
  | saddle count | 4-neighbour mixed-sign points | ≥ 1 | ≥ 1 |
  | trap gap | `(best local min − global min)/(gMax−gMin)` | ≥ 0.05 | ≥ 0.08 |
  | plateau frac | fraction with `|∇| < ε` | 0.05–0.5 | 0.05–0.5 |
  | **ladder spread** | `(max − min ladder mean)/(gMax−gMin)` ≥ 0.08 | pass = discriminating | pass = discriminating |
  | **ref-bot ladder** | 醉猴 scores worst, a scan bot best | pass = ordered | pass = ordered |

  The **ref-bot ladder** is the load-bearing band — it certifies "better ideas score better."
  It is deliberately *permissive*: it passes when the drunk walker (醉猴) is the worst mean and
  a scan-descent bot (scan/+decay/+jump) is the best; it does **not** require strict
  adjacent-margin monotonicity. The **ladder spread** band is its guard: candidate selection
  only counts a surface as "ordered" when the ladder actually discriminates (spread ≥ 8% of the
  loss range), so a near-flat, pedagogically dead surface can no longer win the search.
- The **5 ladder means** (醉猴 → probe → scan → +decay → +jump), over K=16 seeded
  runs — read left-to-right; a wide spread means strategy is strongly rewarded.
- A **top-down preview** heatmap (lime = low-loss valley, dark = high-loss ridge).
- A shared **"Re-roll terrains"** button — bumps the `terrain_seed` and rebuilds both surfaces
  (a few seconds). Use it to hunt a bumpier surface if the bands read "tune".

---

## 4. The card language (student reference)

A program is a **setup** plus a **training loop of 1–20 cards**:

```jsonc
{
  "setup": { "start": "center|random", "lr": 0.1|0.25|0.5|1.0|2.0 }, // lr = step size (= learning rate)
  "loop":  [ Card, ... ]   // 1..20 cards; the loop IS one epoch, runs ×100 EPOCHS
}
```

**Directions are absolute compass points** — `N NE E S SE S SW W NW` (↑↗→↘↓↙←↖) on the (w, b)
map, picked from a one-click **compass rose**. There is no heading, no Turn card, and no
absolute "go to (x,y)" card — programs express *strategies*, never coordinates.

### Card catalog (7 cards, 4 categories)

| Cat | Card | Params | What it does |
|---|---|---|---|
| **OBSERVE** (teal) | **Look** `〈here \| dir \| dirVar〉 → 〈A–D〉` | compass rose + slot | Batch=1 reading at the current spot (`here`) or **one step away** without moving; the reading is **stored in the chosen slot** (number). A `here` read also folds into `best`; a distant Look never does. |
| | **Scan** `→ 〈A–D〉` | slot | **Eight** batch=1 probes, one step away in every direction; the **lowest-reading direction** is stored in the slot. Doesn't move, never touches `best` — eight noisy samples, so it *can* point uphill. |
| **VARIABLES** (purple) | **Set** `〈A–D〉 = 〈value〉` | slot + value | Store a number (telemetry / preset / another var) **or** a direction (literal / random dir / another var) in a slot. |
| **LOGIC** (green) | **If** `〈A〉 〈< / >〉 〈B〉 {then} {else}` | chips + cmp | Numeric compare; **then** runs 1–3 cards, **else** 0–3 cards. **No nesting.** |
| **ACTIONS** (brown) | **Move** `〈dir \| dirVar \| random〉` | compass rose | Walk one step (= the step size); auto-reads the new spot (folds into `best`). |
| | **Jump** | — | Teleport uniformly in `[-4,4]²`; auto-reads. **Resets `epochs since best`** — a restart earns fresh patience. |
| | **Step ×** `〈f〉` | ×0.5/0.9/0.95/1.1/2 | Scale the step size (= learning rate), clamped to `[0.01, 2.0]` — a learning-rate schedule. |

### Variables (typed A–D)

Four fixed slots **A–D**, each a fixed hue. A slot holds a **number or a direction**, inferred
from its writes — `Set` values, `Look → slot` (number) and `Scan → slot` (direction) all count
(the validator rejects a slot written both ways, a direction var read as a number, reading a
never-written slot, or `random direction` on Look). Rename them locally (client-only). A read
before the first write defaults to `0` (number) / `N` (direction). **There is no hidden `loss`
register** — every reading lives in a slot the student named.

### Telemetry chips (what the trainer logs)

- **best** — the lowest *at-position* reading so far (Move/Jump/`Look here`; distant Looks and
  Scans don't fold in — preserving the patience semantics).
- **epochs since best** — epochs since `best` last improved; **Jump resets it**.
- A **number** preset (`0 … 999`) for Set values / If comparisons.

So the two-card scan descent reads: `Scan → D · Move D`; probe-first descent reads:
`Look here → A · Set D=random · Look D → B · If B<A {Move D}`.

### Editor

Left panel: the variable legend (click to rename), then the **program rail**, which reads
top-to-bottom like a Python program: two full-width **setup blocks** (`🎯 START AT` and
`👟 STEP SIZE … (= learning rate)`, each with a one-line explainer), the `🔁 REPEAT ×100`
**C-bracket** (header + thick spine + closing `↺ back to top — next epoch` elbow) wrapping the
loop cards, and the short `🏁 SCORE` finish strip. The `cards n/20` meter lives on the crate
header. **Tap** a crate card to append (its description also lands in the framed info strip —
tap-add on touch still sees it); **drag the ⠿ handle** to reorder; **tap a slot pill** to open
its popover (compass rose / chip list / number pad / slot picker); **×** to remove. If cards
show indented then/else lanes with labeled `+ Look`-style adders (disabled at 3); during replay
the taken then/else lane tints. Right panel: the 3-D terrain, the Surface selector, HUD
(`STEP (LR)`, `READING · 1 classmate`), the **variable watch panel**, the **live loss-vs-epoch
curve**, and the run chip row.

---

## 5. How a run executes

- **Reading (batch = 1):** every reading samples **one random training point** and returns that
  point's loss term at the current (w, b). The same spot gives different numbers run-to-run —
  answer the inevitable "why?" out loud: *one classmate per question*. The jagged loss curve
  makes the noise visible.
- **Loop = epoch:** the loop runs `×100 EPOCHS`. Each epoch runs the cards top-to-bottom. Every
  **Move/Jump** and `Look here` auto-takes a fresh reading and folds into `best`;
  `epochs since best` increments once per epoch when `best` didn't improve.
- **Judging:** after 100 epochs the run ends **where it stands**. The score is the **true
  full-batch loss at the final position** — *not* the best sample. This forces convergence
  (which is what makes decay the winning move) and mirrors "you ship the weights you end with."
  The HUD contrasts the last noisy `LOSS … (1 classmate)` with the `JUDGE … (whole class)`, and
  at epoch 100 the smooth **true-loss curve** (`truePath`) overlays the jagged batch=1 one.
- **Determinism:** same student + attempt ⇒ identical run. Scored seeds are
  `hashSeed(id) + used*stages + stageIdx`; sandbox seeds live in a disjoint band
  (`hashSeed(id) + 1000 + n`) so they never collide.
- **Bounds:** ≤ 20 loop cards; the worst case is 20 Scans ⇒ 160 batch-1 samples/epoch ⇒
  ≤ ~16,000 one-point forward passes per 100-epoch stage run — still cheap.

---

## 6. The stages & terrain

- **Bowl** (`bowl`): the P3 logistic-loss landscape, unchanged — the sandbox/bridge stage.
  Public from the start; the student's own P3 probe dots render as ghost dots on the minimap.
- **Foothills** (`mlp_a`, H=2) and **Range** (`mlp_b`, H=3): **data-derived**. A tiny
  `2 → H(tanh) → 1(sigmoid)` net is frozen over the same training slice (seeded init + 300-step
  full-batch GD), then **two of its weights are exposed as the (w, b) plane** and swept over
  `[-4,4]²` at 201×201. The batch=1 reading is that single point's BCE term under the frozen net.
  Built once per active dataset, memoized in the server store, re-rolled from the admin panel.

---

## 7. The 3-D view

- **Terrain:** a hand-rendered isometric heightfield — height *and* colour both encode loss
  (low = hot-lime valley, high = grey ridge).
- **Camera:** drag the canvas to orbit yaw in 15° snaps; double-click resets.
- **Bot:** pulsing marker with a drop line to the ground; a trail ribbon on the surface;
  distant Looks ping as small rings; jumps draw a dashed arc.
- **HUD:** `EPOCH n/100 · LOSS x.xxx (1 classmate) · LR s`; a scored run adds
  `JUDGE x.xxx (whole class)` at the end. Stage tabs show each stage's judged loss. Below the
  HUD, a **variable watch panel** shows each used slot's live value (numbers to 3 dp, directions
  as arrows), flashing on change, plus `best` / `epochs since best`.
- **Minimap:** a corner top-down (w, b) square (P3 `WBSquare` style) with the trail, current
  position, and — on the Bowl — the P3 ghost probes.
- **Reveal / fog:** unrevealed scored stages render as a fogged flat plane; the first expedition
  fades the terrain in (rise-from-flat). Revealed terrain **survives a reload** — the app returns
  to the join screen on reload, so **re-join with the same team + name** and P4 re-fetches the
  revealed grids (past run *trajectories* are not restored, only the terrain).

---

## 8. Reference programs (the strategy ladder)

Used internally by the hardness harness (and as teaching examples), in increasing sophistication
(all `setup = {start: center, lr: 0.5}`):

1. **DRUNK 醉猴** (1/20): `Move 🎲 random` — the house bot; wanders.
2. **PROBE** (4/20): `Look here → A · Set D=random dir · Look D → B · If B<A {Move D}`.
3. **SCAN** (2/20): `Scan → D · Move D` — greedy 8-direction descent.
4. **SCAN_DECAY** (3/20): SCAN `+ Step ×0.95` — add a learning-rate schedule.
5. **FULL** (4/20): SCAN_DECAY `+ If epochs-since-best > 40 {Jump · Step ×2 · Step ×2}` — a
   *real* restart: jump somewhere new AND reset the step so the bot can re-descend.

The 20-card cap is now roomy — a kitchen-sink program (scan + schedule + adaptive step +
restart + custom logic) fits in ~10 cards. Note: on the honest single-basin surfaces the
restart rung scores **worse** than SCAN_DECAY (nothing to escape; a late jump costs the judged
final position) — that is the intended lesson, not a bug. Restarts pay off only on trappy
terrain (see `ladderOrdered`'s note in `terrain.ts`).

---

## 9. Scoring & the board

- Each **submission** runs the program on the **selected stage** (Foothill `mlp_a` or Range
  `mlp_b`). Board value = **true final loss on that stage**, lower is better, best-per-student,
  on **split per-stage team boards**.
- `BOT_CAP = 30` submissions/student, **shared across both stages**, server-enforced.
- Practice (Bowl) runs never touch the board.

---

## 10. Known limitations & caveats

- **Terrain hardness is a best-effort search, not a guarantee.** The frozen-MLP construction
  favours a single dominant basin. The generator (output-layer competing-neuron pairs, freeze
  variation, structure-aware selection) *can* find surfaces with real saddles/traps, but not on
  every dataset/seed. When it can't, it keeps the best candidate (activation never wedges) and
  the bands honestly read "tune". Use **Re-roll** to hunt a better one.
- **Structural bands alone don't certify quality — the ladder-spread gate does.** A near-flat
  candidate can pass most structural bands while every bot scores the same. Candidate selection
  now requires a **minimum ladder spread** (`MIN_SPREAD_FRAC` = 8% of the loss range) before a
  surface counts as "ordered", and the admin panel surfaces it as the **ladder spread** band —
  so a flat surface no longer wins the search. Still eyeball the means after a re-roll.
- **First-load build cost:** the two terrains build (~15–20 s total) on the first store access
  after a dataset activates or a re-roll — one-time, then memoized. Every phase's first request
  pays it, not just P4.
- **Reload = re-join.** Like every phase, a browser reload returns to the join screen; re-join
  the same identity to resume. Revealed terrain recovers; in-session run trajectories do not.
- **Projector `p4_race`** is still a LOSS board, not a live bot race (a pre-existing gap).

---

## 11. Developer & verification notes

- **Run it:** `pnpm dev` (offline) or `VITE_USE_SERVER=1 pnpm dev` (server mode, the real path;
  P4 is server-authoritative). Watch the log for the actual port.
- **Key modules:** `server/botrun.ts` (interpreter + two-pass validator), `blocks.ts` (card
  catalog + presets), `terrain.ts` (`bowlStage`, `buildScoredStage`, `verifyTerrain`),
  `server/store.ts` (terrain build + memoization), `fn/submissions.ts` (`submitBotFn` scored,
  `botSandboxFn`), `fn/data.ts` (`getTerrainFn`), `fn/admin.ts` (`adminTerrainReportFn`,
  `adminRerollTerrainFn`), `draw/terrain3d.ts` (renderer), `refbots.ts` (reference programs),
  and the editor under `components/workshop/phases/p4/` (`P4Bots` shell, `ProgramRail`,
  `CardRow`/`IfCardRow`, `ParamPopover`, `VarLegend`, `VarWatchPanel`, `LossCurve`, `varinfer`).
- **Tests:** `pnpm vitest run` (interpreter determinism/validation, expedition scoring, terrain
  bands + ladder + re-roll determinism). `pnpm exec tsc --noEmit` + `pnpm exec eslint .` clean.
- **Driving P4 locally (server mode):** set `AppState` phase/reveals via
  `sqlite3 prisma/dev.db "INSERT OR REPLACE INTO AppState(key,value) VALUES('phase','P4'),('reveal100','1'),('selfSelect','1')"`.
  **Note:** the DB integration test resets `AppState` — re-set P4 state *after* any `vitest` run.
  Admin drive: `/admin?admin_token=sitcon-admin`.
