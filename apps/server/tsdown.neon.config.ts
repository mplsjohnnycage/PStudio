import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: [/.*/],
  },
  entry: "./src/neon-api.ts",
  format: "esm",
  minify: true,
  outDir: "./dist-neon",
  target: "node24",
});
