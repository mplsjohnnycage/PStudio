import { describe, expect, test } from "vitest";
import { assertChatgptActorOwner } from "../../src/chatgpt-owner-guard";

const config = {
  CHATGPT_HOST_ID: "e05569d2-d7ee-4c73-940b-9b5b1e71c13d",
  PSTUDIO_CHATGPT_OWNER_USER_ID: "user-owner",
  PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED: "1",
  PSTUDIO_CHATGPT_PLAN_ENABLED: "1",
};

describe("private Rivet actor credential boundary", () => {
  test("accepts the exact configured Neon owner", () => {
    expect(() => assertChatgptActorOwner("user-owner", config)).not.toThrow();
  });
  test("rejects a second tenant before any token read or refresh", () => {
    expect(() => assertChatgptActorOwner("other", config)).toThrow();
    expect(() => assertChatgptActorOwner(undefined, config)).toThrow();
  });
  test("fails closed without host identity and opt in", () => {
    expect(() =>
      assertChatgptActorOwner("user-owner", { ...config, CHATGPT_HOST_ID: "" })
    ).toThrow();
    expect(() =>
      assertChatgptActorOwner("user-owner", {
        ...config,
        PSTUDIO_CHATGPT_PLAN_ENABLED: "0",
      })
    ).toThrow();
  });
});
