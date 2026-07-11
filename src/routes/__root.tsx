import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { getInitialLocaleFn } from "#/lib/i18n/fn";
import { DEFAULT_LOCALE, htmlLang } from "#/lib/i18n";
import { ENABLE_MULTIPLAYER } from "#/env";

const publicBase = import.meta.env.BASE_URL;

export const Route = createRootRoute({
    // Resolve the locale on the server (cookie → Accept-Language → default) and
    // stash it in root context, so <html lang> and every route's LocaleProvider
    // seed the right language on the first paint — no flash.
    beforeLoad: async () => ({
        locale: ENABLE_MULTIPLAYER
            ? await getInitialLocaleFn()
            : DEFAULT_LOCALE,
    }),
    head: () => ({
        meta: [
            {
                charSet: "utf-8",
            },
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1",
            },
            {
                title: "Reinventing the MLP — SITCON Camp",
            },
            {
                name: "theme-color",
                content: "#0A0A0A",
            },
        ],
        links: [
            { rel: "icon", href: `${publicBase}favicon.ico`, sizes: "48x48" },
            {
                rel: "icon",
                href: `${publicBase}favicon.svg`,
                type: "image/svg+xml",
            },
            {
                rel: "apple-touch-icon",
                href: `${publicBase}apple-touch-icon.png`,
            },
            { rel: "manifest", href: `${publicBase}manifest.json` },
            { rel: "preconnect", href: "https://fonts.googleapis.com" },
            {
                rel: "preconnect",
                href: "https://fonts.gstatic.com",
                crossOrigin: "anonymous",
            },
            {
                rel: "stylesheet",
                href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
            },
            {
                rel: "stylesheet",
                href: appCss,
            },
        ],
    }),
    shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
    // useRouteContext is a router-store read (not a React state hook), so it's
    // safe in the shell — which renders above the <Outlet> hooks boundary. Used
    // only to stamp the server-resolved <html lang>.
    const { locale } = Route.useRouteContext();
    return (
        <html lang={htmlLang(locale)}>
            <head>
                <HeadContent />
            </head>
            <body>
                {children}
                <Toaster
                    theme="dark"
                    position="bottom-center"
                    toastOptions={{
                        style: {
                            background: "var(--color-panel)",
                            border: "1px solid var(--color-border)",
                            color: "var(--color-fg)",
                            fontFamily: "inherit",
                        },
                    }}
                />
                <TanStackDevtools
                    config={{
                        position: "bottom-right",
                    }}
                    plugins={[
                        {
                            name: "Tanstack Router",
                            render: <TanStackRouterDevtoolsPanel />,
                        },
                    ]}
                />
                <Scripts />
            </body>
        </html>
    );
}
