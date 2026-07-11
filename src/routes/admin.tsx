import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminConsole } from "#/components/admin/AdminConsole";
import { LocaleProvider } from "#/lib/i18n/route";
import { ENABLE_MULTIPLAYER } from "#/env";

export const Route = createFileRoute("/admin")({
    beforeLoad: () => {
        if (!ENABLE_MULTIPLAYER) throw redirect({ to: "/" });
    },
    // ?admin_token=… lets the admin URL carry the token (spec §5.4).
    validateSearch: (s: Record<string, unknown>): { admin_token?: string } => ({
        admin_token:
            typeof s["admin_token"] === "string" ? s["admin_token"] : undefined,
    }),
    component: AdminRoute,
});

function AdminRoute() {
    const { admin_token } = Route.useSearch();
    return (
        <LocaleProvider>
            <AdminConsole initialToken={admin_token} />
        </LocaleProvider>
    );
}
