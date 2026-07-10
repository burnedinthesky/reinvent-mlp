/* Guards the single-source-of-truth contract: the RGB tuples in theme.ts
   must equal the `--color-*` hex tokens in src/styles.css `@theme`. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { C } from "../theme";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../../../styles.css"), "utf8");

function cssTokens(): Record<string, readonly [number, number, number]> {
    const out: Record<string, [number, number, number]> = {};
    for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) {
        const name = m[1].replace(/-([a-z0-9])/g, (_, ch: string) =>
            ch.toUpperCase()
        );
        const hex = m[2];
        out[name] = [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16),
        ];
    }
    return out;
}

describe("theme.ts ↔ styles.css sync", () => {
    const tokens = cssTokens();

    it("found the @theme color tokens", () => {
        expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(11);
    });

    it.each(Object.keys(C) as (keyof typeof C)[])(
        "C.%s matches --color token",
        (key) => {
            expect(
                tokens[key],
                `missing --color-${key} in styles.css`
            ).toBeDefined();
            expect([...C[key]]).toEqual([...tokens[key]]);
        }
    );

    it("every css token has a mirror in C", () => {
        expect(Object.keys(tokens).sort()).toEqual(Object.keys(C).sort());
    });
});
