/* Namespace fragment: the per-phase help modal (PhaseHelpModal).
   The largest single block of prose. See ns/shell.ts for the pattern. */

export const helpZh = {
    // ── Modal chrome ───────────────────────────────────────────────────────
    "help.aria.title": "玩法說明：{title}",
    "help.eyebrow": "玩法說明",
    "help.none": "這個階段目前還沒有說明。",

    // ── P1 · Guess the Class ───────────────────────────────────────────────
    "help.p1.flip.title": "翻開卡牌",
    "help.p1.flip.body.1":
        "一次看一位同學的問卷卡片。每張卡會把答案畫成長條，刻度線代表",
    "help.p1.flip.body.median": "全班中位數",
    "help.p1.flip.body.2": "，幫你判斷這個人偏晚睡還是偏早睡。 請把每個人標成",
    "help.p1.flip.body.owl": "夜貓子",
    "help.p1.flip.body.3": "或",
    "help.p1.flip.body.early": "早起鳥",
    "help.p1.flip.body.4": "。",
    "help.p1.kbd.title": "快捷鍵",
    "help.p1.kbd.owl": "夜貓子",
    "help.p1.kbd.early": "早起鳥",
    "help.p1.kbd.move": "移動",
    "help.p1.kbd.sort": "也可以用任一特徵排序整副牌",
    "help.p1.score.title": "計分",
    "help.p1.score.body.1": "這一關是",
    "help.p1.score.body.blind": "盲猜",
    "help.p1.score.body.2":
        "：真正標籤不會載入到這裡。 標完所有人後進入「檢查」並送出，伺服器會計算你的準確率。你總共有",
    "help.p1.score.body.attempts": "3 次機會",
    "help.p1.score.body.3": "。",

    // ── P2 · Circle the Rule ───────────────────────────────────────────────
    "help.p2.rule.title": "畫出你的規則",
    "help.p2.rule.body.1": "拖曳滑鼠，用套索圈出任意形狀的區域。圈住",
    "help.p2.rule.body.owl": "夜貓子",
    "help.p2.rule.body.2": "，或切換筆刷去圈",
    "help.p2.rule.body.early": "早起鳥",
    "help.p2.rule.body.3": "。灰色點沒有標籤，但伺服器評分時也會把它們算進去。",
    "help.p2.kbd.title": "快捷鍵",
    "help.p2.kbd.recolor": "改色",
    "help.p2.kbd.delete": "刪除",
    "help.p2.kbd.drag": "拖曳可移動區域",
    "help.p2.kbd.zoom": "滾輪可縮放區域",
    "help.p2.line.title": "直線模式",
    "help.p2.line.body.1": "拖曳兩個控制點來傾斜邊界；它們會和",
    "help.p2.line.body.2": "滑桿保持同步。",

    // ── P3 · Line in the Fog ───────────────────────────────────────────────
    "help.p3.fit.title": "配出一條線",
    "help.p3.fit.body.1": "用一條直線把兩類分開。調整得越好，",
    "help.p3.fit.body.loss": "loss 會下降",
    "help.p3.fit.body.2":
        "，準確率也會同步變化。這一關主看 loss，而且它和伺服器評分使用同一個尺度。",
    "help.p3.slope.title.wb": "調斜率，也調高度",
    "help.p3.slope.title.slope": "先調斜率",
    "help.p3.slope.wb.1": "在",
    "help.p3.slope.wb.2":
        "方格裡拖曳錨點， 同時改變斜率並把直線往上或往下移。每次送出都會留下一個永久探測點，滑過去可以回看它的",
    "help.p3.slope.wb.3": "/",
    "help.p3.slope.wb.4": "/ loss。",
    "help.p3.slope.slope.1": "拖曳",
    "help.p3.slope.slope.2": "滑桿來傾斜邊界； 高度",
    "help.p3.slope.slope.3":
        "目前鎖在 0。 歷史面板會保留每次評分後的 loss，方便你一路追最低點。",
    "help.p3.score.title": "計分",
    "help.p3.score.body.1": "送出後，伺服器會用所有資料點評分你的直線，包含",
    "help.p3.score.body.hidden": "隱藏測試資料",
    "help.p3.score.body.2": "。分類錯的點會",
    "help.p3.score.body.flash": "閃紅色",
    "help.p3.score.body.3": "後淡出，讓你看出邊界哪裡失手。 你有",
    "help.p3.score.body.attempts": "{cap} 次機會",
    "help.p3.score.body.4": "。",

    // ── P4 · Train the Bots ────────────────────────────────────────────────
    "help.p4.loop.title": "組出訓練迴圈",
    "help.p4.loop.body.1": "你有四大類、共七種卡片：",
    "help.p4.loop.observe": "觀察",
    "help.p4.loop.observeParen": "（觀察 / 掃描）、",
    "help.p4.loop.vars": "變數",
    "help.p4.loop.varsParen": "（設定 A–D）、",
    "help.p4.loop.logic": "邏輯",
    "help.p4.loop.logicParen": "（如果），以及",
    "help.p4.loop.action": "動作",
    "help.p4.loop.actionParen":
        "（移動 / 跳躍 / 步長 ×）。迴圈跑一輪就是一個 epoch， 會重複",
    "help.p4.loop.times": "×100",
    "help.p4.loop.body.2": "。每次讀數只問",
    "help.p4.loop.oneStudent": "一位同學",
    "help.p4.loop.body.3":
        "，所以會刻意帶有雜訊。點膠囊可以選值，拖曳 ⠿ 可以重新排序。",
    "help.p4.sense.title": "觀察與掃描：你的感官",
    "help.p4.sense.observe": "觀察",
    "help.p4.sense.body.1":
        "會取得一次讀數（在原地，或不移動、看一步外的位置），並存進",
    "help.p4.sense.varSlot": "你選的變數格",
    "help.p4.sense.body.2": "，沒有其他隱藏記憶。",
    "help.p4.sense.scan": "掃描",
    "help.p4.sense.body.3":
        "則像是在估坡度： 往 8 個方向各看一步外的帶雜訊樣本，存下讀數最低的",
    "help.p4.sense.direction": "方向",
    "help.p4.sense.body.4": "。 每次探測只問一位同學，所以掃描",
    "help.p4.sense.fooled": "可能會被騙",
    "help.p4.sense.body.5": "， 有時甚至會指向上坡。這就是本關要體會的事。",
    "help.p4.step.title": "步長（= 學習率）",
    "help.p4.step.stepLen": "步長",
    "help.p4.step.body.1": "就是 ML 裡的",
    "help.p4.step.lr": "學習率",
    "help.p4.step.body.2":
        "：它決定一次移動走多遠， 也決定觀察 / 掃描會探多遠。",
    "help.p4.step.stepMul": "步長 ×",
    "help.p4.step.body.3":
        "可以在執行中縮小或放大它 （學習率排程）。方向是絕對羅盤方向（↑↗→↘↓↙←↖），不會相對轉向。訓練時可以觀察 loss 對 epoch 曲線和變數面板。",
    "help.p4.practice.title": "練習與送出",
    "help.p4.practice.body.1": "從側欄選一個地形。",
    "help.p4.practice.body.2": "可以自由探索， 模擬不計分也不送出。",
    "help.p4.practice.hillsParen": "（中等）與",
    "help.p4.practice.mtnParen":
        "（困難）是兩個隱藏的計分地形， 各有自己的排行榜；送出會消耗共用的 {cap} 次機會。最後",
    "help.p4.practice.judge": "裁判",
    "help.p4.practice.body.3": "會問",
    "help.p4.practice.whole": "全班",
    "help.p4.practice.body.4":
        "，取得你終點位置的真實 loss，並把平滑的真實曲線疊在你那些鋸齒狀的一人讀數上。",

    // ── P5 · Neuron ────────────────────────────────────────────────────────
    "help.p5.neuron.title": "一顆神經元",
    "help.p5.neuron.body.1": "單一神經元會在兩個 z-score 後的座標軸上計算",
    "help.p5.neuron.body.2": "。 拖曳三個滑桿，讓",
    "help.p5.neuron.bce": "BCE loss",
    "help.p5.neuron.body.3":
        "下降； 熱圖代表機率，虛線是 p = 0.5 的邊界。點輸出節點可以展開 σ(z) 曲線， 看兩個類別如何被推到 S 形曲線的兩端。",
    "help.p5.deep.title": "往更深處",
    "help.p5.deep.body.1": "切到",
    "help.p5.deep.stage2": "② 深層",
    "help.p5.deep.body.2":
        "後，可以加入隱藏層 （1–2 層 × 每層 1–6 顆神經元），改用",
    "help.p5.deep.gd": "梯度下降訓練",
    "help.p5.deep.body.3": "， 不再手動調參。按 ▶（或",
    "help.p5.deep.body.4":
        "）開始訓練，同時觀察 loss 與準確率。 點任一神經元可查看它畫出的曲面。兩個階段都送到同一個準確率排行榜。",
    "help.p5.score.title": "計分",
    "help.p5.score.body.1":
        "從底部工具列選兩個座標軸後送出；伺服器會用每個資料點評分你的神經元， 包含隱藏測試資料。整個階段共用",
    "help.p5.score.attempts": "10 次機會",
    "help.p5.score.body.2": "。",

    // ── P6 · Playground ────────────────────────────────────────────────────
    "help.p6.core.title": "核心玩法",
    "help.p6.core.body.1":
        "這是一個自由遊樂場，沒有計分也沒有排行榜。從左側選一個影像資料集 （MNIST、FashionMNIST、KMNIST、CIFAR-10），即時訓練一個小型神經網路。 按下 ▶ 開始訓練，觀察",
    "help.p6.core.lossDown": "loss 下降",
    "help.p6.core.body.2": "、",
    "help.p6.core.accUp": "準確率上升",
    "help.p6.core.body.3": "。",
    "help.p6.neuron.title": "看進神經元裡",
    "help.p6.neuron.body.1":
        "滑過網路圖裡任一個神經元，就能看到它在找什麼：第一層隱藏層會把每個神經元的",
    "help.p6.neuron.template": "權重模板",
    "help.p6.neuron.body.2":
        "畫成影像，並顯示它對目前圖片的活化值。 輸出列會顯示各類別機率。你也可以切換輸入圖片試試看。",
} as const;

