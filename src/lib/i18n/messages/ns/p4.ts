/* Namespace fragment: Phase 4 "Train the Bots" flow (phases/p4/*).
   Stage display names live in ns/shell.ts (p4.stage.*); this covers the rest of
   the P4 UI. See ns/shell.ts for the pattern. */

export const p4Zh = {
    // header
    "p4.header.phase": "Phase 04 · 遠征",
    "p4.header.runs": "執行 {done}/{cap}",
    "p4.header.title": "組出訓練迴圈",

    // surface selector (sidebar options + description)
    "p4.surface.label": "地形",
    "p4.surface.aria": "P4 地形",
    "p4.surface.bowl": "練習 · 碗形 · 簡單",
    "p4.surface.mlp_a": "送出 · 丘陵 · 中等",
    "p4.surface.mlp_b": "送出 · 山脈 · 困難",
    "p4.surface.desc.bowl":
        "你可以在碗形練習場自由練習；執行不會計分，也不會送出。",
    "p4.surface.desc.submit":
        "送出後會評分{stage}。丘陵和山脈共用 {cap} 次機會。",

    // variable legend
    "p4.vars.legendLabel": "變數 · 點擊可重新命名",
    "p4.vars.rename": "點擊重新命名",

    // crate
    "p4.crate.label": "卡片箱 · 點擊新增 · 滑過查看說明",
    "p4.crate.count": "卡片 {count}/{max}",

    // bot name + deploy button
    "p4.deploy.namePlaceholder": "替機器人命名",
    "p4.deploy.fillLoop": "先填入迴圈",
    "p4.deploy.simulate": "執行模擬",
    "p4.deploy.capReached": "{cap} 次已用完",
    "p4.deploy.submit": "送出",

    // toasts
    "p4.toast.loopFull": "迴圈已滿，最多 {max} 張卡。移除一張後才能新增。",
    "p4.toast.runRejected": "執行被拒絕",

    // map top strip
    "p4.map.kind.practice": "練習",
    "p4.map.kind.submission": "送出",
    "p4.map.lockedHint": "送出後揭開這個地形",

    // HUD
    "p4.hud.epoch": "EPOCH",
    "p4.hud.read": "讀數 · 1 位同學",
    "p4.hud.lr": "步長 (LR)",
    "p4.hud.judge": "裁判 · 全班",

    // run chips
    "p4.chip.practice": "練習 {n}",
    "p4.chip.replay": "重播這次執行",

    // terrain build overlay
    "p4.build.title": "正在雕刻遠征地形",
    "p4.build.body":
        "伺服器正在為今天的資料集建立兩個隱藏 loss 地形；每次匯入只會做一次。 準備好後，這個階段會自動開啟。",
    "p4.build.error": "請稍等，建立過程遇到問題，正在重試。",

    // card rows (shared handles / actions)
    "p4.card.dragReorder": "拖曳重新排序",
    "p4.card.remove": "移除",

    // param pills / editors
    "p4.param.random": "🎲 隨機",
    "p4.param.randomDir": "🎲 隨機方向",
    "p4.param.here": "這裡",
    "p4.param.lookHint": "偷看一步外的位置，但不會移動你",
    "p4.param.dir": "方向",
    "p4.param.bindTo": "存進 {name}",
    "p4.param.bindConflict": "這格目前存的是另一種類型",

    // if card / branch lanes
    "p4.if.thenBranch": "then 分支",
    "p4.if.elseBranch": "else 分支",
    "p4.if.ranThisRound": "本輪有執行",
    "p4.if.branchFull": "分支已滿（最多 3 張卡）",
    "p4.if.addCard": "新增{name}",

    // program rail
    "p4.rail.stepSize": "步長",
    "p4.rail.stepSizeSuffix": "(= 學習率)",
    "p4.rail.stepSizeExplainer": "每個 epoch 中，一次移動會走多遠",
    "p4.rail.lrHint.before": "",
    "p4.rail.lrHint.mid": "就是 ML 裡所說的 ",
    "p4.rail.lrHint.term": "學習率",
    "p4.rail.lrHint.after": "",
    "p4.rail.lrNote.careful": "細心",
    "p4.rail.lrNote.cautious": "謹慎",
    "p4.rail.lrNote.steady": "穩定",
    "p4.rail.lrNote.bold": "大膽",
    "p4.rail.lrNote.reckless": "冒險",
    "p4.rail.repeat": "🔁 重複 ×100",
    "p4.rail.repeatNote": "— 跑一輪 = 一個 epoch",
    "p4.rail.emptyLoop": "迴圈是空的，從下方新增卡片",
    "p4.rail.loopBack": "↺ 回到最上方，進入下一個 epoch",
    "p4.rail.score": "🏁 評分",
    "p4.rail.scoreNote": "— 裁判會讀取你終點位置的",
    "p4.rail.trueLoss": "真實 loss",
    "p4.rail.scoreNoteAfter": "",

    // variable watch panel
    "p4.watch.title": "變數監看",
    "p4.watch.best": "最佳讀數",
    "p4.watch.sinceBest": "距離最佳已有幾輪",
} as const;

