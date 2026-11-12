import { setupTest } from "rivetkit/test";
import { expect, test } from "vitest";
import {
  createRivetSubmitPublisher,
  deliverOutboxBatch,
} from "../../src/outbox-dispatcher";
import { registry } from "../../src/registry";

const job = {
  jobId: "job-1",
  maxAttempts: 2,
  prospectId: "prospect-1",
  requiresApproval: true,
} as const;

test("outbox publisher delivers to real Rivet workflow and actor remains isolated", async (testCtx) => {
  const { client } = await setupTest(testCtx, registry);
  const gate = client.jobGate.getOrCreate(["workspace-a", "job-1"]);
  const command = { type: "submit" as const, ...job };
  const publisher = createRivetSubmitPublisher(client);
  const delivered = await deliverOutboxBatch(
    {
      ack: async () => true,
      claim: async () => [
        {
          claim_token: "00000000-0000-4000-8000-000000000001",
          command,
          delivery_attempts: 1,
          id: "outbox-1",
          job_id: "job-1",
          max_deliveries: 3,
          prospect_id: "prospect-1",
          workspace_id: "workspace-a",
        },
      ],
      publish: publisher,
      reap: async () => 0,
      retry: async () => true,
    },
    1
  );
  expect(delivered.delivered).toBe(1);

  await expect
    .poll(async () => (await gate.getState()).phase, { timeout: 10_000 })
    .toBe("awaiting_approval");
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
