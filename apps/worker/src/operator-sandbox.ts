import { createHash } from "node:crypto";
import { AgentOs } from "@rivet-dev/agentos-core";

/** Default-off: only a trusted worker setting can enable isolated execution. */
export function operatorSandboxEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return env.PSTUDIO_AGENTOS_ENABLED === "1";
}

const MAX_SOURCE_LENGTH = 20_000;
const MAX_CAPTURE_LENGTH = 8000;
const EXECUTION_TIMEOUT_MS = 5000;

export type IsolatedCodeResult =
  | { kind: "disabled" | "invalid_input" }
  | {
      kind: "executed";
      sha256: string;
      outcome: "succeeded" | "failed" | "cancelled" | "timed_out";
      stdout: string;
      stderr: string;
      truncated: boolean;
    };

/**
 * Untrusted Javascript executes only in an ephemeral, resource-bounded agentOS
 * VM. No host directory, host functions, worker credentials or external network
 * access are given to guest code. Caller must separately verify authenticated
 * tenant membership; generated code cannot select its own user/workspace.
 * No files or results are persisted by this function.
 */
export async function runIsolatedJavascript(
  source: unknown,
  env: Readonly<Record<string, string | undefined>> = process.env
): Promise<IsolatedCodeResult> {
  if (!operatorSandboxEnabled(env)) {
    return { kind: "disabled" };
  }
  if (
    typeof source !== "string" ||
    source.trim().length === 0 ||
    source.length > MAX_SOURCE_LENGTH
  ) {
    return { kind: "invalid_input" };
  }

  const vm = await AgentOs.create({
    defaultSoftware: false,
    environment: {},
    limits: {
      jsRuntime: {
        capturedOutputLimitBytes: 32 * 1024,
        cpuTimeLimitMs: 2000,
        v8HeapLimitMb: 64,
        wallClockLimitMs: EXECUTION_TIMEOUT_MS,
      },
      resources: {
        maxFilesystemBytes: 8 * 1024 * 1024,
        maxOpenFds: 32,
        maxProcesses: 8,
      },
    },
    permissions: { env: "deny", hostFunction: "deny", network: "deny" },
  });
  try {
    const execution = await vm.javascript.execute(source, {
      output: { capture: "all" },
      timeoutMs: EXECUTION_TIMEOUT_MS,
    });
    const rawOut = execution.stdout ?? "";
    const rawErr = execution.stderr ?? "";
    return {
      kind: "executed",
      outcome: execution.outcome,
      sha256: createHash("sha256").update(source).digest("hex"),
      stderr: rawErr.slice(0, MAX_CAPTURE_LENGTH),
      stdout: rawOut.slice(0, MAX_CAPTURE_LENGTH),
      truncated:
        Boolean(execution.stdoutTruncated || execution.stderrTruncated) ||
        rawOut.length > MAX_CAPTURE_LENGTH ||
        rawErr.length > MAX_CAPTURE_LENGTH,
    };
  } finally {
    await vm.dispose();
  }
}
