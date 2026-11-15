import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOperatorQueue,
  summarizeOperatorJobs,
} from "../src/lib/operator-queue.ts";

const jobs = [
  { attempt: 1, id: "j1", prospectId: "p1", state: "running", type: "enrich" },
  { attempt: 2, id: "j2", prospectId: "p2", state: "failed", type: "enrich" },
  { attempt: 0, id: "j3", prospectId: "p1", state: "queued", type: "enrich" },
  {
    attempt: 3,
    id: "j4",
    prospectId: "p2",
    state: "completed",
    type: "enrich",
  },
  { attempt: 2, id: "j5", prospectId: "p2", state: "retrying", type: "enrich" },
  {
    attempt: 0,
    id: "j6",
    prospectId: "p3",
    state: "awaiting_approval",
    type: "enrich",
  },
  {
    attempt: 1,
    id: "j7",
    prospectId: "p3",
    state: "cancelled",
    type: "enrich",
  },
];
const prospects = [
  { id: "p1", name: "Northwind Heating" },
  { id: "p2", name: "Stonework LLC" },
];

test("batch counters reflect persisted job states, not mock activity", () => {
  assert.deepEqual(summarizeOperatorJobs(jobs), {
    cancelled: 1,
    done: 1,
    needsYou: 2,
    queued: 2,
    running: 1,
  });
  assert.deepEqual(summarizeOperatorJobs([]), {
    cancelled: 0,
    done: 0,
    needsYou: 0,
    queued: 0,
    running: 0,
  });
});

test("operator inbox keeps actionable jobs for known prospects and prioritizes needs-you", () => {
  const items = buildOperatorQueue(prospects, jobs);
  assert.deepEqual(
    items.map((item) => item.jobId),
    ["j2", "j5", "j1", "j3", "j4"]
  );
  assert.equal(items[0].prospectName, "Stonework LLC");
  assert.equal(items[0].label, "Needs attention");
  assert.equal(items[1].label, "Retrying");
  assert.equal(items[4].label, "Completed");
  assert.equal(
    items.some((item) => item.jobId === "j6"),
    false
  );
});

test("unknown states stay unconfirmed rather than creating false activity counts", () => {
  const summary = summarizeOperatorJobs([
    {
      attempt: 1,
      id: "j",
      prospectId: "p1",
      state: "something_new",
      type: "enrich",
    },
  ]);
  assert.deepEqual(summary, {
    cancelled: 0,
    done: 0,
    needsYou: 0,
    queued: 0,
    running: 0,
  });
  assert.deepEqual(buildOperatorQueue(prospects, []), []);
});
