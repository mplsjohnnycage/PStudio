import { describe, expect, test } from "vitest";
import { type JobState, nextJobState } from "../../src/transitions";

const job = {
  jobId: "job-1",
  maxAttempts: 2,
  prospectId: "prospect-1",
  requiresApproval: true,
} as const;

describe("job transitions", () => {
  test("rejects malformed input and attempt limits", () => {
    const idle: JobState = {
      attempt: 0,
      jobId: null,
      maxAttempts: 0,
      phase: "idle",
      prospectId: null,
    };
    expect(() =>
      nextJobState(idle, {
        jobId: "",
        maxAttempts: 2,
        prospectId: "p",
        requiresApproval: false,
        type: "submit",
      })
    ).toThrow();
    expect(() =>
      nextJobState(idle, {
        jobId: "j",
        maxAttempts: 21,
        prospectId: "p",
        requiresApproval: false,
        type: "submit",
      })
    ).toThrow();
  });

  test("deduplication and approval gating", () => {
    const idle: JobState = {
      attempt: 0,
      jobId: null,
      maxAttempts: 0,
      phase: "idle",
      prospectId: null,
    };
    const pending = nextJobState(idle, { type: "submit", ...job });
    expect(pending.phase).toBe("awaiting_approval");
    expect(nextJobState(pending, { type: "submit", ...job })).toEqual(pending);
    expect(nextJobState(pending, { type: "start" })).toEqual(pending);
    expect(
      nextJobState(pending, {
        approved: true,
        jobId: "other",
        type: "decision",
      })
    ).toEqual(pending);
    const approved = nextJobState(pending, {
      approved: true,
      jobId: job.jobId,
      type: "decision",
    });
    expect(approved.phase).toBe("queued");
    const running = nextJobState(approved, { type: "start" });
    expect(running.phase).toBe("running");
    expect(running.attempt).toBe(1);
    expect(nextJobState(running, { type: "start" })).toEqual(running);
  });

  test("bounded retries and irreversible terminal state", () => {
    const idle: JobState = {
      attempt: 0,
      jobId: null,
      maxAttempts: 0,
      phase: "idle",
      prospectId: null,
    };
    const queued = nextJobState(idle, {
      jobId: "job",
      maxAttempts: 2,
      prospectId: "p",
      requiresApproval: false,
      type: "submit",
    });
    const first = nextJobState(queued, { type: "start" });
    const retry = nextJobState(first, {
      attempt: 1,
      jobId: "job",
      ok: false,
      type: "finish",
    });
    expect(retry.phase).toBe("retrying");
    const second = nextJobState(retry, { type: "start" });
    expect(second.attempt).toBe(2);
    const failed = nextJobState(second, {
      attempt: 2,
      jobId: "job",
      ok: false,
      type: "finish",
    });
    expect(failed.phase).toBe("failed");
    expect(nextJobState(failed, { type: "start" })).toEqual(failed);
    expect(
      nextJobState(failed, {
        jobId: "job",
        maxAttempts: 2,
        prospectId: "p",
        requiresApproval: false,
        type: "submit",
      })
    ).toEqual(failed);
  });
});

test("late completion from an old attempt cannot terminate a newer retry", () => {
  const idle: JobState = {
    attempt: 0,
    jobId: null,
    maxAttempts: 0,
    phase: "idle",
    prospectId: null,
  };
  const queued = nextJobState(idle, {
    jobId: "j",
    maxAttempts: 2,
    prospectId: "p",
    requiresApproval: false,
    type: "submit",
  });
  const first = nextJobState(queued, { type: "start" });
  const retry = nextJobState(first, {
    attempt: 1,
    jobId: "j",
    ok: false,
    type: "finish",
  });
  const second = nextJobState(retry, { type: "start" });
  expect(second.attempt).toBe(2);
  const oldFailure = {
    attempt: 1,
    jobId: "j",
    ok: false,
    type: "finish" as const,
  };
  expect(nextJobState(second, oldFailure)).toEqual(second);
  const completed = nextJobState(second, {
    attempt: 2,
    jobId: "j",
    ok: true,
    type: "finish",
  });
  expect(completed.phase).toBe("completed");
});
