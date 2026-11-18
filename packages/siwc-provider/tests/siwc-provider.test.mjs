import assert from "node:assert/strict";
import test from "node:test";
import {
  createSiwcModel,
  normalizeSiwcBody,
  SIWC_REQUIRED_SCOPE,
} from "../src/index.ts";

const PATTERN_CONSENT = /plan-usage consent missing/;
const PATTERN_PRINCIPAL = /principal mismatch/;
const PATTERN_CREDENTIAL = /Invalid SIWC access credential/;
const PATTERN_TOOL = /tool schemas require separate namespace validation/;
const PATTERN_STREAM = /requires streaming/;
const PATTERN_TEXT = /must be textual/;
const OWNER = "owner-verified-by-pstudio-server";
const PROMPT = [{ content: [{ text: "hello", type: "text" }], role: "user" }];
const fakeOk = () =>
  new Response("data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
    status: 200,
  });

function make(overrides = {}) {
  const calls = [];
  const credentials = [];
  const grant = {
    accessToken: "access-token-for-tests",
    expiresAt: Date.now() + 3_600_000,
    ownerUserId: OWNER,
    scopes: [SIWC_REQUIRED_SCOPE],
  };
  const credentialSource = {
    getCredential(request) {
      credentials.push(request);
      return overrides.grant ?? grant;
    },
  };
  const transport = (url, init) => {
    calls.push({
      body: JSON.parse(init.body),
      headers: new Headers(init.headers),
      method: init.method,
      url,
    });
    return overrides.transport
      ? overrides.transport(url, init, calls.length)
      : fakeOk();
  };
  const model = createSiwcModel({
    credentialSource: overrides.credentialSource ?? credentialSource,
    fetch: transport,
    modelId: "approved-model-id",
    ownerUserId: OWNER,
  });
  return { calls, credentials, model };
}

test("scope, owner, and ephemeral streaming wire contract", async () => {
  const harness = make();
  const result = await harness.model.doStream({ prompt: PROMPT });
  await result.stream.cancel();
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(harness.calls[0].method, "POST");
  assert.equal(
    harness.calls[0].headers.get("authorization"),
    "Bearer access-token-for-tests"
  );
  assert.equal(harness.calls[0].body.stream, true);
  assert.equal(harness.calls[0].body.store, false);
  assert.equal(harness.calls[0].body.model, "approved-model-id");
  assert.equal(harness.credentials.length, 1);
  assert.equal(harness.credentials[0].ownerUserId, OWNER);
});

test("identity-only token cannot call the model", async () => {
  const harness = make({
    grant: {
      accessToken: "access-token-for-tests",
      ownerUserId: OWNER,
      scopes: ["openid"],
    },
  });
  await assert.rejects(
    () => harness.model.doStream({ prompt: PROMPT }),
    PATTERN_CONSENT
  );
  assert.equal(harness.calls.length, 0);
});

test("credential principal mismatch is rejected before network", async () => {
  const harness = make({
    grant: {
      accessToken: "access-token-for-tests",
      ownerUserId: "other-user",
      scopes: [SIWC_REQUIRED_SCOPE],
    },
  });
  await assert.rejects(
    () => harness.model.doStream({ prompt: PROMPT }),
    PATTERN_PRINCIPAL
  );
  assert.equal(harness.calls.length, 0);
});

test("missing token fails closed without API key fallback", async () => {
  const harness = make({
    grant: {
      accessToken: "",
      ownerUserId: OWNER,
      scopes: [SIWC_REQUIRED_SCOPE],
    },
  });
  await assert.rejects(
    () => harness.model.doStream({ prompt: PROMPT }),
    PATTERN_CREDENTIAL
  );
  assert.equal(harness.calls.length, 0);
});

test("normalization drops unsupported fields and preserves instructions", () => {
  const normalized = normalizeSiwcBody({
    input: [
      { content: "Keep outputs short", role: "system" },
      {
        content: [{ text: "Instructions", type: "input_text" }],
        role: "developer",
      },
      { content: "hello", role: "user" },
    ],
    max_output_tokens: 150,
    model: "x",
    previous_response_id: "removed",
    prompt_cache_retention: "24h",
    safety_identifier: "removed",
    store: true,
    stream: true,
    tools: [],
  });
  assert.equal(normalized.store, false);
  assert.equal(normalized.stream, true);
  assert.equal(normalized.instructions, "Keep outputs short");
  assert.equal(normalized.input.length, 2);
  for (const key of [
    "safety_identifier",
    "max_output_tokens",
    "prompt_cache_retention",
    "previous_response_id",
    "tools",
  ]) {
    assert.equal(Object.hasOwn(normalized, key), false, key);
  }
});

test("system message from AI SDK is lifted into top-level instructions", async () => {
  const harness = make();
  const result = await harness.model.doStream({
    prompt: [{ content: "Only answer YES", role: "system" }, ...PROMPT],
    providerOptions: {
      openai: { promptCacheKey: "internal-cache-key", store: true },
    },
  });
  await result.stream.cancel();
  assert.equal(harness.calls[0].body.instructions, "Only answer YES");
  assert.equal(harness.calls[0].body.store, false);
  assert.equal(harness.calls[0].body.prompt_cache_key, "internal-cache-key");
});

test("strict route refuses tools until proper SIWC namespace encoding exists", async () => {
  const harness = make();
  await assert.rejects(
    () =>
      harness.model.doStream({
        prompt: PROMPT,
        tools: [
          {
            description: "Never execute",
            inputSchema: { properties: {}, type: "object" },
            name: "dangerous_send",
            type: "function",
          },
        ],
      }),
    PATTERN_TOOL
  );
  assert.equal(harness.calls.length, 0);
});

