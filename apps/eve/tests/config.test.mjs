import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const LOADED_PATTERN = /AGENT_CONFIGURED/;
const MISSING_OWNER_PATTERN = /missing PSTUDIO_CHATGPT_OWNER_USER_ID/;
const MISSING_MODEL_PATTERN = /missing PSTUDIO_SIWC_MODEL_ID/;
const INVALID_CONTEXT_PATTERN = /invalid PSTUDIO_SIWC_CONTEXT_WINDOW_TOKENS/;
const OWNER = "test-owner";
const importCode = `
  const module = await import("./agent/agent.ts");
  const agent = module.default;
  if (!agent || typeof agent !== "object") throw new Error("not an Eve config");
  console.log("AGENT_CONFIGURED");
`;
const env = {
  ...process.env,
  CHATGPT_HOST_ID: "e05569d2-d7ee-4c73-940b-9b5b1e71c13d",
  DATABASE_URL: "postgres://127.0.0.1:65535/unused",
  PSTUDIO_CHATGPT_OWNER_USER_ID: OWNER,
  PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED: "1",
  PSTUDIO_CHATGPT_PLAN_ENABLED: "1",
  PSTUDIO_SIWC_CONTEXT_WINDOW_TOKENS: "128000",
  PSTUDIO_SIWC_MODEL_ID: "model-test-only",
  RIVET_ENDPOINT: "https://example.test",
  RIVET_NAMESPACE: "fake",
  RIVET_TOKEN: "sk_placeholder_not_a_real_key",
};
function loadAgent(overrides = {}) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", importCode],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...env, ...overrides },
      timeout: 15_000,
    }
  );
}

test("Eve 1.0 model config loads with owner-only Rivet adapter, no network", () => {
  const result = loadAgent();
  assert.equal(result.status, 0, result.stderr?.slice(0, 600));
  assert.match(result.stdout, LOADED_PATTERN);
});

test("missing owner or model config fails closed", () => {
  const missingOwner = loadAgent({ PSTUDIO_CHATGPT_OWNER_USER_ID: "" });
  assert.notEqual(missingOwner.status, 0);
  assert.match(missingOwner.stderr, MISSING_OWNER_PATTERN);
  const missingModel = loadAgent({ PSTUDIO_SIWC_MODEL_ID: "" });
  assert.notEqual(missingModel.status, 0);
  assert.match(missingModel.stderr, MISSING_MODEL_PATTERN);
});

test("unverified or missing context length fails before model runtime boot", () => {
  const invalid = loadAgent({
    PSTUDIO_SIWC_CONTEXT_WINDOW_TOKENS: "unsupported",
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, INVALID_CONTEXT_PATTERN);
});
