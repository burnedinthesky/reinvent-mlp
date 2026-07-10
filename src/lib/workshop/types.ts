/* Shared types for the workshop. Field names follow spec.md §3.2/§3.3 so a
   real backend can drop in behind the WorkshopDataService interface. */

/** 'NONE' is the operator's blank/focus stage — a deliberately empty screen. */
export type Phase = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "NONE";

/** Feature column keys used in the survey dataset (§2 glossary, ASCII names). */
export type FeatureKey =
    | "SCREEN_AVG"
    | "CAFFEINE"
    | "LATE7"
    | "SNACK_DAYS"
    | "LATE_SHOWER"
    | "EARLY_WAKE"
    | "GAME_HRS"
    | "DND_START"
    | "BREAKFAST";

/** 0 = early bird, 1 = night owl. */
export type ClassLabel = 0 | 1;

export interface FeatureMeta {
    name: string;
    unit: string;
    min: number;
    max: number;
    /** count-in-7 / ordinal axis — gets deterministic jitter when plotted. */
    cnt7: boolean;
}

export type FeatureValues = Record<FeatureKey, number>;

/** A plotted point. `label` is omitted by the data service when the relevant
    reveal flag is off (mirrors the server never shipping hidden labels). */
export interface DataPoint {
    id: string;
    feats: FeatureValues;
    label?: ClassLabel;
    real: boolean;
    hidden: boolean;
    /** deterministic per-point jitter in [-0.5, 0.5] for ordinal axes. */
    jx: number;
    jy: number;
}

export interface RealRow {
    id: string;
    pseudo: string;
    feats: FeatureValues;
    label?: ClassLabel;
    real: true;
}

/** Reveal flags — server state that gates label visibility & UI unlocks (§3.2). */
export interface Reveals {
    reveal100: boolean;
    /** false = Phase 3 slope-only (default): the student tunes w with b locked at 0.
      true = the full w+b plane (drag the anchor in the (w, b) square). Operator-
      driven so the whole room advances to the second beat together. */
    p3_wb_plane: boolean;
    /** false = Phase 2 lasso mode (default), true = line mode (y = wx·x + b).
      Operator-driven hard switch — the whole room flips between the two. */
    p2_line_mode: boolean;
    /** false = Phase 3 data hidden (default): the scatter is invisible and points
      surface only during the post-submit red flash. true = show the scatter. */
    p3_show_dots: boolean;
    /** false = Phase 5 stage 1 only (default): a single hand-tuned sigmoid neuron.
      true = unlock stage 2 — add hidden layers and train with gradient descent.
      Operator-driven, like p2_line_mode. */
    p5_deep: boolean;
    /** false = Phase 4 Bowl sandbox only (default): the Foothills & Range terrains
      and the Expedition scored mode are hidden entirely. true = reveal them.
      Operator-driven, like p5_deep gates the P5 deep stage. */
    p4_terrains: boolean;
}

/** Serialized loss landscape (the 201×201 grid). Row-major over (w, b) ∈
    [-4,4]². Used by the P3 fog-of-war heatmap rendering (draw/fog.ts). */
export interface LossGrid {
    gn: number;
    grid: number[];
    min: number;
    max: number;
    bStar: number;
}

/** Lightweight P4 terrain-build status carried on GET /state so the student app
    can show a loading overlay while the two scored MLP surfaces are carved in the
    background (they cost ~19 s of CPU per dataset; see server/store.ts). `state`
    mirrors the build lifecycle; `progress` is 0..1 over both stages. */
export interface TerrainBuildInfo {
    state: "idle" | "building" | "ready" | "error";
    progress: number;
    /** human-readable current step for the overlay (e.g. 'Foothills · coarse search'). */
    phase: string;
    /** the dataset the build is for (deterministic grids stay reload-stable). */
    datasetId: string;
}

/** Shape of GET /state (§3.2). */
export interface ServerState {
    phase: Phase;
    deadline: string | null;
    reveals: Reveals;
    boards: ["ACC", "LOSS"];
    /** when true, students may freely navigate phases; when false they are
      hard-locked to `phase`. */
    selfSelect: boolean;
    /** P4 background terrain-build status. Optional because `getServerState` /
      `requireGate` return `ServerState` too and must not import the store (that
      would force a state.ts→store.ts cycle); only `getStateFn` composes it on. */
    terrain?: { state: TerrainBuildInfo["state"]; progress: number };
}

