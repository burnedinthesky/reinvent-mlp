/* Namespace fragment: operator console (admin/AdminConsole, StatusStrip,
   sections/*). See ns/shell.ts for the pattern. */

export const adminZh = {
    // AdminConsole — token gate
    "admin.gate.eyebrow": "操作員主控台",
    "admin.gate.title": "管理員登入",
    "admin.gate.body.before": "請輸入工作坊的 ",
    "admin.gate.body.after": "。開發預設值為 ",
    "admin.gate.body.suffix": "。",
    "admin.gate.placeholder": "ADMIN_TOKEN",
    "admin.gate.enter": "進入主控台 →",

    // AdminConsole — nav sections
    "admin.nav.console": "主控台",
    "admin.section.import": "設定",
    "admin.section.generate": "生成",
    "admin.section.roster": "名冊",
    "admin.section.live": "現場操控",
    "admin.section.scores": "分數",
    "admin.lock.imported": "請先匯入通過驗證的資料集（Phase 0）。",
    "admin.lock.generated": "請先執行生成並驗證。",

    // StatusStrip
    "admin.status.brand": "Admin",
    "admin.status.phase": "階段",
    "admin.status.timer": "計時",
    "admin.status.dataset": "資料集",
    "admin.status.live": "上線",
    "admin.status.none": "無",

    // GenerateSection
    "admin.generate.eyebrow": "生成",
    "admin.generate.title": "合成資料",
    "admin.generate.body":
        "調整這 500 點的楔形分佈——單線約 85%、雙線約 93–95%——再驗證它通過教學帶。執行後會解鎖主控台的其餘部分。",
    "admin.generate.strategy": "策略",
    "admin.generate.run": "生成並驗證",
    "admin.generate.running": "生成中…",
    "admin.generate.wedge": "標準楔形",
    "admin.generate.class1": "類別 1 = ",
    "admin.generate.owl": "夜貓子",
    "admin.generate.class0": "，類別 0 = ",
    "admin.generate.early": "早鳥",
    "admin.generate.histogram": "特徵分佈 · 生成前 / 生成後",
    "admin.generate.histogramFeature": "直方圖特徵",
    "admin.generate.after": "■ 生成後",
    "admin.generate.before": "▭ 生成前",
    "admin.generate.histogramNote.mid": "（真實 + 合成）· ",
    "admin.generate.histogramNote.tail":
        "（僅真實）。y 軸為各集合的佔比，因此約 {realCount} 列的真實資料集仍具可比性。",
    "admin.generate.terrain.eyebrow": "遠征地形 · §4",
    "admin.generate.terrain.body":
        "機器人攀爬的兩座計分 MLP 曲面，附上各自的難度帶與參考機器人梯隊（醉猴最差 → 掃描機器人最佳）。重新擲骰以取得新曲面。",
    "admin.generate.terrain.regenerate": "重新生成",
    "admin.generate.terrain.rerolling": "重新擲骰中…",
    "admin.generate.terrain.carving": "雕刻地形中——{phase}",
    "admin.generate.terrain.error":
        "地形建置失敗——會在下次抓取時重試。請嘗試重新擲骰。",
    "admin.generate.terrain.bands": "{passed}/{total} 帶",
    "admin.generate.terrain.ladder": "參考機器人梯隊 · 平均真實損失",
    "admin.generate.verification.title": "驗證 · §4.4",
    "admin.generate.verification.allClear": "全部帶通過",
    "admin.generate.verification.retune": "{iterations} 次重新調校",

    // ImportSection
    "admin.import.eyebrow": "設定",
    "admin.import.title": "Phase 0——載入問卷",
    "admin.import.body":
        "在匯入通過驗證的資料集之前，其他所有區塊都會保持鎖定。將 Google 試算表匯出成 CSV，然後貼上或上傳——伺服器會清理雜亂的列並推導出訓練資料。",
    "admin.import.requiredColumns": "? 必要欄位",
    "admin.import.source": "來源",
    "admin.import.paste": "貼上 CSV",
    "admin.import.upload": "上傳",
    "admin.import.linesLoaded": "已載入 {count} 行——點擊以替換",
    "admin.import.chooseFile": "選擇 responses.csv",
    "admin.import.run": "匯入並清理",
    "admin.import.running": "清理中…",
    "admin.import.failed": "匯入失敗",
    "admin.import.clearFailed": "清除失敗",
    "admin.import.resetFailed": "重置失敗",

    // ImportSection — danger zone
    "admin.import.danger": "危險區",
    "admin.import.clear.body":
        "清除已匯入的資料集，以及所有提交與迷霧查詢，將主控台退回 Phase 0。學生帳號與階段狀態會保留。",
    "admin.import.clear.confirm": "確認——清除所有資料",
    "admin.import.clear.clearing": "清除中…",
    "admin.import.clear.button": "清除所有資料",
    "admin.import.reset.lead": "重置資料庫——完整回復原廠設定。",
    "admin.import.reset.body":
        "刪除每個學生帳號、所有提交與迷霧查詢、所有資料集，並重置階段/揭示狀態。房間會回到全新啟動狀態（Phase 0，所有揭示關閉）。此動作無法復原。",
    "admin.import.reset.confirm": "確認——重置整個資料庫",
    "admin.import.reset.resetting": "重置中…",
    "admin.import.reset.button": "重置資料庫",

    // ImportSection — column check
    "admin.import.columnCheck": "欄位檢查",
    "admin.import.allPresent": "全部齊備 ✓",
    "admin.import.incomplete": "不完整",
    "admin.import.ambiguous":
        "{cols} 的標頭有歧義——有兩欄含有該代號。請重新命名，讓每個代號只對應一欄。",
    "admin.import.formDetected": "偵測到 Google 表單 ✓",
    "admin.import.tooFewColumns": "欄位太少",
    "admin.import.positional.body.before": "找不到代號——依",
    "admin.import.positional.body.after":
        "對應這 {count} 個特徵（略過 Timestamp）。標籤依各類別中位數切分，從平均就寢時間欄推導；其後的欄位會被忽略。",
    "admin.import.positional.order": "欄位順序",
    "admin.import.positional.label": "標籤（就寢時間切分）",
    "admin.import.positional.warn":
        "原始 Google 表單匯出需要 Timestamp + 這 {count} 個特徵 + 平均就寢時間欄，並依題目順序排列。",
    "admin.import.col": "第 {col} 欄",

    // ImportSection — data table
    "admin.import.currentData": "目前資料",
    "admin.import.rows": "{count} 列",
    "admin.import.refresh": "↻ 重新整理",
    "admin.import.noRows": "尚未載入任何列——請於上方匯入問卷 CSV。",
    "admin.import.table.pseudo": "代號",
    "admin.import.table.label": "標籤",

    // ImportSection — balance report
    "admin.import.balance": "平衡報告",
    "admin.import.balance.summary":
        "{total} 筆已標記 · {dropped} 筆已丟棄 · {fixed} 個儲存格已修正",
    "admin.import.balance.perFeature":
        "各特徵訊號（依類別的平均值 · 點二列相關 r）",
    "admin.import.balance.feature": "特徵",
    "admin.import.balance.mean": "平均",
    "admin.import.balance.rTitle": "點二列相關",

    // ImportHelpModal
    "admin.help.eyebrow": "CSV 契約",
    "admin.help.title": "必要欄位",
    "admin.help.body.before": "將問卷試算表匯出成 CSV。每一題的標頭必須",
    "admin.help.body.contain": "含有其代號",
    "admin.help.body.caseInsensitive": "（不分大小寫——像 ",
    "admin.help.body.exampleHeader": "螢幕使用 SCREEN_AVG(分/日)",
    "admin.help.body.mapsTo": " 這樣的標頭會對應到 ",
    "admin.help.body.after": "）。全部九個特徵欄位",
    "admin.help.body.and": "以及",
    "admin.help.body.labelCol":
        "你選定的標籤欄都是必要的；若有兩個標頭對應同一代號則會被拒絕。",
    "admin.help.raw.lead": "原始 Google 表單匯出？",
    "admin.help.raw.body.before": "直接貼上——找不到代號時，改以",
    "admin.help.raw.body.byOrder": "題目順序",
    "admin.help.raw.body.after":
        "對應欄位（Timestamp，接著這 9 個特徵，再來是平均就寢時間題）。類別標籤依中位數切分，從該就寢時間欄推導；其後的任何欄位都會被忽略。無需重新命名或手動建立標籤欄。",
    "admin.help.featureColumns": "9 個特徵欄位",
    "admin.help.table.codename": "代號",
    "admin.help.table.meaning": "意義",
    "admin.help.table.range": "範圍",
    "admin.help.table.owl": "夜貓子？",
    "admin.help.dir.early": "↓ 早鳥",
    "admin.help.dir.weak": "≈ 弱夜貓子訊號",
    "admin.help.dir.owl": "↑ 夜貓子",
    "admin.help.label.title": "標籤欄（必要）",
    "admin.help.label.body.before": "——類別標籤，",
    "admin.help.label.body.early": " = 早鳥，",
    "admin.help.label.body.owl": " = 夜貓子。",
    "admin.help.label.note":
        "標籤必須以 0/1 欄位提供——匯入工具不會替你猜測。（原始 Google 表單匯出則改由平均就寢時間欄推導。）",

    // ImportHelpModal — feature meanings
    "admin.meaning.SCREEN_AVG": "每日平均手機/螢幕使用時間。",
    "admin.meaning.CAFFEINE": "一週喝含咖啡因飲料的次數。",
    "admin.meaning.LATE7": "一週晚睡的夜晚數。",
    "admin.meaning.SNACK_DAYS": "一週吃宵夜的天數。",
    "admin.meaning.LATE_SHOWER": "一週深夜洗澡的天數。",
    "admin.meaning.EARLY_WAKE": "一週早起的天數。",
    "admin.meaning.GAME_HRS": "一週打電動的時數。",
    "admin.meaning.DND_START": "手機夜間勿擾模式啟動的時間（分帶）。",
    "admin.meaning.BREAKFAST": "一週吃早餐的天數。",

    // LiveOpsSection
    "admin.liveops.eyebrow": "現場操控",
    "admin.liveops.title": "掌控房間",
    "admin.liveops.body":
        "每支手機輪詢的唯一真實來源。從這裡驅動階段、揭示與時鐘。",
    "admin.liveops.currentPhase": "目前階段",
    "admin.liveops.preview": "開啟學生預覽 ↗",
    "admin.liveops.previewTitle": "在本機示範學生介面，不改變房間階段",
    "admin.liveops.selfSelect": "學生自選階段",
    "admin.liveops.selfSelect.body":
        "開啟：學生可自由遊走。關閉：每台裝置都鎖定於上方的階段。",
    "admin.liveops.reveals": "揭示旗標",
    "admin.liveops.reveals.selfSelectOn":
        "自選已開啟——每位學生從自己的階段選單控制各自的揭示。關閉自選以為整個房間驅動揭示。",
    "admin.liveops.reveals.body":
        "每次切換都會同時在每台學生裝置上動畫呈現。標籤在其旗標開啟前絕不會送出。",
    "admin.liveops.countdown": "倒數計時",
    "admin.liveops.countdown.ends": "於 {time} 結束",
    "admin.liveops.countdown.none": "未設定計時器——提交保持開放。",
    "admin.liveops.countdown.minutes": "倒數分鐘數",
    "admin.liveops.countdown.min": "分",
    "admin.liveops.countdown.arm": "啟動",
    "admin.liveops.countdown.clear": "清除",

    // LiveOps — phase short names (Live Ops chips)
    "admin.liveops.phase.P1": "猜猜類別",
    "admin.liveops.phase.P2": "圈選",
    "admin.liveops.phase.P3": "迷霧",
    "admin.liveops.phase.P4": "機器人",
    "admin.liveops.phase.P5": "神經元",
    "admin.liveops.phase.P6": "遊樂場",
    "admin.liveops.phase.NONE": "空白",

    // ScoresSection
    "admin.scores.eyebrow": "分數",
    "admin.scores.title": "各學生分數",
    "admin.scores.body":
        "各小隊成員在某階段的最佳嘗試——依分數或組別排序、依小隊篩選，找出誰還沒提交。授予學生額外嘗試次數，即可為所選階段重新開啟其提交按鈕。",
    "admin.scores.phase": "階段",
    "admin.scores.group": "組別",
    "admin.scores.grant": "授予",
    "admin.scores.allSquads": "所有小隊",
    "admin.scores.groupFilter": "組別篩選",
    "admin.scores.grantAria": "每列授予的嘗試次數",
    "admin.scores.metric.acc": "準確率 · 越高越好",
    "admin.scores.metric.loss": "損失 · 越低越好",
    "admin.scores.kpi.shown": "顯示",
    "admin.scores.kpi.submitted": "已提交",
    "admin.scores.kpi.best": "最佳",
    "admin.scores.loading": "載入中…",
    "admin.scores.noStudents": "此檢視沒有學生。",
    "admin.scores.col.student": "學生",
    "admin.scores.col.group": "組別",
    "admin.scores.col.attempts": "嘗試",
    "admin.scores.col.score": "分數",
    "admin.scores.col.foothill": "丘陵",
    "admin.scores.col.range": "山脈",
    "admin.scores.col.grant": "授予",
    "admin.scores.grantedTitle": "已授予 +{bonus}",
    "admin.scores.dump.title": "完整匯出",
    "admin.scores.dump.body":
        "伺服器狀態 + 使用中資料集 + 統計資料，以 JSON 呈現。",
    "admin.scores.dump.download": "下載 JSON",
    "admin.scores.dump.preparing": "準備中…",

    // WhitelistSection
    "admin.roster.eyebrow": "名冊",
    "admin.roster.title": "小隊 / 姓名白名單",
    "admin.roster.body.before":
        "上傳營隊名冊，將加入限制為已知的小隊成員。當強制執行開啟且清單非空時，",
    "admin.roster.body.format": "小隊 + 姓名",
    "admin.roster.body.after": "不在清單上的學生會在加入畫面被擋下。",
    "admin.roster.loadFailed": "無法載入名冊",
    "admin.roster.saveFailed": "儲存失敗",
    "admin.roster.enforcement": "強制執行",
    "admin.roster.enforcement.on": "開啟——{count} 個名字可加入。",
    "admin.roster.enforcement.offSaved":
        "關閉——任何人皆可加入（已儲存 {count} 個名字）。",
    "admin.roster.enforcement.off": "關閉——尚未上傳名冊；任何人皆可加入。",
    "admin.roster.enforcementAria": "切換白名單強制執行",
    "admin.roster.source": "來源",
    "admin.roster.paste": "貼上 CSV",
    "admin.roster.upload": "上傳",
    "admin.roster.columns": "欄位：team,name",
    "admin.roster.linesLoaded": "已載入 {count} 行——點擊以替換",
    "admin.roster.chooseFile": "選擇 roster.csv",
    "admin.roster.preview": "預覽",
    "admin.roster.preview.names": "{count} 個名字",
    "admin.roster.preview.skipped": " · {count} 列已略過",
    "admin.roster.preview.noValid":
        "沒有有效的列——每一行都需要一個小隊（1–10 或第 N 小隊）與一個名字。",
    "admin.roster.saved": "已儲存 {count} 個名字——強制執行已開啟。",
    "admin.roster.save": "儲存白名單",
    "admin.roster.saving": "儲存中…",
    "admin.roster.currentRoster": "目前名冊",
    "admin.roster.names": "{count} 個名字",
    "admin.roster.clear": "清除",
    "admin.roster.loading": "載入中…",
    "admin.roster.noRoster":
        "尚未儲存名冊——於上方上傳 team,name CSV 以限制加入。",

    // ui.tsx — Verdict
    "admin.ui.pass": "通過",
    "admin.ui.tune": "調校",
} as const;

