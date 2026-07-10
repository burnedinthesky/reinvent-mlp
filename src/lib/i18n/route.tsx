/* Per-route i18n boundary. The root route's component/shell render ABOVE the
   <Outlet> streaming boundary, where React's hooks dispatcher isn't active, so
   the I18nProvider (stateful) can't live there. Instead each route renders
   <LocaleProvider> inside its own component (below the Outlet, hooks work),
   seeded from the server-resolved locale in the root route context.

   NB: this is a component, not an HOC — routes wrap their tree with
   <LocaleProvider> and keep `component:` pointing at a plain function. A call
   expression as the route `component` (e.g. withLocale(X)) makes the router
   code-splitter babel-compile the virtual component file, which we avoid. */

import { getRouteApi } from "@tanstack/react-router";

import { DEFAULT_LOCALE } from "./index";
import { I18nProvider } from "./context";

const rootApi = getRouteApi("__root__");

export function LocaleProvider({ children }: { children: React.ReactNode }) {
    const { locale } = rootApi.useRouteContext();
    return (
        <I18nProvider initialLocale={locale ?? DEFAULT_LOCALE}>
            {children}
        </I18nProvider>
    );
}
