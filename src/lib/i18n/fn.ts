/* Server function that resolves the initial locale for SSR. Reads the persisted
   cookie first, then falls back to the request's Accept-Language, then the
   default. Called from the root route's beforeLoad so the first server render
   (and <html lang>) already matches the user — no client-side flash. */

import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeader } from "@tanstack/react-start/server";

import { LOCALE_COOKIE, resolveLocale, type Locale } from "./index";

export const getInitialLocaleFn = createServerFn({ method: "GET" }).handler(
    async (): Promise<Locale> => {
        const cookie = getCookie(LOCALE_COOKIE);
        if (cookie) return resolveLocale(cookie);
        return resolveLocale(getRequestHeader("accept-language"));
    }
);
