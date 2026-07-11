import { createFileRoute, redirect } from "@tanstack/react-router";

import { WorkshopApp } from "#/components/workshop/WorkshopApp";
import { LocaleProvider } from "#/lib/i18n/route";
import { ENABLE_MULTIPLAYER } from "#/env";

function RoomWorkshop() {
    return (
        <LocaleProvider>
            <WorkshopApp mode="room" />
        </LocaleProvider>
    );
}

export const Route = createFileRoute("/room")({
    beforeLoad: () => {
        if (!ENABLE_MULTIPLAYER) throw redirect({ to: "/" });
    },
    component: RoomWorkshop,
});
