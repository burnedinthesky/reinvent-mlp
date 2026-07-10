/* Feature metadata (the FM map + column order) ported from the prototype. */

import type { FeatureKey, FeatureMeta } from "./types";

export const FEATURES: Record<FeatureKey, FeatureMeta> = {
    SCREEN_AVG: {
        name: "螢幕時間",
        unit: "分鐘/天",
        min: 0,
        max: 960,
        cnt7: false,
    },
    CAFFEINE: { name: "咖啡因", unit: "杯/週", min: 0, max: 24, cnt7: false },
    LATE7: { name: "晚睡天數", unit: "/7", min: 0, max: 7, cnt7: true },
    SNACK_DAYS: { name: "吃宵夜", unit: "/7", min: 0, max: 7, cnt7: true },
    LATE_SHOWER: { name: "很晚洗澡", unit: "/7", min: 0, max: 7, cnt7: true },
    EARLY_WAKE: { name: "早起天數", unit: "/7", min: 0, max: 7, cnt7: true },
    GAME_HRS: { name: "打電動", unit: "小時/週", min: 0, max: 60, cnt7: false },
    DND_START: { name: "勿擾開始", unit: "", min: 0, max: 4, cnt7: true },
    BREAKFAST: { name: "吃早餐", unit: "/7", min: 0, max: 7, cnt7: true },
};

/** all columns, in deck/table order. */
export const COLS: FeatureKey[] = [
    "SCREEN_AVG",
    "CAFFEINE",
    "LATE7",
    "SNACK_DAYS",
    "LATE_SHOWER",
    "EARLY_WAKE",
    "GAME_HRS",
    "DND_START",
    "BREAKFAST",
];

/** features offered in the scatter axis pickers (excludes DND_START). */
export const AXIS_KEYS: FeatureKey[] = [
    "SCREEN_AVG",
    "CAFFEINE",
    "LATE7",
    "SNACK_DAYS",
    "LATE_SHOWER",
    "EARLY_WAKE",
    "GAME_HRS",
    "BREAKFAST",
];

export const DND_LABELS = ["無", "<22", "22–23", "23–0", "0+"];

export const CANONICAL_X: FeatureKey = "SCREEN_AVG";
export const CANONICAL_Y: FeatureKey = "CAFFEINE";

/** format a raw feature value for display (DND_START is banded). */
export function formatFeature(key: FeatureKey, v: number): string {
    return key === "DND_START" ? DND_LABELS[v] : String(v);
}
