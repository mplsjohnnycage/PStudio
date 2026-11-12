import assert from "node:assert/strict";
import { test } from "node:test";
import handler from "../src/neon-health.ts";

test("function health path is bounded and not a public SQL interface", async () => {
  const denied = await handler.fetch(
    new Request("https://example.invalid/private-data")
  );
  assert.equal(denied.status, 404);
  const wrong = await handler.fetch(
    new Request("https://example.invalid/health", { method: "POST" })
  );
  assert.equal(wrong.status, 405);
});
