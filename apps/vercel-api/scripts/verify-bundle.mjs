import assert from "node:assert/strict";

/** Fail the deployment build if the self-contained Hono bundle cannot load. */
const { default: app } = await import("../src/backend.mjs");
assert.equal(typeof app.fetch, "function", "bundled Hono fetch is required");
const route = await app.request("http://localhost/__pstudio_build_smoke");
assert.equal(route.status, 404, "bundle must handle unknown routes");
console.log("PSTUDIO_VERCEL_HONO_BUNDLE_OK");
