/* Namespace fragment: app shell + shared labels.

   Covers the student shell (Header, JoinScreen, AppShell, WorkshopApp, language
   switcher) plus labels that are *shared* across surfaces and therefore owned in
   one place: the reveal-flag captions, P4 stage names, and phase display names.
   Other components (incl. admin) resolve these shared keys through t(); the raw
   values live here so student and operator UIs can't drift.

   Each fragment exports `<ns>Zh` (source of truth) and `<ns>En` (typed against
   the zh keys → compile-time completeness). */

export const shellZh = {
    // common / shared vocabulary
    "common.language": "語言",
    "common.cancel": "取消",
    "common.confirm": "確認",
    "common.submit": "送出",
    "common.close": "關閉",

    // shared UI primitives
    "ui.toolbar.dragAria": "拖曳工具列，點兩下重設位置",

    // language switcher
    "lang.zh": "中文",
    "lang.en": "English",

    // Header
    "header.aria.menu": "個人與階段選單",
    "header.preview": "預覽",
    "header.guest": "訪客",
    "header.previewPhases": "預覽階段",
    "header.jumpPhase": "跳到階段",
    "header.followRoom": "跟隨房間進度，無法自行切換。",
    "header.help": "玩法說明",
    "header.exitPreview": "離開預覽",
    "header.logout": "登出",
    "header.revealToggles": "顯示開關",

    "serverless.profile.eyebrow": "本機工作坊",
    "serverless.profile.title": "我的學習空間",
    "serverless.profile.navigation": "階段導覽",
    "serverless.profile.howTo": "玩法說明",
    "serverless.profile.settings": "資料設定",
    "serverless.settings.eyebrow": "瀏覽器資料",
    "serverless.settings.title": "資料設定",
    "serverless.settings.required":
        "開始前請先生成預設合成資料，或匯入 CSV。資料只會儲存在這個瀏覽器。",
    "serverless.settings.active": "目前資料集 · {count} 筆",
    "serverless.settings.none": "尚未儲存資料集",
    "serverless.settings.continue": "繼續進入工作坊",

    // phase display names (shared: Header nav, help modal, admin)
    "phases.P1.name": "猜猜類別",
    "phases.P2.name": "圈選規則",
    "phases.P3.name": "霧中直線",
    "phases.P4.name": "訓練機器人",
    "phases.P5.name": "神經元",
    "phases.P6.name": "遊樂場",
    "phases.NONE.name": "空白",

    // JoinScreen
    "join.brand": "SITCON 夏令營",
    "join.title": "重新發明 MLP",
    "join.subtitle":
        "選擇你的小隊，並輸入要顯示在排行榜上的名字。你的名字不會和問卷答案連在一起。",
    "join.squadLabel": "小隊 · Squad",
    "join.nameLabel": "姓名",
    "join.namePlaceholder": "例如：小明",
    "join.submit": "加入課堂 →",

    // AppShell focus screen
    "appshell.focus": "請看前方",

    // WorkshopApp connection overlays
    "workshop.disconnect.title": "重新連線中…",
    "workshop.disconnect.body":
        "與工作坊房間的連線中斷了。請稍等，重新連上房間後畫面會自動解鎖。",
    "workshop.waiting.title": "等待房間開放",
    "workshop.waiting.body":
        "工作坊還沒開始。主持人載入今天的資料後，這個畫面會自動開啟。",

    // reveal-flag captions (shared: student Header self-select + admin Live Ops)
    "reveals.reveal100.caption":
        "顯示 100 筆合成訓練資料的標籤（Phase 2 起適用）。",
    "reveals.p2_line_mode.caption":
        "將 Phase 2 切成直線模式（wx·x + b）；關閉時為套索模式。",
    "reveals.p3_wb_plane.caption":
        "解鎖截距 b，進入 Phase 3 的 w+b 平面；關閉時只能調斜率 w。",
    "reveals.p3_show_dots.caption":
        "顯示 Phase 3 散佈圖；關閉時資料點只會在送出後的閃爍提示中出現。",
    "reveals.p4_terrains.caption":
        "揭開 Phase 4 遠征地形：丘陵與山脈；關閉時只有碗形練習場。",
    "reveals.p5_deep.caption":
        "解鎖 Phase 5 第二階段：加入隱藏層並訓練；關閉時只有單一神經元。",

    // P4 stage display names (shared: sidebar, run chips, leaderboard, admin)
    "p4.stage.bowl": "碗形練習場",
    "p4.stage.mlp_a": "丘陵地形",
    "p4.stage.mlp_b": "山脈地形",
} as const;

