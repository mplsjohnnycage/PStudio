/**
 * Explicit opt-in: source-linked Neon STAGING E2E using a local RivetKit engine.
 * Uses the native Node binary and temporary native filesystem for Rivet locks.
 * Never runs against production and never sends outreach or approves reviews.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statfsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const overture = process.env.PSTUDIO_STAGING_OVERTURE_RIVET_E2E === "1";
const legacy = process.env.PSTUDIO_STAGING_NEON_RIVET_E2E === "1";
if (overture === legacy) {
  throw new Error("Select exactly one explicit staging integration test mode");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing staging-only integration test in production mode");
}
const credentials = process.env.PSTUDIO_NEON_STAGING_WORKER_ENV_PATH;
if (!(credentials && existsSync(credentials))) {
  throw new Error(
    "Staging-only worker credentials must exist outside the repository"
  );
}
const overlayMagic = 0x79_4c_76_30;
const root = [tmpdir(), "/dev/shm"].find((path) => {
  try {
    return Number(statfsSync(path).type) !== overlayMagic;
  } catch {
    return false;
  }
});
if (!root) {
  throw new Error("Rivet integration requires native scoped-lock storage");
}
const home = mkdtempSync(join(root, "pstudio-neon-staging-rivet-"));
try {
  const runner = fileURLToPath(
    new URL("../node_modules/vitest/vitest.mjs", import.meta.url)
  );
  const test = spawnSync(
    process.execPath,
    [
      runner,
      "run",
      overture
        ? "tests/integration/staging-overture-neon-rivet.e2e.test.ts"
        : "tests/integration/staging-neon-rivet.e2e.test.ts",
      "--no-file-parallelism",
      "--maxWorkers=1",
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        HOME: home,
        RIVET_LOG_LEVEL: process.env.RIVET_LOG_LEVEL ?? "warn",
        RIVET_RUN_ENGINE: "1",
        USERPROFILE: home,
      },
      stdio: "inherit",
      timeout: 120_000,
    }
  );
  if (test.error) {
    throw test.error;
  }
  process.exitCode = test.status ?? 1;
} finally {
  rmSync(home, { force: true, recursive: true });
}
