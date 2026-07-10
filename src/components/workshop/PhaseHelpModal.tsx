/* Per-phase "how to play" modal, opened from the account indicator (Header
   popover). Consolidates the guidance that used to float over the canvas.
   Hand-rolled modal — the kit has no Dialog primitive; overlay + Island panel,
   Esc / backdrop to close (mirrors admin/ImportHelpModal). Every scored phase
   (P1–P6) has a body; NONE shows a friendly placeholder. */

import { useEffect } from "react";

import { GhostButton, Island, Kbd, MicroLabel } from "#/components/workshop/ui";
import { BOT_CAP, LINE_CAP } from "#/lib/workshop/constants";
import type { Phase } from "#/lib/workshop/types";

const PHASE_TITLE: Record<Phase, string> = {
    P1: "猜猜類別",
    P2: "圈選規則",
    P3: "霧中直線",
    P4: "訓練機器人",
    P5: "神經元",
    P6: "遊樂場",
    NONE: "空白",
};

/** P1 body — the guess-the-class card deck. */
function P1Help() {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>翻開卡牌</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    一次看一位同學的問卷卡片。每張卡會把答案畫成長條，刻度線代表
                    <strong className="text-fg">全班中位數</strong>
                    ，幫你判斷這個人偏晚睡還是偏早睡。 請把每個人標成
                    <strong className="text-accent3">夜貓子</strong>或
                    <strong className="text-accent2">早起鳥</strong>。
                </p>
            </div>

            <div>
                <MicroLabel>快捷鍵</MicroLabel>
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted">
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>A</Kbd> 夜貓子
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>B</Kbd> 早起鳥
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>←</Kbd>
                        <Kbd>→</Kbd> 移動
                    </span>
                    <span>也可以用任一特徵排序整副牌</span>
                </div>
            </div>

            <div>
                <MicroLabel>計分</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    這一關是<strong className="text-fg">盲猜</strong>
                    ：真正標籤不會載入到這裡。
                    標完所有人後進入「檢查」並送出，伺服器會計算你的準確率。你總共有
                    <strong className="text-fg">3 次機會</strong>。
                </p>
            </div>
        </div>
    );
}

/** P3 body — fit a single straight boundary; slope-only until the (w, b) plane
    reveal is flipped on. */
function P3Help({ wbMode }: { wbMode: boolean }) {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>配出一條線</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    用一條直線把兩類分開。調整得越好，
                    <strong className="text-accent">loss 會下降</strong>，
                    準確率也會同步變化。這一關主看
                    loss，而且它和伺服器評分使用同一個尺度。
                </p>
            </div>

            <div>
                <MicroLabel>
                    {wbMode ? "調斜率，也調高度" : "先調斜率"}
                </MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {wbMode ? (
                        <>
                            在 <span className="font-mono text-fg">(w, b)</span>{" "}
                            方格裡拖曳錨點，
                            同時改變斜率並把直線往上或往下移。每次送出都會留下一個永久探測點，滑過去可以回看它的
                            <span className="font-mono text-fg">w</span> /{" "}
                            <span className="font-mono text-fg">b</span> /
                            loss。
                        </>
                    ) : (
                        <>
                            拖曳 <span className="font-mono text-fg">w</span>{" "}
                            滑桿來傾斜邊界； 高度{" "}
                            <span className="font-mono text-fg">b</span>{" "}
                            目前鎖在 0。 歷史面板會保留每次評分後的
                            loss，方便你一路追最低點。
                        </>
                    )}
                </p>
            </div>

            <div>
                <MicroLabel>計分</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    送出後，伺服器會用所有資料點評分你的直線，包含
                    <strong className="text-fg">隱藏測試資料</strong>
                    。分類錯的點會
                    <strong className="text-accent">閃紅色</strong>
                    後淡出，讓你看出邊界哪裡失手。 你有{" "}
                    <strong className="text-fg">{LINE_CAP} 次機會</strong>。
                </p>
            </div>
        </div>
    );
}

