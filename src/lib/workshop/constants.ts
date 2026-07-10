/* Single source of truth for the small enumerations/limits that were previously
   copy-pasted across the client seam, the server modules, and the adapter layer.
   Client-safe by construction: this module imports only types (never prisma or
   any server module), so both the browser bundle (admin-service, admin-adapters)
   and the server fns (state, leaderboard, submissions, fog, uni-query)
   can import from it without pulling the database in. */

import type { FogRound, Phase, Reveals } from "./types";

/* ------------------------------------------------------------- teams */

/** The camp is split into ten fixed squads. Identity is now (team, name) — the
    leaderboard "nickname" is composed from the two by composeIdentity(). */
export const TEAM_COUNT = 10;

/** Chinese numerals for the squad labels; index i is team (i + 1). Shared with
    the roster CSV parser so team parsing can never drift from the labels. */
export const CH_NUMERALS = "一二三四五六七八九十";

/** '第一小隊' … '第十小隊' — index i is team (i + 1). */
export const TEAM_LABELS: string[] = Array.from(
    { length: TEAM_COUNT },
    (_, i) => `第${CH_NUMERALS[i]}小隊`
);

/** true when `team` is one of the ten valid squad numbers (1..TEAM_COUNT). */
export function isValidTeam(team: number): boolean {
    return Number.isInteger(team) && team >= 1 && team <= TEAM_COUNT;
}

/** '第三小隊' for team 3; falls back to a synthetic label for out-of-range ids. */
export function teamLabel(team: number): string {
    return TEAM_LABELS[team - 1] ?? `第${team}小隊`;
}

/** The canonical identity string stored as Student.nickname and shown on every
    board: e.g. composeIdentity(3, '小明') → '第三小隊 小明'. The whitelist check
    and the client display both go through this so they can never drift. */
export function composeIdentity(team: number, name: string): string {
    return `${teamLabel(team)} ${name.trim()}`;
}

/** Recover the squad number from a composed nickname ('第三小隊 小明' → 3), or
    null if the prefix matches no known squad. Names can contain spaces, so this
    matches on the known team-label prefix rather than splitting on whitespace. */
export function teamOfNickname(nickname: string): number | null {
    for (let t = 1; t <= TEAM_COUNT; t++) {
        if (nickname.startsWith(teamLabel(t) + " ")) return t;
    }
    return null;
}

/* -------------------------------------------------------------- phases */

/** Every room phase, in operator order. 'NONE' is the blank/focus stage.
    Note: this is NOT the same as the per-submission phase list in
    fn/admin.ts's stats histogram, which carries the uni-tier 'API' channel
    (and never 'NONE', which has no submissions). */
export const PHASES: Phase[] = ["P1", "P2", "P3", "P4", "P5", "P6", "NONE"];

/** The operator "theater" reveal flags, in flip order (§3.2). */
export const REVEAL_KEYS: (keyof Reveals)[] = [
    "reveal100",
    "p3_wb_plane",
    "p2_line_mode",
    "p3_show_dots",
    "p4_terrains",
    "p5_deep",
];

/** one-line captions for the reveal flags (§3.2). `phase` is the phase the flag
    belongs to — surfaced as a chip in the operator's Live Ops so flips can be
    grouped, and used to pick which flags a student sees in self-select mode
    (the per-phase toggles in their Header). Lives here (client-safe constants)
    so both the admin console and the student Header import it without pulling
    the admin service. */