export const adminEn: Record<keyof typeof adminZh, string> = {
    "admin.gate.eyebrow": "Operator console",
    "admin.gate.title": "Admin access",
    "admin.gate.body.before": "Enter the workshop ",
    "admin.gate.body.after": ". Dev default is ",
    "admin.gate.body.suffix": ".",
    "admin.gate.placeholder": "ADMIN_TOKEN",
    "admin.gate.enter": "Enter console →",

    "admin.nav.console": "Console",
    "admin.section.import": "Setup",
    "admin.section.generate": "Generate",
    "admin.section.roster": "Roster",
    "admin.section.live": "Live Ops",
    "admin.section.scores": "Scores",
    "admin.lock.imported": "Import a validated dataset first (Phase 0).",
    "admin.lock.generated": "Run Generate & verify first.",

    "admin.status.brand": "Admin",
    "admin.status.phase": "Phase",
    "admin.status.timer": "Timer",
    "admin.status.dataset": "Dataset",
    "admin.status.live": "live",
    "admin.status.none": "none",

    "admin.generate.eyebrow": "Generate",
    "admin.generate.title": "Synthetic data",
    "admin.generate.body":
        "Shape the 500-point wedge — one line ≈85%, two lines ≈93–95% — then verify it clears the teaching bands. Running this unlocks the rest of the console.",
    "admin.generate.strategy": "Strategy",
    "admin.generate.run": "Generate & verify",
    "admin.generate.running": "Generating…",
    "admin.generate.wedge": "Canonical wedge",
    "admin.generate.class1": "class 1 = ",
    "admin.generate.owl": "owl",
    "admin.generate.class0": ", class 0 = ",
    "admin.generate.early": "early",
    "admin.generate.histogram": "Feature distribution · before / after",
    "admin.generate.histogramFeature": "Histogram feature",
    "admin.generate.after": "■ after",
    "admin.generate.before": "▭ before",
    "admin.generate.histogramNote.mid": " (real + synthetic) · ",
    "admin.generate.histogramNote.tail":
        " (real only). y-axis = share of each set, so the ~{realCount}-row real set stays comparable.",
    "admin.generate.terrain.eyebrow": "Expedition terrain · §4",
    "admin.generate.terrain.body":
        "The two scored MLP surfaces the bots climb, with their hardness bands and the reference-bot ladder (醉猴 worst → a scan bot best). Re-roll for fresh surfaces.",
    "admin.generate.terrain.regenerate": "Regenerate",
    "admin.generate.terrain.rerolling": "Re-rolling…",
    "admin.generate.terrain.carving": "Carving terrains — {phase}",
    "admin.generate.terrain.error":
        "Terrain build failed — it will retry on the next fetch. Try re-rolling.",
    "admin.generate.terrain.bands": "{passed}/{total} bands",
    "admin.generate.terrain.ladder": "Ref-bot ladder · mean true loss",
    "admin.generate.verification.title": "Verification · §4.4",
    "admin.generate.verification.allClear": "all bands clear",
    "admin.generate.verification.retune": "{iterations} retune passes",

    "admin.import.eyebrow": "Setup",
    "admin.import.title": "Phase 0 — Load the survey",
    "admin.import.body":
        "Every other section stays locked until a validated dataset is imported. Export the Google Sheet to CSV and paste or upload it — the server cleans ugly rows and derives the training data.",
    "admin.import.requiredColumns": "? Required columns",
    "admin.import.source": "Source",
    "admin.import.paste": "Paste CSV",
    "admin.import.upload": "Upload",
    "admin.import.linesLoaded": "{count} lines loaded — click to replace",
    "admin.import.chooseFile": "Choose responses.csv",
    "admin.import.run": "Import & clean",
    "admin.import.running": "Cleaning…",
    "admin.import.failed": "Import failed",
    "admin.import.clearFailed": "Clear failed",
    "admin.import.resetFailed": "Reset failed",

    "admin.import.danger": "Danger zone",
    "admin.import.clear.body":
        "Clear the imported dataset plus all submissions and fog queries, returning the console to Phase 0. Student accounts and phase state are kept.",
    "admin.import.clear.confirm": "Confirm — clear all data",
    "admin.import.clear.clearing": "Clearing…",
    "admin.import.clear.button": "Clear all data",
    "admin.import.reset.lead": "Reset DB — full factory reset.",
    "admin.import.reset.body":
        "Deletes every student account, all submissions and fog queries, all datasets, and resets phase/reveal state. The room returns to a fresh boot (Phase 0, all reveals off). This cannot be undone.",
    "admin.import.reset.confirm": "Confirm — reset the entire DB",
    "admin.import.reset.resetting": "Resetting…",
    "admin.import.reset.button": "Reset DB",

    "admin.import.columnCheck": "Column check",
    "admin.import.allPresent": "all present ✓",
    "admin.import.incomplete": "incomplete",
    "admin.import.ambiguous":
        "Ambiguous header(s) for {cols} — two columns contain the codename. Rename so only one column maps to each.",
    "admin.import.formDetected": "Google Form detected ✓",
    "admin.import.tooFewColumns": "too few columns",
    "admin.import.positional.body.before":
        "No codenames found — mapping the {count} features by ",
    "admin.import.positional.body.after":
        " (Timestamp skipped). The label is derived from the average-bedtime column via a class-median split; columns past it are ignored.",
    "admin.import.positional.order": "column order",
    "admin.import.positional.label": "label (bedtime split)",
    "admin.import.positional.warn":
        "A raw Google-Form export needs Timestamp + the {count} features + the average-bedtime column, in question order.",
    "admin.import.col": "col {col}",

    "admin.import.currentData": "Current data",
    "admin.import.rows": "{count} rows",
    "admin.import.refresh": "↻ Refresh",
    "admin.import.noRows": "No rows loaded yet — import a survey CSV above.",
    "admin.import.table.pseudo": "Pseudo",
    "admin.import.table.label": "Label",

    "admin.import.balance": "Balance report",
    "admin.import.balance.summary":
        "{total} labelled · {dropped} dropped · {fixed} cells fixed",
    "admin.import.balance.perFeature":
        "Per-feature signal (mean by class · point-biserial r)",
    "admin.import.balance.feature": "Feature",
    "admin.import.balance.mean": "mean",
    "admin.import.balance.rTitle": "point-biserial correlation",

    "admin.help.eyebrow": "CSV contract",
    "admin.help.title": "Required columns",
    "admin.help.body.before":
        "Export the survey Sheet to CSV. Each question's header must ",
    "admin.help.body.contain": "contain its codename",
    "admin.help.body.caseInsensitive": " (case-insensitive — a header like ",
    "admin.help.body.exampleHeader": "Screen Use SCREEN_AVG (min/day)",
    "admin.help.body.mapsTo": " maps to ",
    "admin.help.body.after": "). All nine feature columns ",
    "admin.help.body.and": "and",
    "admin.help.body.labelCol":
        " your chosen label column are required; two headers matching one codename is rejected.",
    "admin.help.raw.lead": "Raw Google-Form export?",
    "admin.help.raw.body.before":
        "Paste it as-is — when no codenames are found, columns are mapped ",
    "admin.help.raw.body.byOrder": "by question order",
    "admin.help.raw.body.after":
        " instead (Timestamp, then these 9 features, then the average-bedtime question). The class label is derived from that bedtime column via a median split; any columns after it are ignored. No renaming or manual label column needed.",
    "admin.help.featureColumns": "9 feature columns",
    "admin.help.table.codename": "Codename",
    "admin.help.table.meaning": "Meaning",
    "admin.help.table.range": "Range",
    "admin.help.table.owl": "Owl?",
    "admin.help.dir.early": "↓ early",
    "admin.help.dir.weak": "≈ weak owl",
    "admin.help.dir.owl": "↑ owl",
    "admin.help.label.title": "Label column (required)",
    "admin.help.label.body.before": " — class label, ",
    "admin.help.label.body.early": " = early bird, ",
    "admin.help.label.body.owl": " = night owl.",
    "admin.help.label.note":
        "The label must be present as a 0/1 column — the importer will not guess it for you. (A raw Google-Form export instead derives it from the average-bedtime column.)",

    "admin.meaning.SCREEN_AVG": "Average daily phone/screen time.",
    "admin.meaning.CAFFEINE": "Caffeinated drinks in a week.",
    "admin.meaning.LATE7": "Nights per week going to bed late.",
    "admin.meaning.SNACK_DAYS": "Days per week with a late-night snack.",
    "admin.meaning.LATE_SHOWER": "Days per week showering late at night.",
    "admin.meaning.EARLY_WAKE": "Days per week waking up early.",
    "admin.meaning.GAME_HRS": "Hours per week gaming.",
    "admin.meaning.DND_START":
        "When phone Do-Not-Disturb kicks in at night (banded).",
    "admin.meaning.BREAKFAST": "Days per week eating breakfast.",

    "admin.liveops.eyebrow": "Live Ops",
    "admin.liveops.title": "Run the room",
    "admin.liveops.body":
        "The single source of truth every phone polls. Drive phases, reveals, and the clock from here.",
    "admin.liveops.currentPhase": "Current phase",
    "admin.liveops.preview": "Open student preview ↗",
    "admin.liveops.previewTitle":
        "Demo the student UI locally without changing the room phase",
    "admin.liveops.selfSelect": "Students self-select phase",
    "admin.liveops.selfSelect.body":
        "On: students roam freely. Off: every device is locked to the phase above.",
    "admin.liveops.reveals": "Reveal flags",
    "admin.liveops.reveals.selfSelectOn":
        "Self-select is on — each student controls their own reveals from their phase menu. Turn self-select off to drive reveals for the whole room.",
    "admin.liveops.reveals.body":
        "Each flip animates on every student device at once. Labels never ship until their flag is on.",
    "admin.liveops.countdown": "Countdown",
    "admin.liveops.countdown.ends": "Ends {time}",
    "admin.liveops.countdown.none": "No timer armed — submissions stay open.",
    "admin.liveops.countdown.minutes": "Countdown minutes",
    "admin.liveops.countdown.min": "min",
    "admin.liveops.countdown.arm": "Arm",
    "admin.liveops.countdown.clear": "Clear",

    "admin.liveops.phase.P1": "Guess the Class",
    "admin.liveops.phase.P2": "Circles",
    "admin.liveops.phase.P3": "Fog",
    "admin.liveops.phase.P4": "Bots",
    "admin.liveops.phase.P5": "Neuron",
    "admin.liveops.phase.P6": "Playground",
    "admin.liveops.phase.NONE": "Nothing",

    "admin.scores.eyebrow": "Scores",
    "admin.scores.title": "Per-student scores",
    "admin.scores.body":
        "Every squad member's best attempt for a phase — sort by score or group, filter by squad, and spot who hasn't submitted. Grant a student extra attempts to re-open their submit button for the selected phase.",
    "admin.scores.phase": "Phase",
    "admin.scores.group": "Group",
    "admin.scores.grant": "Grant",
    "admin.scores.allSquads": "All squads",
    "admin.scores.groupFilter": "Group filter",
    "admin.scores.grantAria": "Attempts to grant per row",
    "admin.scores.metric.acc": "accuracy · higher better",
    "admin.scores.metric.loss": "loss · lower better",
    "admin.scores.kpi.shown": "Shown",
    "admin.scores.kpi.submitted": "Submitted",
    "admin.scores.kpi.best": "Best",
    "admin.scores.loading": "Loading…",
    "admin.scores.noStudents": "No students for this view.",
    "admin.scores.col.student": "Student",
    "admin.scores.col.group": "Group",
    "admin.scores.col.attempts": "Attempts",
    "admin.scores.col.score": "Score",
    "admin.scores.col.foothill": "Foothill",
    "admin.scores.col.range": "Range",
    "admin.scores.col.grant": "Grant",
    "admin.scores.grantedTitle": "+{bonus} granted",
    "admin.scores.dump.title": "Full dump",
    "admin.scores.dump.body": "Server state + active dataset + stats, as JSON.",
    "admin.scores.dump.download": "Download JSON",
    "admin.scores.dump.preparing": "Preparing…",

    "admin.roster.eyebrow": "Roster",
    "admin.roster.title": "Team / name whitelist",
    "admin.roster.body.before":
        "Upload the camp roster to lock joining to known squad members. When enforcement is on, a student whose ",
    "admin.roster.body.format": "Squad + Name",
    "admin.roster.body.after":
        " isn't on the list is turned away at the join screen.",
    "admin.roster.loadFailed": "Could not load the roster",
    "admin.roster.saveFailed": "Save failed",
    "admin.roster.enforcement": "Enforcement",
    "admin.roster.enforcement.on": "On — {count} names may join.",
    "admin.roster.enforcement.offSaved":
        "Off — anyone may join ({count} names saved).",
    "admin.roster.enforcement.off":
        "Off — no roster uploaded; anyone may join.",
    "admin.roster.enforcementAria": "Toggle whitelist enforcement",
    "admin.roster.source": "Source",
    "admin.roster.paste": "Paste CSV",
    "admin.roster.upload": "Upload",
    "admin.roster.columns": "columns: team,name",
    "admin.roster.linesLoaded": "{count} lines loaded — click to replace",
    "admin.roster.chooseFile": "Choose roster.csv",
    "admin.roster.preview": "Preview",
    "admin.roster.preview.names": "{count} names",
    "admin.roster.preview.skipped": " · {count} rows skipped",
    "admin.roster.preview.noValid":
        "No valid rows — each line needs a squad (1–10 or 第N小隊) and a name.",
    "admin.roster.saved": "Saved {count} names — enforcement is on.",
    "admin.roster.save": "Save whitelist",
    "admin.roster.saving": "Saving…",
    "admin.roster.currentRoster": "Current roster",
    "admin.roster.names": "{count} names",
    "admin.roster.clear": "Clear",
    "admin.roster.loading": "Loading…",
    "admin.roster.noRoster":
        "No roster saved — upload a team,name CSV above to limit joining.",

    "admin.ui.pass": "pass",
    "admin.ui.tune": "tune",
};