/** Canonical axes + feature metadata (GET /config, §3.3 / §4.6). */
export interface WorkshopConfig {
    label: string;
    canonical_x: FeatureKey;
    canonical_y: FeatureKey;
    features: Record<FeatureKey, FeatureMeta>;
    /** feature column order for tables/deck. */
    cols: FeatureKey[];
    /** features offered in axis pickers. */
    axisKeys: FeatureKey[];
    dndLabels: string[];
    /** loss-color scale bounds for fog/bot maps (not a hidden label). */
    lossRange: { min: number; max: number };
    /** the loss-minimizing b (round-1 fog locks b here). */
    bStar: number;
}

/* ---- submission payloads & results (§3.3) ---- */

export interface GuessResult {
    acc: number;
    attempt: number;
}

export interface CircleRegion {
    pts: { x: number; y: number }[]; // closed polygon, feature-space vertices
    cls: ClassLabel;
}

export interface CirclesView {
    x: FeatureKey;
    y: FeatureKey;
    circles: CircleRegion[];
}

export interface CirclesSubmission {
    views: CirclesView[];
    default_cls: ClassLabel;
}

export interface CirclesResult {
    /** judged accuracy over the FULL point set (real + synth, revealed + hidden). */
    acc_full: number;
    acc_visible: number;
    /** line-mode logistic loss over the same two sets; omitted in lasso mode
      (loss needs the continuous boundary, which lasso submissions don't carry). */
    loss_full?: number;
    loss_visible?: number;
    attempt: number;
}

/** Line-mode classifier: the slope-intercept boundary y = wx·x + b over axes
    normalized to [0,1] — points above the line are class 1, below are class 0.
    The two axes come from the active P2 view (view.x / view.y). */
export interface LineModel {
    /** slope of the boundary line (normalized axes). */
    wx: number;
    /** intercept of the boundary line (normalized axes). */
    b: number;
}

/** P2 submission is now the predicted label for every point id (lasso or line
    mode alike). The server compares these to its held ground truth; the shape/
    line params never travel. */
export interface LabelsSubmission {
    labels: Record<string, ClassLabel>;
    /** present only in line mode: the boundary + its axes, so the server can
      score logistic loss over the hidden test slice it holds. */
    line?: { model: LineModel; x: FeatureKey; y: FeatureKey };
}

export type FogRound = "1d" | "2d";

export interface FogQueryResult {
    loss: number;
    remaining: number;
}

/** P3 line submission: the z-scored slope/intercept the student is showing.
    In w-only mode the client sends b = 0 (b locked at the square's centre). */
export interface LineSubmission {
    w: number;
    b: number;
    /** true when submitted from the w+b plane (p3_wb_plane reveal on); slope-only
      mode omits it. Tags the submission so the leaderboard can split the two. */
    plane?: boolean;
}

export interface LineResult {
    /** judged accuracy over the FULL point set (real + synth, revealed + hidden). */
    acc_full: number;
    /** accuracy over the visible/training set (non-hidden). */
    acc_visible: number;
    /** logistic loss at (w, b) on the canonical loss landscape (feeds the LOSS board). */
    loss: number;
    attempt: number;
    /** ids of every misclassified point over the full set — flashed red by the client. */
    wrong: string[];
}

/* ---- P4 "Training Loop" card program (v3 language) ----
   A program is a linear card list run server-side under batch=1 noise across a
   fixed 100-epoch training loop; see server/botrun.ts. The block language is a
   4-category, 7-card primitive set (OBSERVE Look/Scan / VARIABLES Set / LOGIC If
   / ACTIONS Move/Jump/Step×) over absolute 8 directions and typed A–D variables —
   every reading lands in a named slot the student chose (no hidden state), and
   students hand-build strategies rather than assemble pre-made ones. */

/** A scored/sandbox stage. `bowl` = the P3 logistic landscape (sandbox);
    `mlp_a`/`mlp_b` = the data-derived MLP terrains (scored, Phase B). */
export type StageId = "bowl" | "mlp_a" | "mlp_b";

