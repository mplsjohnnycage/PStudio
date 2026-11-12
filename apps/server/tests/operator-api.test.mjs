import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { mountOperatorApi } from "../src/operator-api.ts";

function fixture() {
  const trace = [];
  const app = new Hono();
  const verify = async (header) =>
    header === "Bearer VALID" ? "user_1" : null;
  app.get("/v1/workspaces/:id/jobs", (c) => {
    trace.push({ auth: c.req.header("authorization"), url: c.req.path });
    return c.json({ identity: "workspace-filtered", jobs: [] });
  });
  app.post("/v1/workspaces/:id/prospects/:pid/jobs", async (c) => {
    trace.push({
      auth: c.req.header("authorization"),
      body: await c.req.json(),
      key: c.req.header("idempotency-key"),
      url: c.req.path,
    });
    return c.json({ jobId: "job_test", state: "queued" }, 202);
  });
  mountOperatorApi(app, verify);
  return { app, trace };
}
const url = "http://localhost/v1/operator/execute";
const execute = (app, command, token = "Bearer VALID") =>
  app.request(url, {
    body: JSON.stringify(command),
    headers: { Authorization: token, "Content-Type": "application/json" },
    method: "POST",
  });
test("bounded operator catalog is authenticated", async () => {
  const { app } = fixture();
  assert.equal(
    (await app.request("http://localhost/v1/operator/tools")).status,
    401
  );
  const ok = await app.request("http://localhost/v1/operator/tools", {
    headers: { Authorization: "Bearer VALID" },
  });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).tools.length, 15);
});
test("a model cannot impersonate identity or inject an arbitrary route", async () => {
  const { app, trace } = fixture();
  const command = { input: { workspaceId: "ws_1" }, tool: "list_jobs" };
  assert.equal((await execute(app, command, "Bearer FORGED")).status, 401);
  assert.equal(
    (
      await execute(app, {
        input: { url: "http://localhost/admin" },
        tool: "http",
      })
    ).status,
    400
  );
  assert.equal(
    (
      await execute(app, {
        input: { workspaceId: "../admin" },
        tool: "list_jobs",
      })
    ).status,
    400
  );
  assert.equal(trace.length, 0);
});
test("operator tools call exactly the existing route with original identity", async () => {
  const { app, trace } = fixture();
  const response = await execute(app, {
    input: { workspaceId: "ws_1" },
    tool: "list_jobs",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    identity: "workspace-filtered",
    jobs: [],
  });
  assert.deepEqual(trace, [
    { auth: "Bearer VALID", url: "/v1/workspaces/ws_1/jobs" },
  ]);
});
test("idempotency header is preserved; approval cannot be delegated", async () => {
  const { app, trace } = fixture();
  const command = {
    input: {
      idempotencyKey: "agent_12345678",
      prospectId: "pros_1",
      workspaceId: "ws_1",
    },
    tool: "enqueue_enrichment",
  };
  const queued = await execute(app, command);
  assert.equal(queued.status, 202);
  assert.equal(trace[0].key, "agent_12345678");
  assert.deepEqual(trace[0].body, { type: "enrich" });
  const forbidden = await execute(app, {
    input: {
      decision: "approved",
      previewId: "preview_1",
      workspaceId: "ws_1",
    },
    tool: "decide_review",
  });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error, "owner_confirmation_required");
});
test("navigation returns a client command and never mutates data", async () => {
  const { app, trace } = fixture();
  const response = await execute(app, {
    input: { view: "studio" },
    tool: "navigate",
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).clientCommand, {
    input: { view: "studio" },
    tool: "navigate",
  });
  assert.equal(trace.length, 0);
});
