import { beforeEach, describe, expect, test, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  admission: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("@prospect-studio/db/admission-queries", () => ({
  admitSourcedProspect: mocked.admission,
}));
vi.mock("@prospect-studio/db/job-enqueue", () => ({
  enqueueWorkspaceJob: mocked.enqueue,
}));

import { admitPlaces } from "../../src/overture-batch";

const sample = {
  category: "plumber",
  name: "Public source test candidate",
  provenance: {
    release: "2026-10-21.0",
    source_record_sha256: "a".repeat(64),
  },
  source_id: "a3a3a3a3-2222-4444-8888-abcdefabcdef",
  source_observation: {
    name: "Public source test candidate",
    source_id: "a3a3a3a3-2222-4444-8888-abcdefabcdef",
  },
  website_verification: "unknown",
} as const;

const RELEASE_SCOPED_KEY = /^overture_.*2026_10_21_0$/;

const config = {
  db: {} as Parameters<typeof admitPlaces>[0]["db"],
  userId: "operator_fixture",
  workspaceId: "workspace_fixture",
};

describe("bounded Overture admission batch", () => {
  beforeEach(() => {
    mocked.admission.mockReset();
    mocked.enqueue.mockReset();
  });

  test("skips duplicate identities instead of reporting or enqueueing stale source evidence", async () => {
    mocked.admission.mockResolvedValue({
      kind: "duplicate",
      prospectId: "existing",
    });
    const result = await admitPlaces(config, [sample]);
    expect(result).toEqual({
      created: 0,
      discovered: 1,
      duplicate: 1,
      queued: 0,
    });
    expect(mocked.enqueue).not.toHaveBeenCalled();
  });

  test("enqueues one new admission with release-scoped idempotency", async () => {
    mocked.admission.mockResolvedValue({ kind: "created", prospectId: "new" });
    mocked.enqueue.mockResolvedValue({ jobId: "job_1", kind: "created" });
    const result = await admitPlaces(config, [sample]);
    expect(result).toEqual({
      created: 1,
      discovered: 1,
      duplicate: 0,
      queued: 1,
    });
    expect(mocked.enqueue).toHaveBeenCalledOnce();
    expect(mocked.enqueue.mock.calls[0]?.[4]).toMatch(RELEASE_SCOPED_KEY);
  });
});