export const shellEn: Record<keyof typeof shellZh, string> = {
    "common.language": "Language",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.submit": "Submit",
    "common.close": "Close",

    "ui.toolbar.dragAria": "Drag the toolbar; double-click to reset its position",

    "lang.zh": "中文",
    "lang.en": "English",

    "header.aria.menu": "Profile and phase menu",
    "header.preview": "Preview",
    "header.guest": "Guest",
    "header.previewPhases": "Preview phase",
    "header.jumpPhase": "Jump to phase",
    "header.followRoom": "Following the room — you can't switch on your own.",
    "header.help": "How to play",
    "header.exitPreview": "Exit preview",
    "header.logout": "Log out",
    "header.revealToggles": "Reveal toggles",

    "serverless.profile.eyebrow": "Local workshop",
    "serverless.profile.title": "My learning space",
    "serverless.profile.navigation": "Phase navigation",
    "serverless.profile.howTo": "How to play",
    "serverless.profile.settings": "Data settings",
    "serverless.settings.eyebrow": "Browser data",
    "serverless.settings.title": "Data settings",
    "serverless.settings.required":
        "Generate the default synthetic dataset or import a CSV before continuing. Data stays in this browser.",
    "serverless.settings.active": "Active dataset · {count} points",
    "serverless.settings.none": "No dataset saved",
    "serverless.settings.continue": "Continue to workshop",

    "phases.P1.name": "Guess the Class",
    "phases.P2.name": "Circle the Rule",
    "phases.P3.name": "Line in the Fog",
    "phases.P4.name": "Train the Bots",
    "phases.P5.name": "Neuron",
    "phases.P6.name": "Playground",
    "phases.NONE.name": "Blank",

    "join.brand": "SITCON Camp",
    "join.title": "Reinventing the MLP",
    "join.subtitle":
        "Pick your squad and enter the name to show on the leaderboard. Your name is never linked to your survey answers.",
    "join.squadLabel": "Squad",
    "join.nameLabel": "Name",
    "join.namePlaceholder": "e.g. Ming",
    "join.submit": "Join the class →",

    "appshell.focus": "Eyes up front",

    "workshop.disconnect.title": "Reconnecting…",
    "workshop.disconnect.body":
        "The connection to the workshop room dropped. Hang tight — the screen unlocks automatically once you're back in the room.",
    "workshop.waiting.title": "Waiting for the room",
    "workshop.waiting.body":
        "The workshop hasn't started yet. This screen opens automatically once the host loads today's data.",

    "reveals.reveal100.caption":
        "Show the labels for the 100 synthetic training points (applies from Phase 2 on).",
    "reveals.p2_line_mode.caption":
        "Switch Phase 2 to line mode (w·x + b); lasso mode when off.",
    "reveals.p3_wb_plane.caption":
        "Unlock the intercept b and enter Phase 3's w+b plane; slope-only (w) when off.",
    "reveals.p3_show_dots.caption":
        "Show the Phase 3 scatter plot; when off, points only appear in the flash after a submission.",
    "reveals.p4_terrains.caption":
        "Reveal the Phase 4 expedition terrains — Foothills and Range; only the Bowl practice ground when off.",
    "reveals.p5_deep.caption":
        "Unlock Phase 5 stage two: add a hidden layer and train; single neuron only when off.",

    "p4.stage.bowl": "Bowl Practice Ground",
    "p4.stage.mlp_a": "Foothills",
    "p4.stage.mlp_b": "Mountain Range",
};
