/* P4 "Training Loop" card catalog + param metadata (v3 language). Seven cards
   across four categories — OBSERVE (teal, Look/Scan), VARIABLES (purple, Set),
   LOGIC (green, If), ACTIONS (brown, Move/Jump/Step×) — over absolute 8
   directions and typed A–D variables. Every reading lands in a named slot; the
   student-facing vocabulary is "step size (= learning rate)".
   The editor renders solid Scratch-like keys from BLOCK_CHIP_CLASS / blockChipStyle
   with recessed slot pills for params (see SLOT_PILL_CLASS). */

import type {
    Card,
    CardType,
    Compare,
    Dir8,
    LrFactor,
    LrPreset,
    NumExpr,
    StartMode,
    VarSlot,
} from "./types";

export type CardCat = "observe" | "variables" | "logic" | "actions";

export interface CardDef {
    /** which card(s) this crate entry makes — most cats have one, ACTIONS has three. */
    t: CardType;
    cat: CardCat;
    /** display name. */
    n: string;
    /** glyph. */
    g: string;
    /** one-line description shown on the bench. */
    d: string;
}

/* The seven cards, grouped by category (crate order). */
export const CARDS: CardDef[] = [
    {
        t: "look",
        cat: "observe",
        n: "觀察",
        g: "👁",
        d: "觀察 〈這裡 | 方向〉 → 〈A–D〉：問一位同學，在這裡取得一個帶雜訊的讀數，或不移動、偷看一步外的位置。讀數會存進你選的變數格。",
    },
    {
        t: "scan",
        cat: "observe",
        n: "掃描",
        g: "🧭",
        d: "掃描 → 〈A–D〉：往 8 個方向各取一個帶雜訊的樣本，存下讀數最低的方向。每個方向只有一個樣本，所以可能被雜訊騙，甚至指向上坡。",
    },
    {
        t: "set",
        cat: "variables",
        n: "設定",
        g: "📥",
        d: "設定 〈A–D〉 = 〈值〉：把數字或方向存進一個變數格。",
    },
    {
        t: "if",
        cat: "logic",
        n: "如果",
        g: "⑂",
        d: "如果 〈A〉 〈</>〉 〈B〉，則 {…}，否則 {…}：比較兩個數字；兩邊各最多跑 3 張卡。不能巢狀。",
    },
    {
        t: "move",
        cat: "actions",
        n: "移動",
        g: "🚶",
        d: "移動 〈方向 | 隨機〉：往指定方向走一步，並讀取新位置。",
    },
    {
        t: "jump",
        cat: "actions",
        n: "跳躍",
        g: "🎲",
        d: "跳躍：傳送到平面上的隨機位置並讀取它。會重設「距離最佳已有幾輪」，重新開始也會重新累積耐心。",
    },
    {
        t: "lr",
        cat: "actions",
        n: "步長 ×",
        g: "📉",
        d: "步長 ×〈f〉：縮小或放大你的步長（也就是學習率）。這就是學習率排程。",
    },
];

export const CARD_BY_TYPE: Record<CardType, CardDef> = Object.fromEntries(
    CARDS.map((c) => [c.t, c])
) as Record<CardType, CardDef>;

/* Category chip palette — solid CAT-color background + a 1px-darker border, plus
   the raised-key shadow from blockChipStyle. `s` retained for legacy call sites. */
export const CAT_COLORS: Record<CardCat, { c: string; d: string; s: string }> =
    {
        observe: { c: "#2f6470", d: "#20454e", s: "rgba(47,100,112,.15)" },
        variables: { c: "#5a4d84", d: "#3e355c", s: "rgba(90,77,132,.15)" },
        logic: { c: "#3f6f52", d: "#2b4d38", s: "rgba(63,111,82,.15)" },
        actions: { c: "#7a6234", d: "#554424", s: "rgba(122,98,52,.15)" },
    };

export const CAT_NAME: Record<CardCat, string> = {
    observe: "觀察",
    variables: "變數",
    logic: "邏輯",
    actions: "動作",
};

/** Category crate order for the grouped micro-headers. */
export const CAT_ORDER: CardCat[] = [
    "observe",
    "variables",
    "logic",
    "actions",
];

/** Slate chip for the fixed program-rail pseudo-blocks (ON DEPLOY / LOOP / JUDGE). */
export const RAIL_CHIP = { c: "#3a5578", d: "#283b53" };

/* ------------------------------------------------------------ direction presets */

/** the 8 absolute directions, in compass order, with their arrow glyphs and the
    3×3 compass-rose grid position (row, col; center is `here` / disabled). */
