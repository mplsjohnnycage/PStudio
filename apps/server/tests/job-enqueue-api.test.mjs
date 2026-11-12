import assert from "node:assert/strict";
import { test } from "node:test";
import { createJobEnqueueRoutes } from "../src/job-enqueue-api.ts";

const request = (app, opts = {}) =>
  app.request("http://localhost/workspaces/ws-1/prospects/p-1/jobs", {
    body: JSON.stringify(opts.body ?? { type: "enrich" }),
    headers: {
      Authorization: "Bearer valid",
      "Content-Type": "application/json",
      "Idempotency-Key": "client-op-123",
      ...opts.headers,
    },
    method: "POST",
  });

test("job enqueue rejects absent and forged authentication without calling storage", async () => {
  let calls = 0;
  const app = createJobEnqueueRoutes({
    enqueue: () => {
      calls += 1;
      return Promise.resolve({ jobId: "job-1", kind: "created" });
    },
    verify: (h) => Promise.resolve(h === "Bearer valid" ? "member-1" : null),
  });
  assert.equal(
    (await request(app, { headers: { Authorization: "" } })).status,
    401
  );
  assert.equal(
    (await request(app, { headers: { Authorization: "Bearer forged" } }))
      .status,
    401
  );
  assert.equal(calls, 0);
});

test("enqueue only accepts bounded idempotent enrichment, signed identity, and scoped identifiers", async () => {
  const calls = [];
  const app = createJobEnqueueRoutes({
    enqueue: (userId, workspaceId, prospectId, key) => {
      calls.push([userId, workspaceId, prospectId, key]);
      return Promise.resolve({ jobId: "job-deterministic", kind: "created" });
    },
    verify: () => Promise.resolve("verified-user"),
  });
  const accepted = await request(app, { headers: { "x-user-id": "forged" } });
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).jobId, "job-deterministic");
  assert.deepEqual(calls, [["verified-user", "ws-1", "p-1", "client-op-123"]]);
  assert.equal((await request(app, { body: { type: "crawl" } })).status, 400);
  assert.equal(
    (await request(app, { body: { requiresApproval: false, type: "enrich" } }))
      .status,
    400
  );
  assert.equal(
    (await request(app, { headers: { "Idempotency-Key": "" } })).status,
    400
  );
  assert.equal(
    (await request(app, { headers: { "Idempotency-Key": "x".repeat(200) } }))
      .status,
    400
  );
  assert.equal(calls.length, 1);
});

test("enqueue hides unknown membership and avoids leaking database exceptions", async () => {
  const denied = createJobEnqueueRoutes({
    enqueue: () => Promise.resolve({ kind: "not_found" }),
    verify: () => Promise.resolve("user-1"),
  });
  assert.equal((await request(denied)).status, 404);
  const conflicted = createJobEnqueueRoutes({
    enqueue: () => Promise.resolve({ kind: "conflict" }),
    verify: () => Promise.resolve("user-1"),
  });
  assert.equal((await request(conflicted)).status, 409);
  const failing = createJobEnqueueRoutes({
    enqueue: () => Promise.reject(new Error("SECRET DATABASE PASSWORD ERROR")),
    verify: () => Promise.resolve("user-1"),
  });
  const response = await request(failing);
  assert.equal(response.status, 503);
  assert.equal(
    (await response.text()).includes("SECRET DATABASE PASSWORD ERROR"),
    false
  );
});
