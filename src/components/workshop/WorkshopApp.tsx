import { AppShell } from "./AppShell";
import { JoinScreen } from "./JoinScreen";
import { WorkshopProvider } from "#/state/WorkshopContext";
import { useWorkshop } from "#/state/workshop-context";
import { PHASES } from "#/lib/workshop/constants";
import type { Phase } from "#/lib/workshop/types";

/** Instructor preview: `/?preview` renders the student UI locally (driving the
    phase by hand, never touching the room) so a phase can be demoed before it's
    unlocked. `?preview=P4` picks the starting phase; unknown/absent value → P1.
    Returns null when the flag is absent (the normal student app). */
function readPreviewPhase(): Phase | null {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("preview")) return null;
    const v = params.get("preview");
    return v && (PHASES as string[]).includes(v) ? (v as Phase) : "P1";
}

function Screen({ preview }: { preview: Phase | null }) {
    const { store } = useWorkshop();
    // preview bypasses the join screen entirely — there's no session to gate on.
    if (preview) return <AppShell />;
    return store.screen === "join" ? <JoinScreen /> : <AppShell />;
}

/** Blocking overlay shown when the student loses its live link to the room. It
    stops a disconnected phone from acting outside the operator's control; it
    clears automatically the moment the /state poll reaches the server again. */
function DisconnectGuard() {
    const { online } = useWorkshop();
    if (online) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/85 backdrop-blur-sm">
            <div className="mx-6 w-[360px] max-w-full rounded-[18px] border border-border bg-panel px-8 py-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-warning/40">
                    <span className="h-2.5 w-2.5 rounded-full bg-warning motion-safe:animate-pulse" />
                </div>
                <h2 className="font-display text-lg font-semibold text-fg">
                    重新連線中…
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    與工作坊房間的連線中斷了。請稍等，重新連上房間後畫面會自動解鎖。
                </p>
            </div>
        </div>
    );
}

/** Blocking overlay shown when the room is reachable but the host hasn't loaded
    today's dataset yet. Distinct from DisconnectGuard: this is the expected
    pre-workshop state, not a fault, so it reads calm (accent, not warning) and
    clears automatically once the survey is imported. */
function RoomWaitingGuard() {
    const { online, waiting } = useWorkshop();
    if (!online || !waiting) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/85 backdrop-blur-sm">
            <div className="mx-6 w-[360px] max-w-full rounded-[18px] border border-border bg-panel px-8 py-8 text-center shadow-lg">
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-accent/40">
                    <span className="h-2.5 w-2.5 rounded-full bg-accent motion-safe:animate-pulse" />
                </div>
                <h2 className="font-display text-lg font-semibold text-fg">
                    等待房間開放
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    工作坊還沒開始。主持人載入今天的資料後，這個畫面會自動開啟。
                </p>
            </div>
        </div>
    );
}

export function WorkshopApp() {
    const preview = readPreviewPhase();
    return (
        <WorkshopProvider preview={preview}>
            <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
                <Screen preview={preview} />
                <DisconnectGuard />
                <RoomWaitingGuard />
            </div>
        </WorkshopProvider>
    );
}
