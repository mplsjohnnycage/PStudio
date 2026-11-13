import assert from "node:assert/strict";
import { test } from "node:test";
import { createSpriteActionRoutes } from "../src/sprite-action.ts";

const URL = "http://localhost/workspaces/workspace_good/actions/wake-sprite";
function setup({ identity = "owner", allowed = true, fail = false } = {}) {
  const calls = { authorize: 0, wake: 0 };
  const routes = createSpriteActionRoutes({
    authorize: (user, workspace) => {
      calls.authorize += 1;
      assert.equal(user, "owner");
      assert.equal(workspace, "workspace_good");
      return allowed;
    },
    verify: async (header) => (header === "Bearer valid" ? identity : null),
    wake: () => {
      calls.wake += 1;
      if (fail) {
        throw new Error("secret contents must not leak");
      }
    },
  });
  return { calls, routes };
}

test("JWT required before any membership or Sprite call", async () => {
  const { calls, routes } = setup();
  const response = await routes.request(URL, { method: "POST" });
  assert.equal(response.status, 401);
  assert.equal(calls.wake, 0);
  assert.equal(calls.authorize, 0);
});

test("workspace membership cannot be bypassed", async () => {
  const { calls, routes } = setup({ allowed: false });
  const response = await routes.request(URL, {
    headers: { Authorization: "Bearer valid" },
    method: "POST",
  });
  assert.equal(response.status, 404);
  assert.equal(calls.wake, 0);
});

test("authorized user can request only the fixed wake action", async () => {
  const { calls, routes } = setup();
  const response = await routes.request(URL, {
    headers: { Authorization: "Bearer valid" },
    method: "POST",
  });
  assert.equal(response.status, 200);
  assert.equal(calls.wake, 1);
  assert.deepEqual(await response.json(), {
    rivetActorVerified: false,
    sprite: "prospect-studio-foundation",
    state: "awakened",
  });
  assert.equal(
    (
      await routes.request(
        "http://localhost/workspaces/workspace_good/actions/exec",
        { headers: { Authorization: "Bearer valid" }, method: "POST" }
      )
    ).status,
    404
  );
  assert.equal(
    (
      await routes.request(URL, {
        headers: { Authorization: "Bearer valid" },
        method: "GET",
      })
    ).status,
    404
  );
});

test("unexpected Sprite failure returns sanitized error", async () => {
  const { calls, routes } = setup({ fail: true });
  const response = await routes.request(URL, {
    headers: { Authorization: "Bearer valid" },
    method: "POST",
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "sprite_unavailable" });
  assert.equal(calls.wake, 1);
});
