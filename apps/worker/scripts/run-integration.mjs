/**
 * Rivet v3 uses an engine-level storage lease that cannot be safely scoped on
 * overlayfs, the default home filesystem in Sprite.  Use a fresh local native
 * filesystem directory per integration test run instead of ~/.rivetkit.
 *
 * This is for NON-PRODUCTION test storage only. It does not configure the
 * remote private worker or any production data, which must use durable storage.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statfsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OVERLAYFS_MAGIC = 0x79_4c_76_30;
const requested = process.env.PSTUDIO_RIVET_TEST_STORAGE_ROOT ?? tmpdir();
const roots = [requested];
if (process.platform === "linux" && requested === tmpdir()) {
  roots.push("/dev/shm");
}
let root = null;
for (const candidate of roots) {
  try {
    const { type } = statfsSync(candidate);
    if (Number(type) !== OVERLAYFS_MAGIC) {
      root = candidate;
      break;
    }
  } catch {
    // Try the next available filesystem.
  }
}
if (!root) {
  throw new Error(
    "Rivet test storage requires a local filesystem with scoped locks. " +
      "Set PSTUDIO_RIVET_TEST_STORAGE_ROOT to a native ext4/tmpfs volume."
  );
}
const temporaryHome = mkdtempSync(join(root, "pstudio-rivet-test-"));
try {
  const vitest = fileURLToPath(
    new URL("../node_modules/vitest/vitest.mjs", import.meta.url)
  );
  const child = spawnSync(
    process.execPath,
    [
      vitest,
      "run",
      "tests/integration",
      "--no-file-parallelism",
      "--maxWorkers=1",
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        ...process.env,
        HOME: temporaryHome,
        RIVET_LOG_LEVEL: process.env.RIVET_LOG_LEVEL ?? "warn",
        RIVET_RUN_ENGINE: "1",
        USERPROFILE: temporaryHome,
      },
      stdio: "inherit",
      timeout: 90_000,
    }
  );
  if (child.error) {
    throw child.error;
  }
  process.exitCode = child.status ?? 1;
} finally {
  try {
    rmSync(temporaryHome, { force: true, recursive: true });
  } catch {
    console.warn(
      "Temporary Rivet test data could not be cleaned up; check",
      temporaryHome
    );
  }
}
