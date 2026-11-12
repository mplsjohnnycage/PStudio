import assert from "node:assert/strict";
import { test } from "node:test";
import { createReviewRoutes } from "../src/review-api.ts";

const deps = {
  decide: async (user, ws, _id, decision) =>
    user === "op" && ws === "ws"
      ? {
          approvalId: "approval_test",
          kind: decision,
          releaseId: "release_test",
        }
      : { kind: "not_found" },
  open: async (user, workspace, _preview) =>
    user === "op" && workspace === "ws"
      ? {
          approvalId: "approval_test",
          kind: "opened",
          releaseId: "release_test",
        }
      : { kind: "not_found" },
  read: async (user, ws, id) =>
    user === "op" && ws === "ws"
      ? {
          approvalId: "approval_test",
          decidedAt: null,
          decidedBy: null,
          previewId: id,
          releaseId: "release_test",
          state: "pending",
        }
      : null,
  verify: async (authorization) =>
    authorization === "Bearer allowed" ? "op" : null,
};
const app = createReviewRoutes(deps);
const base = "https://localhost/workspaces/ws/previews/preview_test";
const headers = {
  Authorization: "Bearer allowed",
  "Content-Type": "application/json",
};

test("review routes enforce bearer authorization before querying data", async () => {
  await Promise.all(
    ["review", "decision"].map(async (route) => {
      const res = await app.request(`${base}/${route}`, { method: "POST" });
      assert.equal(res.status, 401);
    })
  );
  assert.equal((await app.request(`${base}/review`)).status, 401);
});
test("review creation, read and decision return stable identifiers, validation and statuses", async () => {
  const opened = await app.request(`${base}/review`, {
    headers,
    method: "POST",
  });
  assert.equal(opened.status, 201);
  assert.equal((await opened.json()).approvalId, "approval_test");
  const read = await app.request(`${base}/review`, { headers });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).state, "pending");
  const invalid = await app.request(`${base}/decision`, {
    body: JSON.stringify({ decision: "publish" }),
    headers,
    method: "POST",
  });
  assert.equal(invalid.status, 400);
  const valid = await app.request(`${base}/decision`, {
    body: JSON.stringify({ decision: "approved" }),
    headers,
    method: "POST",
  });
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).kind, "approved");
});
test("review routes hide resources outside the authorized workspace", async () => {
  const denied = await app.request(
    "https://localhost/workspaces/other/previews/preview_test/review",
    { headers, method: "POST" }
  );
  assert.equal(denied.status, 404);
  const forged = await app.request(
    "https://localhost/workspaces/ws!!/previews/preview_test/review",
    { headers, method: "POST" }
  );
  assert.equal(forged.status, 400);
});
