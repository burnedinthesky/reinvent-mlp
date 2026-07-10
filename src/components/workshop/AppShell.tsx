import { Header } from "./Header";
import { useI18n } from "#/lib/i18n/context";
import { P1Guess } from "./phases/P1Guess";
import { P2Circles } from "./phases/P2Circles";
import { P3Line } from "./phases/P3Line";
import { P4Bots } from "./phases/P4Bots";
import { P5Neuron } from "./phases/P5Neuron";
import { P6Playground } from "./phases/P6Playground";
import { useWorkshop } from "#/state/workshop-context";

/** The operator's blank/focus stage — a deliberately empty screen so every phone
    goes quiet and eyes come up to the front. */
function FocusScreen() {
    const { t } = useI18n();
    return (
        <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted">
                <span className="h-2.5 w-2.5 rounded-full bg-current opacity-50 motion-safe:animate-pulse" />
                <span className="font-mono text-[11px] tracking-[.2em] uppercase">
                    {t("appshell.focus")}
                </span>
            </div>
        </div>
    );
}

function PhaseView() {
    const { store } = useWorkshop();
    switch (store.phase) {
        case "P1":
            return <P1Guess />;
        case "P2":
            return <P2Circles />;
        case "P3":
            return <P3Line />;
        case "P4":
            return <P4Bots />;
        case "P5":
            return <P5Neuron />;
        case "P6":
            return <P6Playground />;
        case "NONE":
            return <FocusScreen />;
    }
}

export function AppShell() {
    const { store, ready } = useWorkshop();
    const fullBleed =
        store.phase === "P2" ||
        store.phase === "P3" ||
        store.phase === "P5" ||
        store.phase === "P6" ||
        store.phase === "NONE";
    return (
        <>
            <Header />
            <main
                className={
                    fullBleed
                        ? "relative min-h-0 flex-1 overflow-hidden"
                        : "relative flex-1 overflow-auto"
                }
            >
                {ready ? <PhaseView /> : null}
            </main>
        </>
    );
}
