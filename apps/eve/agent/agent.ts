import { defineAgent } from "eve";
import { createOwnerEveSiwcModel } from "../../worker/src/eve-siwc-model";

/**
 * Private PStudio owner runtime. Not the production operator endpoint.
 * Only the configured, authorized Neon owner can resolve a Rivet grant.
 * Model transport is official public OpenAI Responses API, not an API key.
 *
 * No write-capable tools are attached here. Existing human outreach/review
 * gates remain on PStudio's authoritative API, outside this agent.
 */
function requireConfigured(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`PStudio Eve: missing ${name}; refusing to start`);
  }
  return value;
}

const ownerUserId = requireConfigured("PSTUDIO_CHATGPT_OWNER_USER_ID");
const modelId = requireConfigured("PSTUDIO_SIWC_MODEL_ID");
const modelContextWindowTokens = Number(
  requireConfigured("PSTUDIO_SIWC_CONTEXT_WINDOW_TOKENS")
);
if (
  !Number.isSafeInteger(modelContextWindowTokens) ||
  modelContextWindowTokens < 8192
) {
  throw new Error("PStudio Eve: invalid PSTUDIO_SIWC_CONTEXT_WINDOW_TOKENS");
}

export default defineAgent({
  experimental: {
    workflow: {
      world: "@workflow/world-postgres",
    },
  },
  model: createOwnerEveSiwcModel({
    modelId,
    ownerUserId,
  }),
  modelContextWindowTokens,
});
