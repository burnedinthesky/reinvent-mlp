import { createFileRoute } from "@tanstack/react-router";

import { WorkshopApp } from "#/components/workshop/WorkshopApp";
import { LocaleProvider } from "#/lib/i18n/route";

export const Route = createFileRoute("/")({ component: IndexRoute });

function IndexRoute() {
    return (
        <LocaleProvider>
            <WorkshopApp />
        </LocaleProvider>
    );
}