/** Absolute 8-way compass over the (w, b) map. E = 0° = +w, N = 90° = +b in the
    existing CCW frame — no heading state, no relative dials. */
export type Dir8 = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/** The 16 typed variable slots A–P (numbers or directions, inferred). */
export type VarSlot =
    | "A"
    | "B"
    | "C"
    | "D"
    | "E"
    | "F"
    | "G"
    | "H"
    | "I"
    | "J"
    | "K"
    | "L"
    | "M"
    | "N"
    | "O"
    | "P";

export type StartMode = "center" | "random";
/** step-size (= learning-rate) presets (grid units per Move step). */
export type LrPreset = 0.1 | 0.25 | 0.5 | 1.0 | 2.0;
/** Step× multipliers (scale the step size / learning rate). Wire tag stays 'lr' —
    the "Step ×" rename is display-only. */
export type LrFactor = 0.5 | 0.9 | 0.95 | 1 | 1.1 | 2;
export type Compare = "<" | ">";

/** A numeric expression readable in Set values and If comparisons. (The v2
    hidden `loss` register is gone in v3 — every reading lands in a
    student-chosen slot via Look/Scan.) */
export type NumExpr =
    | { k: "best" }
    | { k: "sinceBest" }
    | { k: "num"; v: number }
    | { k: "var"; slot: VarSlot };

/** A value a Set card may store: a number, a direction literal, a random
    direction, or a copy of another variable. */
export type SetValue = NumExpr | { k: "dir"; d: Dir8 } | { k: "randomDir" };

/** A direction argument for an action: a literal, a variable, or (Move only) a
    random direction. */
export type DirParam =
    { k: "dir"; d: Dir8 } | { k: "var"; slot: VarSlot } | { k: "randomDir" };

/** The cards an If branch may hold — no nested If.
    `look` stores its reading into a required number-typed slot; `scan` probes one
    step away in all 8 directions and stores the lowest-reading direction. */
export type SimpleCard =
    | {
          t: "look";
          at: "here" | { k: "dir"; d: Dir8 } | { k: "var"; slot: VarSlot };
          slot: VarSlot;
      }
    | { t: "scan"; slot: VarSlot }
    | { t: "set"; slot: VarSlot; v: SetValue }
    | { t: "move"; dir: DirParam }
    | { t: "jump" }
    | { t: "lr"; f: LrFactor };

export type Card =
    | SimpleCard
    | {
          t: "if";
          a: NumExpr;
          cmp: Compare;
          b: NumExpr;
          /** 1..3 cards run when the comparison holds. */
          then: SimpleCard[];
          /** 0..3 cards run otherwise. */
          else: SimpleCard[];
      };

/** discriminant tag of a card ('look' | 'set' | … | 'if'). */
export type CardType = Card["t"];

export interface Setup {
    start: StartMode;
    lr: LrPreset;
}

export interface BotProgram {
    setup: Setup;
    /** 1..20 loop cards (an If counts as 1; its branch cards don't count). */
    loop: Card[];
}

/** One replay frame — the bot's state at the end of loop pass / epoch `i`
    (frame 0 = spawn). The client replays these verbatim; it never re-simulates. */
export interface RunFrame {
    w: number;
    b: number;
    /** the bot's last noisy reading this epoch (HUD LOSS). */
    read: number;
    /** lowest at-position reading seen so far (noisy). */
    best: number;
    sinceBest: number;
    /** current step size (= learning rate). */
    lr: number;
    /** distant Look / Scan probes taken this epoch, for radar-ping rendering. */
    looks: { w: number; b: number; v: number }[];
    /** this epoch ended on a random Jump (dashed arc from the previous pos). */
    jumped: boolean;
    /** end-of-epoch variable snapshot for the watch panel (numbers, or a Dir8). */
    vars: Record<VarSlot, number | Dir8>;
    /** If-trace bitmask: bit i set ⇔ the i-th TOP-LEVEL If took its `then` branch
      this epoch. Optional/additive; ≤20 loop cards keeps it under 32 bits. */
    ifs?: number;
}

