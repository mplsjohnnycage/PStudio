import { describe, expect, it } from "vitest";
import { operatorSandboxEnabled } from "../../src/operator-sandbox";

const SHA_256_REGEX = /^[a-f0-9]{64}$/;

describe("operator agentOS execution policy", () => {
  it("denies isolated code execution by default", () => {
    expect(operatorSandboxEnabled({})).toBe(false);
  });

  it("requires an exact server-side enable flag", () => {
    expect(operatorSandboxEnabled({ PSTUDIO_AGENTOS_ENABLED: "true" })).toBe(
      false
    );
    expect(operatorSandboxEnabled({ PSTUDIO_AGENTOS_ENABLED: "0" })).toBe(
      false
    );
    expect(operatorSandboxEnabled({ PSTUDIO_AGENTOS_ENABLED: "1" })).toBe(true);
  });
});

import { runIsolatedJavascript } from "../../src/operator-sandbox";

describe("real embedded agentOS execution", () => {
  const enabled = { PSTUDIO_AGENTOS_ENABLED: "1" };

  it("refuses to execute code without explicit worker configuration", async () => {
    expect(await runIsolatedJavascript('console.log("no")', {})).toEqual({
      kind: "disabled",
    });
  });

  it("rejects invalid and oversized scripts", async () => {
    expect(await runIsolatedJavascript("  ", enabled)).toEqual({
      kind: "invalid_input",
    });
    expect(await runIsolatedJavascript("x".repeat(20_001), enabled)).toEqual({
      kind: "invalid_input",
    });
  });

  it("runs real code, returns a source digest and captures output", async () => {
    const response = await runIsolatedJavascript(
      'console.log("isolated-prospect-studio")',
      enabled
    );
    expect(response.kind).toBe("executed");
    if (response.kind !== "executed") {
      throw new Error("expected execution");
    }
    expect(response.outcome).toBe("succeeded");
    expect(response.stdout).toContain("isolated-prospect-studio");
    expect(response.sha256).toMatch(SHA_256_REGEX);
  });

  it("denies outbound network fetches from guest code", async () => {
    const response = await runIsolatedJavascript(
      'await fetch("https://example.com")',
      enabled
    );
    expect(response.kind).toBe("executed");
    if (response.kind !== "executed") {
      throw new Error("expected execution");
    }
    expect(response.outcome).not.toBe("succeeded");
  });

  it("caps the output returned to the agent", async () => {
    const response = await runIsolatedJavascript(
      'console.log("p".repeat(12000))',
      enabled
    );
    expect(response.kind).toBe("executed");
    if (response.kind !== "executed") {
      throw new Error("expected execution");
    }
    expect(response.stdout.length).toBeLessThanOrEqual(8000);
    expect(response.truncated).toBe(true);
  });
});