export const p4En: Record<keyof typeof p4Zh, string> = {
    "p4.header.phase": "Phase 04 · Expedition",
    "p4.header.runs": "runs {done}/{cap}",
    "p4.header.title": "Build the training loop",

    "p4.surface.label": "Terrain",
    "p4.surface.aria": "P4 terrain",
    "p4.surface.bowl": "Practice · Bowl · Easy",
    "p4.surface.mlp_a": "Submit · Foothills · Medium",
    "p4.surface.mlp_b": "Submit · Range · Hard",
    "p4.surface.desc.bowl":
        "Practice freely on the Bowl ground; runs aren't scored or submitted.",
    "p4.surface.desc.submit":
        "Submitting scores {stage}. Foothills and Range share {cap} attempts.",

    "p4.vars.legendLabel": "Variables · click to rename",
    "p4.vars.rename": "Click to rename",

    "p4.crate.label": "Card crate · click to add · hover for details",
    "p4.crate.count": "cards {count}/{max}",

    "p4.deploy.namePlaceholder": "Name your bot",
    "p4.deploy.fillLoop": "Fill the loop first",
    "p4.deploy.simulate": "Run simulation",
    "p4.deploy.capReached": "{cap} attempts used",
    "p4.deploy.submit": "Submit",

    "p4.toast.loopFull":
        "Loop is full — max {max} cards. Remove one before adding.",
    "p4.toast.runRejected": "Run rejected",

    "p4.map.kind.practice": "Practice",
    "p4.map.kind.submission": "Submit",
    "p4.map.lockedHint": "Reveal this terrain by submitting",

    "p4.hud.epoch": "EPOCH",
    "p4.hud.read": "READING · 1 student",
    "p4.hud.lr": "STEP (LR)",
    "p4.hud.judge": "JUDGE · whole class",

    "p4.chip.practice": "Practice {n}",
    "p4.chip.replay": "Replay this run",

    "p4.build.title": "Sculpting the expedition terrains",
    "p4.build.body":
        "The server is building the two hidden loss terrains for today's dataset; it only runs once per import. This phase opens automatically when it's ready.",
    "p4.build.error": "Hang tight — the build hit a snag and is retrying.",

    "p4.card.dragReorder": "Drag to reorder",
    "p4.card.remove": "Remove",

    "p4.param.random": "🎲 Random",
    "p4.param.randomDir": "🎲 Random direction",
    "p4.param.here": "Here",
    "p4.param.lookHint": "Peek one step away without moving you",
    "p4.param.dir": "Direction",
    "p4.param.bindTo": "Store into {name}",
    "p4.param.bindConflict": "This slot currently holds a different type",

    "p4.if.thenBranch": "then branch",
    "p4.if.elseBranch": "else branch",
    "p4.if.ranThisRound": "ran this round",
    "p4.if.branchFull": "Branch is full (max 3 cards)",
    "p4.if.addCard": "Add {name}",

    "p4.rail.stepSize": "Step size",
    "p4.rail.stepSizeSuffix": "(= learning rate)",
    "p4.rail.stepSizeExplainer": "How far one move travels each epoch",
    "p4.rail.lrHint.before": "",
    "p4.rail.lrHint.mid": " is what ML calls the ",
    "p4.rail.lrHint.term": "learning rate",
    "p4.rail.lrHint.after": "",
    "p4.rail.lrNote.careful": "careful",
    "p4.rail.lrNote.cautious": "cautious",
    "p4.rail.lrNote.steady": "steady",
    "p4.rail.lrNote.bold": "bold",
    "p4.rail.lrNote.reckless": "reckless",
    "p4.rail.repeat": "🔁 Repeat ×100",
    "p4.rail.repeatNote": "— one pass = one epoch",
    "p4.rail.emptyLoop": "Loop is empty — add cards below",
    "p4.rail.loopBack": "↺ Back to the top, on to the next epoch",
    "p4.rail.score": "🏁 Score",
    "p4.rail.scoreNote": "— the judge reads the",
    "p4.rail.trueLoss": "true loss",
    "p4.rail.scoreNoteAfter": " at your final spot",

    "p4.watch.title": "Variable watch",
    "p4.watch.best": "Best reading",
    "p4.watch.sinceBest": "Epochs since best",
};
