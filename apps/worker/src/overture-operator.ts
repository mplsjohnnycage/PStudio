import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { VerifyIdentity } from "../../server/src/auth";

const TOKEN_WHITESPACE = /\s/;

/** Accept one scoped Neon Auth JWT only from a private owner-readable file.
 * The verified JWT subject, not a caller-provided user ID, becomes the operator.
 * This is a staging-only intake gate, not an impersonation mechanism. */
export async function resolveVerifiedDiscoveryOperator(config: {
  stagingOnly: boolean;
  tokenFile: string;
  verify: VerifyIdentity;
}): Promise<string> {
  if (!(config.stagingOnly && isAbsolute(config.tokenFile))) {
    throw new Error("Authenticated discovery is restricted to private staging");
  }
  const info = lstatSync(config.tokenFile);
  if (
    !info.isFile() ||
    // biome-ignore lint/suspicious/noBitwiseOperators: inspect actual POSIX group/other permission bits
    (info.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && info.uid !== process.getuid())
  ) {
    throw new Error(
      "Operator JWT file requires private owner-only permissions"
    );
  }
  const jwt = readFileSync(config.tokenFile, "utf8").trim();
  if (jwt.length < 8 || jwt.length > 8192 || TOKEN_WHITESPACE.test(jwt)) {
    throw new Error("Invalid operator credential format");
  }
  let userId: string | null = null;
  try {
    userId = await config.verify(`Bearer ${jwt}`);
  } catch {
    userId = null;
  }
  if (!userId) {
    throw new Error("Neon Auth JWT failed verification");
  }
  return userId;
}
