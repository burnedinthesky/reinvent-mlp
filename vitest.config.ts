import { defineConfig } from "vitest/config";

/* Tests deliberately do NOT reuse vite.config.ts. That config loads the
   tanstackStart() and nitro() plugins, which register an SSR/module-runner
   environment that inlines React (a CommonJS module) as ESM — evaluating
   react/index.js in that runner throws `ReferenceError: module is not defined`.
   None of the tests render React or need those plugins; they only need path
   resolution (tsconfig `#/*` + `@/*` aliases), so we configure that alone. */
export default defineConfig({
    resolve: { tsconfigPaths: true },
    test: {
        environment: "node",
    },
});
