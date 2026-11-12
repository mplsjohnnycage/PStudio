// biome-ignore-all lint/suspicious/useAwait: Async fixture stubs deliberately implement promise-based adapter contracts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentRoutes } from "../src/agent-broker.ts";
import { privateAgentConfigured } from "../src/rivet-agent-client.ts";

const path = "https://api.example.invalid/workspaces/workspace_1/agent";
function fixture(available = true) {
  const calls = [];
  const app = createAgentRoutes({
    authorize: async (user, workspace) =>
      user === "owner-1" && workspace === "workspace_1",
    broker: {
      available,
      connected: async (user) => {
        calls.push(["connected", user]);
        return true;
      },
      loginFinish: async (user, callback) => {
        calls.push(["finish", user, callback]);
      },
      loginStart: async (user) => {
        calls.push(["start", user]);
        return "https://chatgpt.com/consent";
      },
      prompt: async (user, workspace, text, requestId) => {
        calls.push(["prompt", user, workspace, text, requestId]);
        return { status: "done", text: "checked" };
      },
    },
    events: async () => [],
    verify: async (authorization) =>
      authorization === "Bearer valid-user" ? "owner-1" : null,
  });
  return { app, calls };
}
const headers = {
  Authorization: "Bearer valid-user",
  "Content-Type": "application/json",
};
test("agent routes reject anonymous and wrong-workspace callers", async () => {
  const { app, calls } = fixture();
  assert.equal((await app.request(`${path}/status`)).status, 401);
  assert.equal(
    (
      await app.request(`${path}/status`, {
        headers: { Authorization: "Bearer forged" },
      })
    ).status,
    401
  );
  const other = path.replace("workspace_1", "workspace_other");
  assert.equal((await app.request(`${other}/status`, { headers })).status, 404);
  assert.equal(calls.length, 0);
});
test("unconfigured Rivet prevents login or model calls", async () => {
  const { app, calls } = fixture(false);
  const status = await app.request(`${path}/status`, { headers });
  assert.equal((await status.json()).available, false);
  const model = await app.request(`${path}/prompt`, {
    body: JSON.stringify({ text: "hello" }),
    headers,
    method: "POST",
  });
  assert.equal(model.status, 503);
  assert.equal(calls.length, 0);
});
test("authenticated broker takes Neon subject, not untrusted payload", async () => {
  const { app, calls } = fixture();
  const response = await app.request(`${path}/prompt`, {
    body: JSON.stringify({
      requestId: "c305ce55-247e-4649-baa4-e27b60bfa8b0",
      text: "Move to Studio",
      userId: "admin",
    }),
    headers,
    method: "POST",
  });
  assert.equal(response.status, 400);
  const ok = await app.request(`${path}/prompt`, {
    body: JSON.stringify({
      requestId: "c305ce55-247e-4649-baa4-e27b60bfa8b0",
      text: "Move to Studio",
    }),
    headers,
    method: "POST",
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls[0], [
    "prompt",
    "owner-1",
    "workspace_1",
    "Move to Studio",
    "c305ce55-247e-4649-baa4-e27b60bfa8b0",
  ]);
});
test("ChatGPT callback must be local OAuth redirect, not arbitrary URL", async () => {
  const { app, calls } = fixture();
  const failed = await app.request(`${path}/chatgpt/finish`, {
    body: JSON.stringify({
      redirectUrl: "https://evil.invalid/?code=123&state=abc",
    }),
    headers,
    method: "POST",
  });
  assert.equal(failed.status, 400);
  const ok = await app.request(`${path}/chatgpt/finish`, {
    body: JSON.stringify({
      redirectUrl: "http://127.0.0.1:1455/auth/callback?code=123&state=abc",
    }),
    headers,
    method: "POST",
  });
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);
});
test("only server-side secret endpoints enable broker", () => {
  const base = {
    DATABASE_URL: "postgresql://test",
    RIVET_ENDPOINT: "https://rivet.example.test",
    RIVET_OPERATOR_AGENT_ENABLED: "1",
  };
  assert.equal(privateAgentConfigured(base), false);
  assert.equal(
    privateAgentConfigured({
      ...base,
      RIVET_NAMESPACE: "staging",
      RIVET_TOKEN: "pk_public123456789",
    }),
    false
  );
  assert.equal(
    privateAgentConfigured({
      ...base,
      RIVET_NAMESPACE: "staging",
      RIVET_TOKEN: "sk_private123456789",
    }),
    true
  );
  assert.equal(
    privateAgentConfigured({
      ...base,
      RIVET_ENDPOINT: "http://localhost:6420",
      RIVET_NAMESPACE: "staging",
      RIVET_TOKEN: "sk_private123456789",
    }),
    false
  );
  assert.equal(
    privateAgentConfigured({
      ...base,
      RIVET_ENDPOINT: "https://staging:sk_private123456789@rivet.example.test",
    }),
    true
  );
});