export const helpEn: Record<keyof typeof helpZh, string> = {
    // ── Modal chrome ───────────────────────────────────────────────────────
    "help.aria.title": "How to play: {title}",
    "help.eyebrow": "How to play",
    "help.none": "There's no guide for this phase yet.",

    // ── P1 · Guess the Class ───────────────────────────────────────────────
    "help.p1.flip.title": "Flip the cards",
    "help.p1.flip.body.1":
        "You see one classmate's survey card at a time. Each card draws the answers as bars, and the tick mark marks the",
    "help.p1.flip.body.median": "class median",
    "help.p1.flip.body.2":
        ", to help you judge whether this person tends to stay up late or rise early. Mark each person as a",
    "help.p1.flip.body.owl": "night owl",
    "help.p1.flip.body.3": "or an",
    "help.p1.flip.body.early": "early bird",
    "help.p1.flip.body.4": ".",
    "help.p1.kbd.title": "Shortcuts",
    "help.p1.kbd.owl": "Night owl",
    "help.p1.kbd.early": "Early bird",
    "help.p1.kbd.move": "Move",
    "help.p1.kbd.sort": "You can also sort the whole deck by any feature",
    "help.p1.score.title": "Scoring",
    "help.p1.score.body.1": "This round is a",
    "help.p1.score.body.blind": "blind guess",
    "help.p1.score.body.2":
        ": the true labels aren't loaded here. Once you've labeled everyone, enter “Review” and submit, and the server computes your accuracy. You have",
    "help.p1.score.body.attempts": "3 attempts",
    "help.p1.score.body.3": "in total.",

    // ── P2 · Circle the Rule ───────────────────────────────────────────────
    "help.p2.rule.title": "Draw your rule",
    "help.p2.rule.body.1":
        "Drag the mouse to lasso a region of any shape. Circle the",
    "help.p2.rule.body.owl": "night owls",
    "help.p2.rule.body.2": ", or switch the brush to circle the",
    "help.p2.rule.body.early": "early birds",
    "help.p2.rule.body.3":
        ". The gray points are unlabeled, but the server counts them in when scoring too.",
    "help.p2.kbd.title": "Shortcuts",
    "help.p2.kbd.recolor": "Recolor",
    "help.p2.kbd.delete": "Delete",
    "help.p2.kbd.drag": "Drag to move a region",
    "help.p2.kbd.zoom": "Scroll to resize a region",
    "help.p2.line.title": "Line mode",
    "help.p2.line.body.1":
        "Drag the two control points to tilt the boundary; they stay in sync with the",
    "help.p2.line.body.2": "sliders.",

    // ── P3 · Line in the Fog ───────────────────────────────────────────────
    "help.p3.fit.title": "Fit a line",
    "help.p3.fit.body.1":
        "Separate the two classes with a single straight line. The better you tune it, the",
    "help.p3.fit.body.loss": "lower the loss goes",
    "help.p3.fit.body.2":
        ", and accuracy moves along with it. This round mainly watches loss, and it uses the same scale as the server's scoring.",
    "help.p3.slope.title.wb": "Tune the slope, and the height too",
    "help.p3.slope.title.slope": "Tune the slope first",
    "help.p3.slope.wb.1": "Drag the anchor inside the",
    "help.p3.slope.wb.2":
        "grid to change the slope and shift the line up or down at the same time. Every submission leaves a permanent probe point; hover it to revisit its",
    "help.p3.slope.wb.3": "/",
    "help.p3.slope.wb.4": "/ loss.",
    "help.p3.slope.slope.1": "Drag the",
    "help.p3.slope.slope.2": "slider to tilt the boundary; the height",
    "help.p3.slope.slope.3":
        "is locked at 0 for now. The history panel keeps the loss after each scoring, so you can chase the lowest point all the way.",
    "help.p3.score.title": "Scoring",
    "help.p3.score.body.1":
        "After you submit, the server scores your line using all the data points, including",
    "help.p3.score.body.hidden": "hidden test data",
    "help.p3.score.body.2": ". Misclassified points",
    "help.p3.score.body.flash": "flash red",
    "help.p3.score.body.3":
        "then fade out, so you can see where the boundary slipped. You have",
    "help.p3.score.body.attempts": "{cap} attempts",
    "help.p3.score.body.4": ".",

    // ── P4 · Train the Bots ────────────────────────────────────────────────
    "help.p4.loop.title": "Assemble the training loop",
    "help.p4.loop.body.1": "You have four categories, seven card types in all:",
    "help.p4.loop.observe": "Sense",
    "help.p4.loop.observeParen": "(Observe / Scan),",
    "help.p4.loop.vars": "Variables",
    "help.p4.loop.varsParen": "(Set A–D),",
    "help.p4.loop.logic": "Logic",
    "help.p4.loop.logicParen": "(If), and",
    "help.p4.loop.action": "Actions",
    "help.p4.loop.actionParen":
        "(Move / Jump / Step ×). One pass through the loop is an epoch, repeated",
    "help.p4.loop.times": "×100",
    "help.p4.loop.body.2": ". Each reading asks only",
    "help.p4.loop.oneStudent": "one classmate",
    "help.p4.loop.body.3":
        ", so it's deliberately noisy. Click a chip to pick a value, drag ⠿ to reorder.",
    "help.p4.sense.title": "Observe & Scan: your senses",
    "help.p4.sense.observe": "Observe",
    "help.p4.sense.body.1":
        "takes a single reading (in place, or without moving, looking one step away) and stores it in",
    "help.p4.sense.varSlot": "the variable slot you choose",
    "help.p4.sense.body.2": ", with no other hidden memory.",
    "help.p4.sense.scan": "Scan",
    "help.p4.sense.body.3":
        "is more like estimating the slope: it looks one step away in 8 directions at noisy samples and stores the",
    "help.p4.sense.direction": "direction",
    "help.p4.sense.body.4":
        "with the lowest reading. Each probe asks only one classmate, so Scan",
    "help.p4.sense.fooled": "can be fooled",
    "help.p4.sense.body.5":
        ", sometimes even pointing uphill. That's the thing to feel out in this round.",
    "help.p4.step.title": "Step length (= learning rate)",
    "help.p4.step.stepLen": "Step length",
    "help.p4.step.body.1": "is the",
    "help.p4.step.lr": "learning rate",
    "help.p4.step.body.2":
        "in ML: it decides how far a single move goes, and how far Observe / Scan probe.",
    "help.p4.step.stepMul": "Step ×",
    "help.p4.step.body.3":
        "can shrink or grow it mid-run (learning-rate schedule). Directions are absolute compass directions (↑↗→↘↓↙←↖), never relative turns. While training you can watch the loss-vs-epoch curve and the variable panel.",
    "help.p4.practice.title": "Practice & submit",
    "help.p4.practice.body.1": "Pick a terrain from the sidebar. The",
    "help.p4.practice.body.2":
        "is for free exploration — the simulation isn't scored and isn't submitted. The",
    "help.p4.practice.hillsParen": "(medium) and the",
    "help.p4.practice.mtnParen":
        "(hard) are two hidden scored terrains, each with its own leaderboard; submitting spends the shared pool of {cap} attempts. Finally the",
    "help.p4.practice.judge": "judge",
    "help.p4.practice.body.3": "asks the",
    "help.p4.practice.whole": "whole class",
    "help.p4.practice.body.4":
        "for the true loss at your final position, and overlays the smooth true curve on top of your jagged one-person readings.",

    // ── P5 · Neuron ────────────────────────────────────────────────────────
    "help.p5.neuron.title": "A single neuron",
    "help.p5.neuron.body.1":
        "A single neuron computes, over two z-scored axes,",
    "help.p5.neuron.body.2": ". Drag the three sliders to drive the",
    "help.p5.neuron.bce": "BCE loss",
    "help.p5.neuron.body.3":
        "down; the heatmap is probability, and the dashed line is the p = 0.5 boundary. Click the output node to expand the σ(z) curve and see how the two classes get pushed to the two ends of the S-shaped curve.",
    "help.p5.deep.title": "Going deeper",
    "help.p5.deep.body.1": "Once you switch to",
    "help.p5.deep.stage2": "② Deep",
    "help.p5.deep.body.2":
        ", you can add hidden layers (1–2 layers × 1–6 neurons each) and switch to",
    "help.p5.deep.gd": "gradient-descent training",
    "help.p5.deep.body.3": ", no more manual tuning. Press ▶ (or",
    "help.p5.deep.body.4":
        ") to start training while watching loss and accuracy. Click any neuron to see the surface it draws. Both stages submit to the same accuracy leaderboard.",
    "help.p5.score.title": "Scoring",
    "help.p5.score.body.1":
        "Pick two axes from the bottom toolbar and submit; the server scores your neuron on every data point, including hidden test data. The whole phase shares",
    "help.p5.score.attempts": "10 attempts",
    "help.p5.score.body.2": ".",

    // ── P6 · Playground ────────────────────────────────────────────────────
    "help.p6.core.title": "Core play",
    "help.p6.core.body.1":
        "This is a free playground — no scoring, no leaderboard. Pick an image dataset from the left (MNIST, FashionMNIST, KMNIST, CIFAR-10) and train a small neural network live. Press ▶ to start training and watch the",
    "help.p6.core.lossDown": "loss go down",
    "help.p6.core.body.2": "and",
    "help.p6.core.accUp": "accuracy go up",
    "help.p6.core.body.3": ".",
    "help.p6.neuron.title": "Look inside the neurons",
    "help.p6.neuron.body.1":
        "Hover any neuron in the network diagram to see what it's looking for: the first hidden layer draws each neuron's",
    "help.p6.neuron.template": "weight template",
    "help.p6.neuron.body.2":
        "as an image and shows its activation for the current picture. The output row shows the per-class probabilities. You can also switch the input image to try it out.",
};
