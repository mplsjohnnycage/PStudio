import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVercelNeonConfiguration } from "../src/runtime-config.ts";

test("Vercel Hono runtime injects AgentMail's server-only secret, inbox and workspace identity", () => {
  const config = buildVercelNeonConfiguration({
    AGENTMAIL_API_KEY: "test-only-secret",
    CORS_ORIGIN: "https://staging.example.test",
    DATABASE_URL: "postgresql://placeholder/test",
    NEON_AUTH_BASE_URL: "https://auth.example.test",
    NEON_AUTH_JWKS_URL: "https://auth.example.test/jwks",
    PSTUDIO_AGENTMAIL_INBOX_ID: "pstudio@agentmail.to",
    PSTUDIO_AGENTMAIL_WORKSPACE_ID: "workspace_owner",
    PSTUDIO_STAGING_INVITE_ONLY: "1",
  });
  assert.equal(config.agentMailApiKey, "test-only-secret");
  assert.equal(config.agentMailInboxId, "pstudio@agentmail.to");
  assert.equal(config.agentMailWorkspaceId, "workspace_owner");
  assert.deepEqual(config.corsOrigins, ["https://staging.example.test"]);
  assert.equal(config.inviteOnly, true);
  assert.equal(config.databaseUrl, "postgresql://placeholder/test");
});

test("missing AgentMail environment does not select another inbox or workspace", () => {
  const config = buildVercelNeonConfiguration({
    DATABASE_URL: "postgresql://placeholder/test",
    NEON_AUTH_BASE_URL: "https://auth.example.test",
    NEON_AUTH_JWKS_URL: "https://auth.example.test/jwks",
  });
  assert.equal(config.agentMailApiKey, undefined);
  assert.equal(config.agentMailInboxId, undefined);
  assert.equal(config.agentMailWorkspaceId, undefined);
  assert.deepEqual(config.corsOrigins, []);
  assert.equal(config.inviteOnly, false);
});