/** Result of running one program on one stage (server-authoritative). */
export interface StageRunResult {
    stage: StageId;
    /** 101 frames (spawn + 100 epochs). */
    frames: RunFrame[];
    finalPos: { w: number; b: number };
    /** the judge's TRUE full-batch loss at finalPos (not the best sample). */
    trueLoss: number;
    /** 101 TRUE full-batch loss values along the visited path (frame w/b through
      stage.lossAt) — the smooth curve revealed client-side at JUDGE (epoch 100). */
    truePath: number[];
}

/** One serialized stage grid (row-major over (w, b) ∈ [-4,4]²) — shipped by
    submitBotFn (revealed after a scored run) and getTerrainFn (reload recovery). */
export interface TerrainGrid {
    gn: number;
    grid: number[];
    min: number;
    max: number;
    bStar: number;
}

/** Result of one scored submission — the program run on a single chosen stage
    (Foothill = mlp_a or Range = mlp_b), its board value (that stage's true final
    loss), and the stage's grid so the client can render terrain it just earned. */
export interface StageSubmitResult {
    stage: StageId;
    result: StageRunResult;
    loss: number;
    grid?: {
        stage: StageId;
        gn: number;
        grid: number[];
        min: number;
        max: number;
    };
}

/** P5 "Neuron" submission — a network scored on the chosen axes. Stage 1 ships a
    single sigmoid neuron ({ layers: [2, 1] }, weights [w1, w2, b]); stage 2 ships
    a trained MLP's serialized weights. The two z-scored axes come from the dock
    pickers; the server rebuilds z-stats over those axes to score the hidden set. */
export interface P5NetSubmission {
    axes: [FeatureKey, FeatureKey];
    arch: NetArch;
    weights: number[];
}

export interface P5NetResult {
    /** judged accuracy over the FULL point set (real + synth, revealed + hidden). */
    acc_full: number;
    acc_visible: number;
    /** judged mean BCE loss over the same two sets (P3-style live-vs-judged readout). */
    loss_full: number;
    loss_visible: number;
    attempt: number;
}

export interface NetArch {
    layers: number[];
    act: string;
}

/* ---- identity (§3.3) ---- */

/** POST /join → a session: bearer token + the composed (team + name) identity.
    Re-entering the same (team, name) resumes and re-issues the token. */
export interface JoinResult {
    token: string;
    nickname: string;
}

/* ---- leaderboard (§3.3) ---- */

export type Board = "ACC" | "LOSS";

export interface LeaderboardRow {
    rank: number;
    name: string;
    /** ACC: accuracy %, LOSS: smooth loss. */
    value: number;
    /** phase tag / channel marker (e.g. 'P2', '⌨️', '🤖'). */
    tag?: string;
    /** rank movement vs. the previous snapshot: 1 up, -1 down, 0 steady. */
    move?: number;
}

export interface LeaderboardResult {
    board: Board;
    top: LeaderboardRow[];
    /** caller's own standing (null if the caller has no entry on this board). */
    me: { rank: number; value: number } | null;
}

/* ---- per-phase team leaderboard (/leaderboard page) ---- */

/** One team's row on a per-phase team board. `value` is the team average over the
    players who SUBMITTED this phase (each contributing their best attempt);
    non-submitters do not affect it. `value` is null when nobody on the team has
    submitted. `submitted`/`members` expose the participation the average is over. */
export interface TeamBoardRow {
    rank: number;
    team: number;
    teamLabel: string;
    value: number | null;
    submitted: number;
    members: number;
}

/** A single phase's team ranking + its metric direction/format. */
export interface PhaseTeamBoard {
    phase: Phase;
    /** board title — the phase label normally; for the split P4 surfaces this is
      the per-stage label ('Foothill · Medium' / 'Range · Hard'). */
    label?: string;
    /** 'acc' = accuracy %, higher-is-better; 'loss' = smooth loss, lower-is-better. */
    metric: "acc" | "loss";
    rows: TeamBoardRow[];
    /** server-armed deadline (ISO) for this phase — null when no countdown is live. */
    deadline: string | null;
}

/* ---- per-phase per-student scores (admin console Scores section) ---- */

/** One roster member's best score for a chosen phase. `score` is null when the
    member has no submission for this phase (a no-score row). `score2` is the
    secondary metric (acc_visible for ACC phases, final_loss for LOSS) from the
    best attempt. `team`/`teamLabel` are the squad; `team` is null for a joiner
    with no recognizable 小隊 prefix (e.g. a seeded bot). */
