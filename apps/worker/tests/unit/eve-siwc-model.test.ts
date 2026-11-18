import { describe, expect, test, vi } from "vitest";
import { createOwnerEveSiwcModel } from "../../src/eve-siwc-model";

const OWNER = "user-owner";
const env = {
  CHATGPT_HOST_ID: "e05569d2-d7ee-4c73-940b-9b5b1e71c13d",
  DATABASE_URL: "postgres://localhost/test",
  PSTUDIO_CHATGPT_OWNER_USER_ID: OWNER,
  PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED: "1",
  PSTUDIO_CHATGPT_PLAN_ENABLED: "1",
  RIVET_ENDPOINT: "https://rivet.example.test",
  RIVET_NAMESPACE: "pstudio-private",
  RIVET_TOKEN: "sk_test_private_server_only",
};

const PROMPT = [
  { content: [{ text: "ping", type: "text" as const }], role: "user" as const },
];

function setup() {
  const actor = {
    refresh: vi.fn().mockResolvedValue({
      access: "test-plan-token-only",
      expires: Date.now() + 600_000,
      scopes: ["openid", "chatgpt.tokens.use.direct"],
      type: "oauth",
    }),
  };
  const dispose = vi.fn().mockResolvedValue(undefined);
  const connect = vi.fn().mockResolvedValue({
    credentials: { getOrCreate: vi.fn().mockReturnValue(actor) },
    dispose,
  });
  const calls: {
    url: string;
    authorization: string | null;
    body: Record<string, unknown>;
  }[] = [];
  const transport = vi.fn((url: string | Request | URL, init?: RequestInit) => {
    calls.push({
      authorization: new Headers(init?.headers).get("authorization"),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      url: String(url),
    });
    return Promise.resolve(
      new Response("data: [DONE]\\n\\n", {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      })
    );
  });
  const model = createOwnerEveSiwcModel({
    connect,
    env,
    fetch: transport,
    modelId: "plan-enabled-model",
    ownerUserId: OWNER,
  });
  return { actor, calls, connect, dispose, model, transport };
}

describe("Eve model with existing Rivet OAuth credential actor", () => {
  test("uses a live-shaped Rivet Actor grant for public Responses API streaming", async () => {
    const { actor, calls, dispose, model } = setup();
    const result = await model.doStream({ prompt: PROMPT });
    await result.stream.cancel();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0]?.authorization).toBe("Bearer test-plan-token-only");
    expect(calls[0]?.body.stream).toBe(true);
    expect(calls[0]?.body.store).toBe(false);
    expect(calls[0]?.body.model).toBe("plan-enabled-model");
    expect(actor.refresh).toHaveBeenCalledExactlyOnceWith("openai", {
      forceRefresh: false,
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test("refuses an unauthorized configured owner before broker access", () => {
    const { connect } = setup();
    expect(() =>
      createOwnerEveSiwcModel({
        connect,
        env,
        modelId: "plan-enabled-model",
        ownerUserId: "different-user",
      })
    ).toThrow();
    expect(connect).toHaveBeenCalledTimes(0);
  });
});