export const REVEAL_META: {
    key: keyof Reveals;
    name: string;
    caption: string;
    phase: Phase;
}[] = [
    {
        key: "reveal100",
        name: "reveal100",
        phase: "P2",
        caption: "顯示 100 筆合成訓練資料的標籤（Phase 2 起適用）。",
    },
    {
        key: "p2_line_mode",
        name: "p2_line_mode",
        phase: "P2",
        caption: "將 Phase 2 切成直線模式（wx·x + b）；關閉時為套索模式。",
    },
    {
        key: "p3_wb_plane",
        name: "p3_wb_plane",
        phase: "P3",
        caption: "解鎖截距 b，進入 Phase 3 的 w+b 平面；關閉時只能調斜率 w。",
    },
    {
        key: "p3_show_dots",
        name: "p3_show_dots",
        phase: "P3",
        caption:
            "顯示 Phase 3 散佈圖；關閉時資料點只會在送出後的閃爍提示中出現。",
    },
    {
        key: "p4_terrains",
        name: "p4_terrains",
        phase: "P4",
        caption: "揭開 Phase 4 遠征地形：丘陵與山脈；關閉時只有碗形練習場。",
    },
    {
        key: "p5_deep",
        name: "p5_deep",
        phase: "P5",
        caption:
            "解鎖 Phase 5 第二階段：加入隱藏層並訓練；關閉時只有單一神經元。",
    },
];

/* ------------------------------------------------- leaderboard boards */

/** Which phases feed the ACC (accuracy, higher-is-better) board vs. the LOSS
    (lower-is-better) board. 'API' is the uni-tier channel. */
export const ACC_PHASES = ["P1", "P2", "P5"];
export const LOSS_PHASES = ["P3", "P4", "API"];

/* ----------------------------------------------- P4 scored stages */

/** The two scored Expedition stages (p4-redesign-spec §4.2), in run/display
    order. The Bowl is the sandbox stage and is not scored. Each P4 submission
    targets ONE stage; its board value is that stage's true final loss. */
export const SCORED_STAGES = ["mlp_a", "mlp_b"] as const;

/** Submission mode flags for the split P2/P3 leaderboards. Unlike P4 (which always
    splits by stage), P2/P3 only grow a second board once the operator reveals the
    advanced mode. A submission made in the ADVANCED mode carries the flag below;
    base-mode submissions — and all pre-flag historical rows — carry no flag and
    land on the first board. Kept here so the submit handlers and the board splitter
    can't drift. */
export const P2_LINE_FLAG = "p2_line"; // P2 line mode (wx·x + b); lasso is base
export const P3_PLANE_FLAG = "p3_wb"; // P3 (w, b) plane; slope-only is base

/** Presentation metadata for the three P4 surfaces, shared by the sidebar
    selector, the run chips, and the split leaderboards so labels/tiers live in
    one place. `bowl` is the free Practice surface; the two MLP stages are the
    scored submission surfaces (Foothill = medium, Range = hard). */
export const STAGE_META = {
    bowl: { label: "碗形練習場", tier: "easy", kind: "practice" },
    mlp_a: { label: "丘陵地形", tier: "medium", kind: "submission" },
    mlp_b: { label: "山脈地形", tier: "hard", kind: "submission" },
} as const;

/* ----------------------------------------------------- attempt caps */

/* Server-enforced per-phase attempt limits. Defined once here; the enforcing
   fns import the named caps and the admin panel derives its display table
   (PHASE_CAPS) from the same values, so a cap change can't silently disagree. */
export const GUESS_CAP = 3; // P1
export const CIRCLE_CAP = 10; // P2
export const LINE_CAP = 20; // P3 (line-fit submissions; matches the old fog-2d budget)
export const P5_CAP = 10; // P5 (single-neuron + deep, shared pool)
export const BOT_CAP = 30; // P4 scored submissions — shared across Foothill + Range
/** P4 Bowl sandbox test runs (soft cap, in-memory; §6.3/§6.4). */
export const SANDBOX_CAP = 30;

/** Phase-3 fog probe budgets: 8 (1d warm-up) / 20 (2d). */
export const FOG_BUDGET: Record<FogRound, number> = { "1d": 8, "2d": 20 };

/** Uni-tier (curl/Python) query budget per student. */
export const API_BUDGET = 100;

/** Per-phase cap for the admin Stats display, derived from the caps above. */
export const PHASE_CAPS: Record<string, number> = {
    P1: GUESS_CAP,
    P2: CIRCLE_CAP,
    P3: LINE_CAP,
    P4: BOT_CAP,
    P5: P5_CAP,
    API: API_BUDGET,
};
