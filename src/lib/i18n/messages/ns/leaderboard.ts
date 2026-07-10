/* Namespace fragment: the public /leaderboard route. Phase display names are
   reused from the shared phases.*.name keys; only the leaderboard-specific NONE
   label ("standby", distinct from the shell's "blank") lives here. */

export const leaderboardZh = {
    "leaderboard.brand": "重新發明 MLP",
    "leaderboard.title": "小隊排行榜",
    "leaderboard.phase": "階段",
    "leaderboard.timeLeft": "剩餘時間",
    "leaderboard.live": "即時更新中",
    "leaderboard.reconnecting": "重新連線中",
    "leaderboard.loading": "載入中…",
    "leaderboard.noPhase.title": "尚未選擇階段",
    "leaderboard.noPhase.body": "主持人開啟階段後，排行榜會自動顯示。",
    "leaderboard.metric.acc": "準確率 ↑",
    "leaderboard.metric.loss": "loss ↓",
    "leaderboard.empty": "名單中還沒有小隊。",
    "leaderboard.scoredTitle": "已得分人數 / 名單人數",
    "leaderboard.phase.none": "待機",
} as const;

export const leaderboardEn: Record<keyof typeof leaderboardZh, string> = {
    "leaderboard.brand": "Reinventing the MLP",
    "leaderboard.title": "Squad Leaderboard",
    "leaderboard.phase": "Phase",
    "leaderboard.timeLeft": "Time left",
    "leaderboard.live": "Live",
    "leaderboard.reconnecting": "Reconnecting",
    "leaderboard.loading": "Loading…",
    "leaderboard.noPhase.title": "No phase selected",
    "leaderboard.noPhase.body":
        "The board appears automatically once the host opens a phase.",
    "leaderboard.metric.acc": "Accuracy ↑",
    "leaderboard.metric.loss": "loss ↓",
    "leaderboard.empty": "No squads on the roster yet.",
    "leaderboard.scoredTitle": "Scored / roster size",
    "leaderboard.phase.none": "Standby",
};