/** P6 body — the image-dataset NN playground. */
function P6Help() {
    return (
        <div className="flex flex-col gap-4">
            <div>
                <MicroLabel>核心玩法</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    這是一個自由遊樂場，沒有計分也沒有排行榜。從左側選一個影像資料集
                    （MNIST、FashionMNIST、KMNIST、CIFAR-10），即時訓練一個小型神經網路。
                    按下 ▶ 開始訓練，觀察{" "}
                    <strong className="text-accent">loss 下降</strong>、
                    <strong className="text-accent">準確率上升</strong>。
                </p>
            </div>
            <div>
                <MicroLabel>看進神經元裡</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    滑過網路圖裡任一個神經元，就能看到它在找什麼：第一層隱藏層會把每個神經元的
                    <strong className="text-fg">權重模板</strong>
                    畫成影像，並顯示它對目前圖片的活化值。
                    輸出列會顯示各類別機率。你也可以切換輸入圖片試試看。
                </p>
            </div>
        </div>
    );
}

/** P2 body — the lasso/line guidance and keyboard shortcuts that used to live in
    the floating HintCard and PillChips. */
function P2Help({ lineMode }: { lineMode: boolean }) {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>畫出你的規則</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    拖曳滑鼠，用套索圈出任意形狀的區域。圈住
                    <strong className="text-accent3">夜貓子</strong>
                    ，或切換筆刷去圈
                    <strong className="text-accent2">早起鳥</strong>
                    。灰色點沒有標籤，但伺服器評分時也會把它們算進去。
                </p>
            </div>

            <div>
                <MicroLabel>快捷鍵</MicroLabel>
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted">
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>A</Kbd>
                        <Kbd>B</Kbd> 改色
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <Kbd>Del</Kbd> 刪除
                    </span>
                    <span>拖曳可移動區域</span>
                    <span>滾輪可縮放區域</span>
                </div>
            </div>

            {lineMode && (
                <div>
                    <MicroLabel>直線模式</MicroLabel>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        拖曳兩個控制點來傾斜邊界；它們會和
                        <span className="font-mono text-fg">wx</span> /{" "}
                        <span className="font-mono text-fg">b</span>{" "}
                        滑桿保持同步。
                    </p>
                </div>
            )}
        </div>
    );
}

/** P4 body — the guidance that used to float centered over the terrain canvas. */
function P4Help() {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>組出訓練迴圈</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    你有四大類、共七種卡片：<strong>觀察</strong>（觀察 /
                    掃描）、
                    <strong>變數</strong>（設定 A–D）、<strong>邏輯</strong>
                    （如果），以及
                    <strong>動作</strong>（移動 / 跳躍 / 步長
                    ×）。迴圈跑一輪就是一個 epoch， 會重複{" "}
                    <strong className="text-accent">×100</strong>。每次讀數只問
                    <strong>一位同學</strong>
                    ，所以會刻意帶有雜訊。點膠囊可以選值，拖曳 ⠿ 可以重新排序。
                </p>
            </div>

            <div>
                <MicroLabel>觀察與掃描：你的感官</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    <strong>觀察</strong>
                    會取得一次讀數（在原地，或不移動、看一步外的位置），並存進
                    <strong>你選的變數格</strong>，沒有其他隱藏記憶。
                    <strong>掃描</strong>則像是在估坡度： 往 8
                    個方向各看一步外的帶雜訊樣本，存下讀數最低的<em>方向</em>。
                    每次探測只問一位同學，所以掃描
                    <strong className="text-accent">可能會被騙</strong>，
                    有時甚至會指向上坡。這就是本關要體會的事。
                </p>
            </div>

            <div>
                <MicroLabel>步長（= 學習率）</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    <strong>步長</strong>就是 ML 裡的<strong>學習率</strong>
                    ：它決定一次移動走多遠， 也決定觀察 / 掃描會探多遠。
                    <strong>步長 ×</strong> 可以在執行中縮小或放大它
                    （學習率排程）。方向是絕對羅盤方向（↑↗→↘↓↙←↖），不會相對轉向。訓練時可以觀察
                    loss 對 epoch 曲線和變數面板。
                </p>
            </div>

            <div>
                <MicroLabel>練習與送出</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    從側欄選一個地形。
                    <strong className="text-accent">碗形練習場</strong>
                    可以自由探索， 模擬不計分也不送出。
                    <strong className="text-accent">丘陵地形</strong>（中等）與
                    <strong className="text-accent">山脈地形</strong>
                    （困難）是兩個隱藏的計分地形，
                    各有自己的排行榜；送出會消耗共用的 {BOT_CAP} 次機會。最後
                    <strong>裁判</strong>會問
                    <em>全班</em>，取得你終點位置的真實
                    loss，並把平滑的真實曲線疊在你那些鋸齒狀的一人讀數上。
                </p>
            </div>
        </div>
    );
}

