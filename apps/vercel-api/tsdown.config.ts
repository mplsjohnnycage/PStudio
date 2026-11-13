import { defineConfig } from "tsdown";

/**
 * Vercel's Hono preset transpiles but does not bundle workspace packages.
 * Bundle all runtime dependencies (including internal TS exports) into the
 * generated backend.mjs, which the preset's traced entrypoint imports.
 */
export default defineConfig({
  clean: false,
  deps: { alwaysBundle: [/.*/] },
  entry: "./src/backend.ts",
  format: "esm",
  minify: true,
  outDir: "./src",
  target: "node24",
});
