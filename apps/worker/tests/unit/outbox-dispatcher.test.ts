import { describe, expect, test, vi } from "vitest";
import {
  createRivetSubmitPublisher,
  deliverOutboxBatch,
} from "../../src/outbox-dispatcher";

const token = "00000000-0000-4000-8000-000000000001";
const command = {
  jobId: "job-a",
  maxAttempts: 3,
  prospectId: "prospect-a",
  requiresApproval: true,
  type: "submit" as const,
};
const claimed = {
  claim_token: token,
  command,
  delivery_attempts: 1,
  id: "event-a",
  job_id: "job-a",
  max_deliveries: 3,
  prospect_id: "prospect-a",
  workspace_id: "workspace-a",
};

const fixtures = () => ({
  ack: vi.fn(async (_id: string, _token: string) => true),
  claim: vi.fn(async (_batchSize: number) => [claimed]),
  publish: vi.fn(
    async (_workspace: string, _command: typeof command) => undefined
  ),
  reap: vi.fn(async () => 0),
  retry: vi.fn(async (_id: string, _token: string, _delay: number) => true),
});

describe("fenced Neon → Rivet delivery", () => {
  test("publishes to the canonical workspace, then acks matching lease", async () => {
    const io = fixtures();
    const result = await deliverOutboxBatch(io, 5);
    expect(result).toEqual({
      claimed: 1,
      delivered: 1,
      invalid: 0,
      lostLease: 0,
      reaped: 0,
      retried: 0,
    });
    expect(io.reap).toHaveBeenCalledTimes(1);
    expect(io.claim).toHaveBeenCalledWith(5);
    expect(io.publish).toHaveBeenCalledWith("workspace-a", command);
    expect(io.ack).toHaveBeenCalledWith("event-a", token);
    expect(io.retry).not.toHaveBeenCalled();
  });

  test("failed publication retries with bounded backoff; never acks", async () => {
    const io = fixtures();
    io.publish.mockRejectedValueOnce(
      new Error("private control plane not ready")
    );
    const result = await deliverOutboxBatch(io);
    expect(result.retried).toBe(1);
    expect(result.delivered).toBe(0);
    expect(io.retry).toHaveBeenCalledWith("event-a", token, 2);
    expect(io.ack).not.toHaveBeenCalled();
  });

  test("stale lease after publish does not attempt an unsafe retry", async () => {
    const io = fixtures();
    io.ack.mockResolvedValueOnce(false);
    const result = await deliverOutboxBatch(io);
    expect(result.lostLease).toBe(1);
    expect(io.retry).not.toHaveBeenCalled();
  });

  test("invalid or cross-prospect command never reaches Rivet", async () => {
    const io = fixtures();
    io.claim.mockResolvedValueOnce([
      { ...claimed, command: { ...command, prospectId: "other" } },
    ]);
    const result = await deliverOutboxBatch(io);
    expect(result.invalid).toBe(1);
    expect(io.publish).not.toHaveBeenCalled();
    expect(io.retry).toHaveBeenCalledWith("event-a", token, 2);
  });

  test("publisher derives actor key from canonical DB workspace and validated command", async () => {
    const send = vi.fn(async () => undefined);
    const getOrCreate = vi.fn(() => ({ send }));
    const publisher = createRivetSubmitPublisher({ jobGate: { getOrCreate } });
    await publisher("workspace-a", command);
    expect(getOrCreate).toHaveBeenCalledWith(["workspace-a", "job-a"]);
    expect(send).toHaveBeenCalledWith("commands", command);
  });
});