export interface PhaseScoreRow {
    studentId: string;
    nickname: string;
    team: number | null;
    teamLabel: string;
    score: number | null;
    score2: number | null;
    attempts: number;
    /** operator-granted extra attempts on top of the base cap (0 = none). */
    bonus: number;
}

/** A student's effective per-phase attempt caps (base cap + granted bonus),
    keyed by room phase. Only phases with a server-enforced cap appear (P1–P5);
    the student's phase UIs gate their submit button on `cap - attempt`. */
export type PhaseCaps = Partial<Record<Phase, number>>;

/** Full-roster per-student score table for one phase, plus its metric direction
    ('acc' = %, higher-is-better; 'loss' = raw, lower-is-better). Rows are
    unsorted — the console sorts/filters client-side. */
export interface PhaseScores {
    phase: string;
    metric: "acc" | "loss";
    rows: PhaseScoreRow[];
}

/* ---- admin (§3.3 / §4) ---- */

/** Per-feature quick-stat line in the import balance report (§4.1 step 6). */
export interface FeatureStat {
    key: FeatureKey;
    meanClass0: number;
    meanClass1: number;
    /** crude point-biserial correlation with the label. */
    r: number;
}

/** Balance report returned by POST /admin/import (§4.1 step 6). */
export interface BalanceReport {
    n: number;
    ownlCount: number;
    earlyCount: number;
    /** true when the majority-class fraction is inside the healthy ~42–58% band. */
    balanced: boolean;
    warning: string | null;
    features: FeatureStat[];
    /** hygiene: raw rows skipped by the parser (blank / malformed). */
    droppedRows?: number;
    /** hygiene: cells median-filled or clamped (blank / ∞ / out-of-range). */
    fixedCells?: number;
}

/** One row of the §4.4 verification harness. */
export interface VerifyCheck {
    name: string;
    value: number;
    lo: number;
    hi: number;
    pass: boolean;
    hint: string;
}

/** z-scored canonical coordinates of one reveal-slice point, for the admin
    console's wedge preview canvas. */
export interface GenPreviewPoint {
    x: number;
    y: number;
    cls: ClassLabel;
}

/** Result of POST /admin/generate — the synth build + §4.4 verification bands. */
export interface GenerateReport {
    strategy: string;
    seed: number;
    synthCount: number;
    revealCount: number;
    hiddenCount: number;
    checks: VerifyCheck[];
    passedAll: boolean;
    preview?: GenPreviewPoint[];
}

/** One scored terrain's hardness report for the admin console's terrain panel
    (§4): the harness bands, the reference-bot ladder means (weakest 醉猴 →
    strongest +jump), and a downsampled `pn×pn` top-down loss grid for a light
    preview canvas. */
export interface TerrainStageReport {
    stage: StageId;
    /** hidden-layer width (2 = Foothills, 3 = Range). */
    H: number;
    /** display name (Foothills / Range). */
    name: string;
    checks: VerifyCheck[];
    /** 5 mean true-loss means in ladder order (DRUNK, PROBE, SCAN, SCAN_DECAY, FULL). */
    ladder: number[];
    /** row-major pn×pn downsampled loss grid. */
    preview: number[];
    pn: number;
    gMin: number;
    gMax: number;
}

/** Response of adminTerrainReportFn: the background-build status plus the
    per-stage reports. `stages` is empty until the build is ready (the terrains
    are built lazily off the event loop now), so the console shows a progress row
    while `status.state === 'building'` and polls until the reports land. */
export interface TerrainReportResponse {
    status: TerrainBuildInfo;
    stages: TerrainStageReport[];
}

/** One histogram bucket for admin data-viz. */
export interface HistBucket {
    lo: number;
    hi: number;
    count: number;
}

/** Aggregate stats for the admin panel (GET /admin/stats). */
export interface AdminStats {
    studentCount: number;
    perPhase: {
        phase: string;
        submissions: number;
        participants: number;
        scoreHist: HistBucket[];
        best: number | null;
    }[];
    acc: LeaderboardRow[];
    loss: LeaderboardRow[];
}
