/** Read-only check of an existing, completed remote Rivet staging actor.
 * The caller must supply a known job/workspace ID from verified staging Neon.
 * No submission or mutation is performed. Never print tokens. */
import { readFileSync } from "node:fs";
import { createClient } from "rivetkit/client";

const REQUIRED_ENDPOINT = "https://pstudio9jo8-api.onrivet.dev";
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const vars = process.env;
if (
  vars.PSTUDIO_VERIFY_STAGING_RIVET !== "1" ||
  vars.RIVET_ENDPOINT !== REQUIRED_ENDPOINT ||
  vars.RIVET_NAMESPACE !== "default" ||
  !vars.PSTUDIO_REMOTE_RIVET_TOKEN_FILE ||
  !vars.PSTUDIO_EXISTING_WORKSPACE_ID ||
  !vars.PSTUDIO_EXISTING_JOB_ID ||
  !idPattern.test(vars.PSTUDIO_EXISTING_WORKSPACE_ID) ||
  !idPattern.test(vars.PSTUDIO_EXISTING_JOB_ID)
) {
  throw new Error("Explicit staging readback configuration is required");
}
const token = readFileSync(vars.PSTUDIO_REMOTE_RIVET_TOKEN_FILE, "utf8").trim();
if (!token.startsWith("admin_")) {
  throw new Error("Private staging control-plane credentials unavailable");
}
const client = createClient({
  endpoint: REQUIRED_ENDPOINT,
  namespace: "default",
  token,
});
try {
  const state = await client.jobGate
    .getOrCreate([
      vars.PSTUDIO_EXISTING_WORKSPACE_ID,
      vars.PSTUDIO_EXISTING_JOB_ID,
    ])
    .getState();
  const valid =
    state.phase === "completed" &&
    state.attempt === 1 &&
    state.jobId === vars.PSTUDIO_EXISTING_JOB_ID;
  console.log(
    "PSTUDIO_STAGING_RIVET_READBACK " +
      JSON.stringify({
        attempt: state.attempt,
        jobIdMatches: state.jobId === vars.PSTUDIO_EXISTING_JOB_ID,
        phase: state.phase,
        valid,
      })
  );
  if (!valid) {
    process.exitCode = 1;
  }
} finally {
  await client.dispose();
}
