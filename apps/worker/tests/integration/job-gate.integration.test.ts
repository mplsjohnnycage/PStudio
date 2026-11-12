import { setupTest } from "rivetkit/test";
import { expect, test } from "vitest";
import { registry } from "../../src/registry";

const job = {
  jobId: "job-1",
  maxAttempts: 2,
  prospectId: "prospect-1",
  requiresApproval: true,
} as const;

test("Rivet workflow records approval, execution, and keyed isolation", async (testCtx) => {
  const { client } = await setupTest(testCtx, registry);
  const gate = client.jobGate.getOrCreate(["workspace-a", "job-1"]);
  await gate.send("commands", { type: "submit", ...job });
  await expect
    .poll(async () => (await gate.getState()).phase, { timeout: 10_000 })
    .toBe("awaiting_approval");
  await gate.send("commands", {
    approved: true,
    jobId: "job-1",
    type: "decision",
  });
  await expect
    .poll(async () => (await gate.getState()).phase, { timeout: 10_000 })
    .toBe("queued");
  await gate.send("commands", { type: "start" });
  await expect
    .poll(async () => (await gate.getState()).phase, { timeout: 10_000 })
    .toBe("running");
  await gate.send("commands", {
    attempt: 1,
    jobId: "job-1",
    ok: false,
    type: "finish",
  });
  await expect
    .poll(async () => (await gate.getState()).phase, { timeout: 10_000 })
    .toBe("retrying");
  await gate.send("commands", { type: "start" });
  await expect
    .poll(async () => (await gate.getState()).attempt, { timeout: 10_000 })
    .toBe(2);
  await gate.send("commands", {
    attempt: 1,
    jobId: "job-1",
    ok: false,
    type: "finish",
  });
  await expect
    .poll(async () => (await gate.getState()).phase, { timeout: 10_000 })
    .toBe("running");
  await gate.send("commands", {
    attempt: 2,
    jobId: "job-1",
    ok: true,
    type: "finish",
  });
  await expect
    .poll(async () => (await gate.getState()).phase, { timeout: 10_000 })
    .toBe("completed");
  const unrelated = client.jobGate.getOrCreate(["workspace-b", "job-1"]);
  expect((await unrelated.getState()).phase).toBe("idle");
}, 30_000);
