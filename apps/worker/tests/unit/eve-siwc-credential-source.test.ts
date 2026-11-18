import { describe, expect, test, vi } from "vitest";
import { createRivetSiwcCredentialSource } from "../../src/eve-siwc-credential-source";

const OWNER = "user-owner";
const PRINCIPAL_MISMATCH = /principal mismatch/;
const OWNER_DISABLED = /owner access not enabled/;
const BROKER_UNCONFIGURED = /not configured/;
const BROKER_FAILURE = /transient broker failure/;
const grant = {
  access: "siwc-access-token-only",
  expires: Date.now() + 3_600_000,
  scopes: ["openid", "resource.invoke", "chatgpt.tokens.use.direct"],
  type: "oauth",
};
const environment = {
  CHATGPT_HOST_ID: "e05569d2-d7ee-4c73-940b-9b5b1e71c13d",
  DATABASE_URL: "postgres://localhost/test",
  PSTUDIO_CHATGPT_OWNER_USER_ID: OWNER,
  PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED: "1",
  PSTUDIO_CHATGPT_PLAN_ENABLED: "1",
  RIVET_ENDPOINT: "https://rivet.example.test",
  RIVET_NAMESPACE: "pstudio-private",
  RIVET_TOKEN: "sk_test_private_server_only",
};

function setup(out = grant, overrides = environment) {
  const actor = { refresh: vi.fn().mockResolvedValue(out) };
  const getOrCreate = vi.fn().mockReturnValue(actor);
  const dispose = vi.fn().mockResolvedValue(undefined);
  const connect = vi.fn().mockResolvedValue({
    credentials: { getOrCreate },
    dispose,
  });
  const source = createRivetSiwcCredentialSource({
    connect,
    env: overrides,
    ownerUserId: OWNER,
  });
  return { actor, connect, dispose, getOrCreate, source };
}

describe("Eve SIWC Rivet credential bridge", () => {
  test("only accesses exact owner Actor and closes connection after every lookup", async () => {
    const { source, actor, connect, getOrCreate, dispose } = setup();
    const credential = await source.getCredential({
      forceRefresh: false,
      ownerUserId: OWNER,
    });
    expect(getOrCreate).toHaveBeenCalledExactlyOnceWith([OWNER]);
    expect(actor.refresh).toHaveBeenCalledExactlyOnceWith("openai", {
      forceRefresh: false,
    });
    expect(credential.ownerUserId).toBe(OWNER);
    expect(credential.accessToken).toBe(grant.access);
    expect(credential.scopes).toContain("chatgpt.tokens.use.direct");
    expect(credential.expiresAt).toBe(grant.expires);
    expect(JSON.stringify(credential)).not.toContain("refreshToken");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test("forwards a forced refresh request to private Actor without leaking rejected token", async () => {
    const { source, actor } = setup();
    await source.getCredential({
      forceRefresh: true,
      ownerUserId: OWNER,
      rejectedAccessToken: "expired-access-token-in-previous-request",
    });
    expect(actor.refresh).toHaveBeenCalledExactlyOnceWith("openai", {
      forceRefresh: true,
    });
    expect(JSON.stringify(actor.refresh.mock.calls)).not.toContain(
      "expired-access-token-in-previous-request"
    );
  });

  test("denies a second principal before connecting", async () => {
    const { source, connect } = setup();
    await expect(
      source.getCredential({ forceRefresh: false, ownerUserId: "other-user" })
    ).rejects.toThrow(PRINCIPAL_MISMATCH);
    expect(connect).not.toHaveBeenCalled();
  });

  test("disallows a different configured owner", () => {
    expect(() =>
      createRivetSiwcCredentialSource({
        connect: vi.fn(),
        env: environment,
        ownerUserId: "other-user",
      })
    ).toThrow(OWNER_DISABLED);
  });

  test("fails closed when private Rivet credentials are absent", () => {
    const invalid = { ...environment, RIVET_TOKEN: "" };
    expect(() =>
      createRivetSiwcCredentialSource({
        env: invalid,
        ownerUserId: OWNER,
      })
    ).toThrow(BROKER_UNCONFIGURED);
  });

  test("fails closed for identity-only grants", async () => {
    const { source, dispose } = setup({ ...grant, scopes: ["openid"] });
    const credential = await source.getCredential({
      forceRefresh: false,
      ownerUserId: OWNER,
    });
    // The model adapter enforces chatgpt.tokens.use.direct as an independent boundary.
    expect(credential.scopes).not.toContain("chatgpt.tokens.use.direct");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test("rejects non-OAuth credentials, missing scopes, or missing expiry", async () => {
    await Promise.all(
      [
        { ...grant, type: "api_key" },
        { ...grant, scopes: undefined },
        { ...grant, expires: undefined },
        { ...grant, expires: Date.now() - 100 },
      ].map(async (bad) => {
        const { source, dispose } = setup(bad as typeof grant);
        await expect(
          source.getCredential({ forceRefresh: false, ownerUserId: OWNER })
        ).rejects.toThrow();
        expect(dispose).toHaveBeenCalledTimes(1);
      })
    );
  });

  test("still closes Rivet connection when refresh fails", async () => {
    const { source, actor, dispose } = setup();
    actor.refresh.mockRejectedValue(new Error("transient broker failure"));
    await expect(
      source.getCredential({ forceRefresh: false, ownerUserId: OWNER })
    ).rejects.toThrow(BROKER_FAILURE);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
