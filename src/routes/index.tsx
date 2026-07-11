import { createFileRoute } from "@tanstack/react-router";

import { WorkshopApp } from "#/components/workshop/WorkshopApp";
import { LocaleProvider } from "#/lib/i18n/route";
import { ENABLE_MULTIPLAYER } from "#/env";

export const Route = createFileRoute("/")({ component: IndexRoute });

function IndexRoute() {
    return (
        <LocaleProvider>
            <WorkshopApp mode={ENABLE_MULTIPLAYER ? "room" : "serverless"} />
        </LocaleProvider>
    );
}
