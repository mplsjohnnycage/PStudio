import type { NeonFunctionConfiguration } from "../../server/src/neon-api";

/** Assemble only the server-runtime configuration for the Vercel Hono entrypoint. */
export function buildVercelNeonConfiguration(
  env: NodeJS.ProcessEnv
): NeonFunctionConfiguration {
  return {
    agentMailApiKey: env.AGENTMAIL_API_KEY,
    agentMailInboxId: env.PSTUDIO_AGENTMAIL_INBOX_ID,
    agentMailWorkspaceId: env.PSTUDIO_AGENTMAIL_WORKSPACE_ID,
    authBaseUrl: env.NEON_AUTH_BASE_URL,
    corsOrigins: (env.CORS_ORIGIN ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    databaseUrl: env.DATABASE_URL,
    inviteOnly: env.PSTUDIO_STAGING_INVITE_ONLY === "1",
    jwksUrl: env.NEON_AUTH_JWKS_URL,
    mcpResource: env.MCP_RESOURCE,
    publicStagingUi: false,
  };
}