/** P5 body — the single-neuron guidance, plus the "going deep" beat once the
    p5_deep reveal is on. */
function P5Help({ deep }: { deep: boolean }) {
    return (
        <div className="space-y-5">
            <div>
                <MicroLabel>一顆神經元</MicroLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    單一神經元會在兩個 z-score 後的座標軸上計算
                    <span className="font-mono text-fg">
                        p = σ(w1·x + w2·y + b)
                    </span>
                    。 拖曳三個滑桿，讓{" "}
                    <strong className="text-accent">BCE loss</strong> 下降；
                    熱圖代表機率，虛線是 p = 0.5 的邊界。點輸出節點可以展開 σ(z)
                    曲線， 看兩個類別如何被推到 S 形曲線的兩端。
                </p>
            </div>
            {deep ? (
                <div>
                    <MicroLabel>往更深處</MicroLabel>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        切到 <strong className="text-accent">② 深層</strong>
                        後，可以加入隱藏層 （1–2 層 × 每層 1–6 顆神經元），改用
                        <strong>梯度下降訓練</strong>， 不再手動調參。按 ▶（或{" "}
                        <Kbd>Space</Kbd>）開始訓練，同時觀察 loss 與準確率。
                        點任一神經元可查看它畫出的曲面。兩個階段都送到同一個準確率排行榜。
                    </p>
                </div>
            ) : (
                <div>
                    <MicroLabel>計分</MicroLabel>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        從底部工具列選兩個座標軸後送出；伺服器會用每個資料點評分你的神經元，
                        包含隱藏測試資料。整個階段共用
                        <strong className="text-fg">10 次機會</strong>。
                    </p>
                </div>
            )}
        </div>
    );
}

export function PhaseHelpModal({
    phase,
    lineMode,
    p3wb,
    p5Deep,
    onClose,
}: {
    phase: Phase;
    lineMode: boolean;
    p3wb: boolean;
    p5Deep: boolean;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`玩法說明：${PHASE_TITLE[phase]}`}
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
            <Island className="flex max-h-[85vh] w-[480px] max-w-full flex-col overflow-hidden p-0 motion-safe:animate-pop-in">
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex max-h-[85vh] flex-col"
                >
                    <div className="flex items-start justify-between border-b border-border px-5 py-4">
                        <div>
                            <MicroLabel accent>玩法說明</MicroLabel>
                            <h3 className="mt-1 font-display text-lg font-semibold text-fg">
                                {PHASE_TITLE[phase]}
                            </h3>
                        </div>
                        <GhostButton
                            bordered
                            onClick={onClose}
                            aria-label="關閉"
                        >
                            關閉 ✕
                        </GhostButton>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                        {phase === "P1" ? (
                            <P1Help />
                        ) : phase === "P2" ? (
                            <P2Help lineMode={lineMode} />
                        ) : phase === "P3" ? (
                            <P3Help wbMode={p3wb} />
                        ) : phase === "P4" ? (
                            <P4Help />
                        ) : phase === "P5" ? (
                            <P5Help deep={p5Deep} />
                        ) : phase === "P6" ? (
                            <P6Help />
                        ) : (
                            <p className="text-sm leading-relaxed text-muted">
                                這個階段目前還沒有說明。
                            </p>
                        )}
                    </div>
                </div>
            </Island>
        </div>
    );
}
