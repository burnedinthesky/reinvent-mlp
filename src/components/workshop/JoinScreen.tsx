import { PrimaryButton } from "./ui";
import { MicroLabel } from "./ui/typography";
import { TEAM_LABELS } from "#/lib/workshop/constants";
import { useWorkshop } from "#/state/workshop-context";

export function JoinScreen() {
    const { store, setTeam, setName, join } = useWorkshop();
    const canJoin = store.name.trim().length > 0;

    return (
        <div className="flex flex-1 items-center justify-center bg-bg bg-[radial-gradient(1000px_500px_at_30%_-10%,#171717_0%,#0a0a0a_60%)]">
            <div className="w-[420px] rounded-[18px] border border-border bg-panel px-9 py-9 shadow-lg motion-safe:animate-pop-in">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg font-display text-[15px] font-bold text-fg">
                        M
                    </div>
                    <MicroLabel className="text-xs tracking-[.12em]">
                        SITCON 夏令營
                    </MicroLabel>
                </div>
                <h1 className="mt-4 mb-1.5 font-display text-2xl font-bold tracking-tight text-fg">
                    重新發明 MLP
                </h1>
                <p className="mb-6 text-sm leading-relaxed text-muted">
                    選擇你的小隊，並輸入要顯示在排行榜上的名字。你的名字不會和問卷答案連在一起。
                </p>

                <MicroLabel className="mb-1.5 block">小隊 · Squad</MicroLabel>
                <div className="relative mb-3.5">
                    <select
                        value={store.team}
                        onChange={(e) => setTeam(Number(e.target.value))}
                        className="w-full appearance-none rounded-md border border-border bg-bg px-3.5 py-3 pr-9 text-sm text-fg outline-none focus:border-accent"
                    >
                        {TEAM_LABELS.map((label, i) => (
                            <option key={label} value={i + 1}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <span
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
                    >
                        ▾
                    </span>
                </div>

                <MicroLabel className="mb-1.5 block">姓名</MicroLabel>
                <input
                    value={store.name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && canJoin) join();
                    }}
                    placeholder="例如：小明"
                    maxLength={24}
                    className="mb-4 w-full rounded-md border border-border bg-bg px-3.5 py-3 text-sm text-fg outline-none placeholder:text-muted/60 focus:border-accent"
                />

                <PrimaryButton
                    onClick={join}
                    disabled={!canJoin}
                    className="w-full py-3 text-[15px]"
                >
                    加入課堂 →
                </PrimaryButton>
            </div>
        </div>
    );
}