test("does not permit nonstreaming requests", async () => {
  const harness = make();
  await assert.rejects(
    () => harness.model.doGenerate({ prompt: PROMPT }),
    PATTERN_STREAM
  );
  assert.equal(harness.calls.length, 0);
});

test("refreshes near-expiry credential before request", async () => {
  const requests = [];
  const harness = make({
    credentialSource: {
      getCredential(req) {
        requests.push(req);
        return {
          accessToken: req.forceRefresh
            ? "fresh-access-token"
            : "stale-access-token",
          expiresAt: Date.now() + (req.forceRefresh ? 600_000 : 10_000),
          ownerUserId: OWNER,
          scopes: [SIWC_REQUIRED_SCOPE],
        };
      },
    },
  });
  const result = await harness.model.doStream({ prompt: PROMPT });
  await result.stream.cancel();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].forceRefresh, true);
  assert.equal(
    harness.calls[0].headers.get("authorization"),
    "Bearer fresh-access-token"
  );
});

test("one 401 causes one authorized refresh/replay, not an infinite loop", async () => {
  const requests = [];
  const harness = make({
    credentialSource: {
      getCredential(req) {
        requests.push(req);
        return {
          accessToken: req.forceRefresh
            ? "fresh-access-token"
            : "stale-access-token",
          ownerUserId: OWNER,
          scopes: [SIWC_REQUIRED_SCOPE],
        };
      },
    },
    transport: (_, __, count) =>
      count === 1
        ? new Response('{"error":{"message":"denied"}}', {
            headers: { "content-type": "application/json" },
            status: 401,
          })
        : fakeOk(),
  });
  const result = await harness.model.doStream({ prompt: PROMPT });
  await result.stream.cancel();
  assert.equal(harness.calls.length, 2);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].rejectedAccessToken, "stale-access-token");
  assert.equal(
    harness.calls[1].headers.get("authorization"),
    "Bearer fresh-access-token"
  );
});

test("refreshed token remains denied: only one retry", async () => {
  const harness = make({
    credentialSource: {
      getCredential(req) {
        return {
          accessToken: req.forceRefresh
            ? "fresh-access-token"
            : "stale-access-token",
          ownerUserId: OWNER,
          scopes: [SIWC_REQUIRED_SCOPE],
        };
      },
    },
    transport: () =>
      new Response('{"error":{"message":"denied"}}', {
        headers: { "content-type": "application/json" },
        status: 401,
      }),
  });
  await assert.rejects(() => harness.model.doStream({ prompt: PROMPT }));
  assert.equal(harness.calls.length, 2);
});

test("rejects non-text system input instead of silently discarding it", () => {
  assert.throws(
    () =>
      normalizeSiwcBody({
        input: [
          {
            content: [{ image_url: "x", type: "input_image" }],
            role: "system",
          },
          { content: "hi", role: "user" },
        ],
        stream: true,
      }),
    PATTERN_TEXT
  );
});

test("public Responses SSE parser yields model text through AI SDK", async () => {
  const events = [
    [
      "response.output_item.added",
      {
        item: {
          content: [],
          id: "msg_01",
          role: "assistant",
          status: "in_progress",
          type: "message",
        },
        output_index: 0,
        type: "response.output_item.added",
      },
    ],
    [
      "response.content_part.added",
      {
        content_index: 0,
        output_index: 0,
        part: { annotations: [], text: "", type: "output_text" },
        type: "response.content_part.added",
      },
    ],
    [
      "response.output_text.delta",
      {
        content_index: 0,
        delta: "SIWC works",
        item_id: "msg_01",
        output_index: 0,
        type: "response.output_text.delta",
      },
    ],
    [
      "response.output_text.done",
      {
        content_index: 0,
        output_index: 0,
        text: "SIWC works",
        type: "response.output_text.done",
      },
    ],
    [
      "response.content_part.done",
      {
        content_index: 0,
        output_index: 0,
        part: { annotations: [], text: "SIWC works", type: "output_text" },
        type: "response.content_part.done",
      },
    ],
    [
      "response.output_item.done",
      {
        item: {
          content: [
            { annotations: [], text: "SIWC works", type: "output_text" },
          ],
          id: "msg_01",
          role: "assistant",
          status: "completed",
          type: "message",
        },
        output_index: 0,
        type: "response.output_item.done",
      },
    ],
    [
      "response.completed",
      {
        response: {
          id: "resp_test_01",
          model: "approved-model-id",
          output: [],
          status: "completed",
          usage: {
            input_tokens: 5,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 3,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 8,
          },
        },
        type: "response.completed",
      },
    ],
  ];
  const wire = events
    .map(
      ([event, body]) => `event: ${event}\ndata: ${JSON.stringify(body)}\n\n`
    )
    .join("");
  const harness = make({
    transport: () =>
      new Response(wire, {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      }),
  });
  const response = await harness.model.doStream({ prompt: PROMPT });
  const chunks = [];
  for await (const chunk of response.stream) {
    chunks.push(chunk);
  }
  assert.ok(
    chunks.some(
      (chunk) => chunk.type === "text-delta" && chunk.delta === "SIWC works"
    )
  );
  assert.ok(chunks.some((chunk) => chunk.type === "finish"));
  assert.equal(chunks.filter((chunk) => chunk.type === "error").length, 0);
});
