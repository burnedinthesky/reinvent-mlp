import { createFileRoute } from "@tanstack/react-router";

import { JoinScreen } from "#/components/workshop/JoinScreen";
import { MlpPlayground } from "#/components/workshop/MlpPlayground";
import { WorkshopProvider } from "#/state/WorkshopContext";
import { useWorkshop } from "#/state/workshop-context";
import { LocaleProvider } from "#/lib/i18n/route";

export const Route = createFileRoute("/mlp-playground")({
    component: MlpPlaygroundRoute,
});

/** Standalone, purely client-side MLP playground. Reuses the workshop provider
    to join a room and pull the dataset bundle (points/config), then trains
    in-browser — there is no server scoring here. */
function Screen() {
    const { store, ready } = useWorkshop();
    if (store.screen === "join") return <JoinScreen />;
    return (
        <main className="relative min-h-0 flex-1 overflow-hidden">
            {ready ? <MlpPlayground /> : null}
        </main>
    );
}

function MlpPlaygroundRoute() {
    return (
        <LocaleProvider>
            <WorkshopProvider>
                <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
                    <Screen />
                </div>
            </WorkshopProvider>
        </LocaleProvider>
    );
}