export const DIR8: Dir8[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const DIR_ARROW: Record<Dir8, string> = {
    N: "↑",
    NE: "↗",
    E: "→",
    SE: "↘",
    S: "↓",
    SW: "↙",
    W: "←",
    NW: "↖",
};
/** [row, col] in the 3×3 rose (center [1,1] reserved for here/blank). */
export const DIR_CELL: Record<Dir8, [number, number]> = {
    NW: [0, 0],
    N: [0, 1],
    NE: [0, 2],
    W: [1, 0],
    E: [1, 2],
    SW: [2, 0],
    S: [2, 1],
    SE: [2, 2],
};

/* ------------------------------------------------------------ other presets */

export const VAR_SLOTS: VarSlot[] = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
];

/** build a Record keyed by every VarSlot from a per-slot fill function. Keeps
    slot-keyed literals from having to spell out all 16 keys by hand. */
export const slotRecord = <T>(
    fill: (s: VarSlot, i: number) => T
): Record<VarSlot, T> =>
    Object.fromEntries(VAR_SLOTS.map((s, i) => [s, fill(s, i)])) as Record<
        VarSlot,
        T
    >;

/** fixed per-slot hue for the variable chips / legend / watch panel — 16 evenly
    spaced hues so every slot stays visually distinct. */
export const VAR_COLORS: Record<VarSlot, string> = slotRecord(
    (_s, i) => `hsl(${Math.round((i * 360) / VAR_SLOTS.length)} 78% 62%)`
);

export const LR_PRESETS: LrPreset[] = [0.1, 0.25, 0.5, 1.0, 2.0];
export const LR_FACTORS: LrFactor[] = [0.5, 0.9, 0.95, 1, 1.1, 2];
export const START_MODES: StartMode[] = ["center", "random"];
export const COMPARES: Compare[] = ["<", ">"];

/* ------------------------------------------------------------ numeric chips */

export interface NumChipMeta {
    k: "best" | "sinceBest";
    label: string;
    /** one-line definition shown in the picker. */
    def: string;
}
/** the readable telemetry chips (what the trainer logs). The v2 hidden `loss`
    register is gone — readings land in slots via Look/Scan. */
export const NUM_CHIPS: NumChipMeta[] = [
    { k: "best", label: "最佳讀數", def: "目前站過的位置中最低的讀數" },
    {
        k: "sinceBest",
        label: "距離最佳已有幾輪",
        def: "多久沒有出現新的最佳讀數（跳躍會重設）",
    },
];

/** number-dial presets offered on Set values / If comparisons. */
export const NUM_PRESETS = [0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 40, 999];

/** human label for a numeric expression (telemetry / number / variable). */
export const numExprLabel = (e: NumExpr): string => {
    switch (e.k) {
        case "num":
            return String(e.v);
        case "var":
            return e.slot;
        default:
            return NUM_CHIPS.find((m) => m.k === e.k)?.label ?? e.k;
    }
};

/* ------------------------------------------------------------ card factory */

/** a fresh card of the given type with sensible default params. */
export function makeCard(t: CardType): Card {
    switch (t) {
        case "look":
            return { t: "look", at: "here", slot: "A" };
        case "scan":
            return { t: "scan", slot: "D" };
        case "set":
            return { t: "set", slot: "A", v: { k: "num", v: 0 } };
        case "move":
            return { t: "move", dir: { k: "randomDir" } };
        case "jump":
            return { t: "jump" };
        case "lr":
            return { t: "lr", f: 1 };
        case "if":
            // the canonical "did my reading beat best" comparison.
            return {
                t: "if",
                a: { k: "var", slot: "A" },
                cmp: "<",
                b: { k: "best" },
                then: [{ t: "move", dir: { k: "randomDir" } }],
                else: [],
            };
    }
}

/* ------------------------------------------------------------ chip chrome */

/** class recipe for a solid draggable/placed card key (white glyphs on the §6
    CAT hue; the raised "key" shadow + solid background come from blockChipStyle). */
export const BLOCK_CHIP_CLASS =
    "inline-flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 font-mono text-sm font-bold text-white select-none touch-none cursor-grab";

/** solid opaque key: CAT-color fill, 1px darker border, raised-key drop shadow. */
export function blockChipStyle(col: {
    c: string;
    d: string;
}): React.CSSProperties {
    return {
        background: col.c,
        borderColor: col.d,
        boxShadow: `0 2.5px 0 ${col.d}`,
    };
}

/** recessed slot pill for an in-key param (value + ▾ caret opens a popover). */
export const SLOT_PILL_CLASS =
    "inline-flex items-center gap-1 rounded bg-black/30 px-2 py-1 font-mono text-[12px] font-semibold text-white/95 hover:bg-black/45";
