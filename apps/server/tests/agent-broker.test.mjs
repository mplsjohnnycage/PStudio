// biome-ignore-all lint/suspicious/useAwait: Async fixture stubs deliberately implement promise-based adapter contracts.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowedChatgptUser,
  hostedPlanEnabled,
  validChatgptHostId,
} from "@prospect-studio/api/chatgpt-hosted-policy";
import { createAgentRoutes } from "../src/agent-broker.ts";
import { privateAgentConfigured } from "../src/rivet-agent-client.ts";

const path = "https://api.example.invalid/workspaces/workspace_1/agent";
function fixture(available = true, planEnabled = true) {
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
      planEnabled: (userId) => planEnabled && userId === "owner-1",
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

test("hosted ChatGPT plan usage requires an explicit authorization flag and stable host UUID", () => {
  const host = "e05569d2-d7ee-4c73-940b-9b5b1e71c13d";
  const env = { CHATGPT_HOST_ID: host, PSTUDIO_CHATGPT_PLAN_ENABLED: "1" };
  assert.equal(hostedPlanEnabled(env), false);
  assert.equal(
    hostedPlanEnabled({ ...env, PSTUDIO_CHATGPT_HOSTED_APPROVED: "0" }),
    false
  );
  assert.equal(
    hostedPlanEnabled({
      ...env,
      CHATGPT_HOST_ID: "",
      PSTUDIO_CHATGPT_HOSTED_APPROVED: "1",
    }),
    false
  );
  assert.equal(
    hostedPlanEnabled({
      ...env,
      CHATGPT_HOST_ID: "not-uuid",
      PSTUDIO_CHATGPT_HOSTED_APPROVED: "1",
    }),
    false
  );
  assert.equal(
    hostedPlanEnabled({ ...env, PSTUDIO_CHATGPT_HOSTED_APPROVED: "1" }),
    true
  );
});

test("personal self-hosted single-owner config allows only the verified owner", () => {
  const env = {
    CHATGPT_HOST_ID: "e05569d2-d7ee-4c73-940b-9b5b1e71c13d",
    PSTUDIO_CHATGPT_OWNER_USER_ID: "owner-1",
    PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED: "1",
    PSTUDIO_CHATGPT_PLAN_ENABLED: "1",
  };
  assert.equal(hostedPlanEnabled(env), true);
  assert.equal(validChatgptHostId(`urn:uuid:${env.CHATGPT_HOST_ID}`), true);
  assert.equal(allowedChatgptUser("owner-1", env), true);
  assert.equal(allowedChatgptUser("someone-else", env), false);
  assert.equal(
    hostedPlanEnabled({ ...env, PSTUDIO_CHATGPT_OWNER_USER_ID: "" }),
    false
  );
  assert.equal(
    hostedPlanEnabled({ ...env, PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED: "0" }),
    false
  );
  assert.equal(
    hostedPlanEnabled({ ...env, CHATGPT_HOST_ID: "invalid" }),
    false
  );
});

test("unapproved hosted deployments block login start, callback finish and Pi requests", async () => {
  const { app, calls } = fixture(true, false);
  const response = await app.request(`${path}/status`, { headers });
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.available, true);
  assert.equal(state.planEnabled, false);
  assert.equal(state.chatgptConnected, false);
  await Promise.all(
    [
      ["chatgpt/start", "{}"],
      [
        "chatgpt/finish",
        '{"redirectUrl":"http://127.0.0.1:1455/auth/callback?code=a&state=b"}',
      ],
      ["prompt", '{"text":"hello"}'],
    ].map(async ([endpoint, body]) => {
      const result = await app.request(`${path}/${endpoint}`, {
        body,
        headers,
        method: "POST",
      });
      assert.equal(result.status, 503);
      assert.equal(
        (await result.json()).error,
        "hosted_chatgpt_plan_not_enabled"
      );
    })
  );
  assert.equal(calls.length, 0);
});

test("a second authenticated workspace member cannot access personal ChatGPT actors", async () => {
  let invoked = 0;
  const app = createAgentRoutes({
    authorize: async () => true,
    broker: {
      available: true,
      connected: async () => {
        invoked += 1;
        return true;
      },
      loginFinish: async () => {
        invoked += 1;
      },
      loginStart: async () => {
        invoked += 1;
        return "https://auth.openai.com/example";
      },
      planEnabled: (userId) => userId === "owner-1",
      prompt: async () => {
        invoked += 1;
        return { status: "done", text: "not authorized" };
      },
    },
    events: async () => [],
    verify: async (authorization) =>
      authorization === "Bearer authenticated-member" ? "member-2" : null,
  });
  const unauthorizedHeaders = {
    Authorization: "Bearer authenticated-member",
    "Content-Type": "application/json",
  };
  const state = await app.request(`${path}/status`, {
    headers: unauthorizedHeaders,
  });
  assert.equal(state.status, 200);
  assert.equal((await state.json()).planEnabled, false);
  const start = await app.request(`${path}/chatgpt/start`, {
    headers: unauthorizedHeaders,
    method: "POST",
  });
  assert.equal(start.status, 503);
  const prompt = await app.request(`${path}/prompt`, {
    body: JSON.stringify({ text: "hello" }),
    headers: unauthorizedHeaders,
    method: "POST",
  });
  assert.equal(prompt.status, 503);
  assert.equal(invoked, 0);
});
