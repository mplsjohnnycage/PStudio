import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveVerifiedDiscoveryOperator } from "../../src/overture-operator";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
function tokenFile(mode = 0o600) {
  const dir = mkdtempSync(join(tmpdir(), "pstudio-test-operator-"));
  dirs.push(dir);
  const file = join(dir, "neon-jwt.txt");
  writeFileSync(file, "signed-test-jwt-value\n", { mode: 0o600 });
  chmodSync(file, mode);
  return file;
}

describe("private Overture manual operator identity", () => {
  test("resolves user ID solely from a JWT verifier, never an operator env ID", async () => {
    const verify = vi.fn(async (authorization: string | undefined) =>
      authorization === "Bearer signed-test-jwt-value"
        ? "verified_user_1"
        : null
    );
    const result = await resolveVerifiedDiscoveryOperator({
      stagingOnly: true,
      tokenFile: tokenFile(),
      verify,
    });
    expect(result).toBe("verified_user_1");
    expect(verify).toHaveBeenCalledOnce();
  });

  test("rejects non-staging execution before reading a token", async () => {
    const verify = vi.fn(async () => "verified_user_1");
    await expect(
      resolveVerifiedDiscoveryOperator({
        stagingOnly: false,
        tokenFile: tokenFile(),
        verify,
      })
    ).rejects.toThrow();
    expect(verify).not.toHaveBeenCalled();
  });

  test("rejects group-readable JWT files", async () => {
    const verify = vi.fn(async () => "verified_user_1");
    await expect(
      resolveVerifiedDiscoveryOperator({
        stagingOnly: true,
        tokenFile: tokenFile(0o640),
        verify,
      })
    ).rejects.toThrow();
    expect(verify).not.toHaveBeenCalled();
  });

  test("rejects invalid, expired or otherwise unverified JWTs", async () => {
    const verify = vi.fn(async () => null);
    await expect(
      resolveVerifiedDiscoveryOperator({
        stagingOnly: true,
        tokenFile: tokenFile(),
        verify,
      })
    ).rejects.toThrow();
  });
});
