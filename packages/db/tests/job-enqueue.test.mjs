import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveEnqueueIds, enqueueWorkspaceJob } from "../src/job-enqueue.ts";
import { jobs, prospects } from "../src/schema/index.ts";

function transactionalDatabase(role = "operator", initial = {}) {
  let state = {
    events: structuredClone(initial.events ?? []),
    jobs: structuredClone(initial.jobs ?? []),
  };
  return {
    get state() {
      return state;
    },
    transaction: async (work) => {
      const pending = structuredClone(state);
      const tx = {
        insert(table) {
          return {
            values(value) {
              return {
                onConflictDoNothing() {
                  const rows = table === jobs ? pending.jobs : pending.events;
                  if (!rows.some((row) => row.id === value.id)) {
                    rows.push(value);
                  }
                  return Promise.resolve();
                },
              };
            },
          };
        },
        select() {
          return {
            from(table) {
              if (table === prospects) {
                return {
                  innerJoin() {
                    return {
                      where() {
                        return {
                          limit() {
                            return {
                              for() {
                                return Promise.resolve(role ? [{ role }] : []);
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              }
              return {
                where() {
                  return {
                    limit() {
                      return Promise.resolve(
                        table === jobs ? pending.jobs : pending.events
                      );
                    },
                  };
                },
              };
            },
          };
        },
      };
      const result = await work(tx);
      state = pending;
      return result;
    },
  };
}

test("idempotent replay creates exactly one job and one event", async () => {
  const db = transactionalDatabase();
  const first = await enqueueWorkspaceJob(
    db,
    "user-1",
    "ws-1",
    "p-1",
    "request-123"
  );
  const repeat = await enqueueWorkspaceJob(
    db,
    "user-1",
    "ws-1",
    "p-1",
    "request-123"
  );
  assert.deepEqual(repeat, first);
  assert.equal(first.kind, "created");
  assert.equal(db.state.jobs.length, 1);
  assert.equal(db.state.events.length, 1);
});

test("tenant membership and operator role gate all writes", async () => {
  await Promise.all(
    [null, "viewer"].map(async (role) => {
      const db = transactionalDatabase(role);
      assert.deepEqual(
        await enqueueWorkspaceJob(db, "user-1", "ws-1", "p-1", "request-123"),
        { kind: "not_found" }
      );
      assert.equal(db.state.jobs.length, 0);
      assert.equal(db.state.events.length, 0);
    })
  );
});

test("conflicting job id rolls back and leaves outbox untouched", async () => {
  const ids = deriveEnqueueIds("user-1", "ws-1", "request-123");
  const db = transactionalDatabase("operator", {
    jobs: [
      {
        id: ids.jobId,
        maxAttempts: 3,
        prospectId: "other-prospect",
        type: "enrich",
      },
    ],
  });
  assert.deepEqual(
    await enqueueWorkspaceJob(db, "user-1", "ws-1", "p-1", "request-123"),
    { kind: "conflict" }
  );
  assert.equal(db.state.events.length, 0);
});

test("conflicting outbox event rolls back newly inserted job", async () => {
  const ids = deriveEnqueueIds("user-1", "ws-1", "request-123");
  const db = transactionalDatabase("operator", {
    events: [
      {
        command: { type: "different-command" },
        id: ids.eventId,
        idempotencyKey: "request-123",
        jobId: ids.jobId,
      },
    ],
  });
  assert.deepEqual(
    await enqueueWorkspaceJob(db, "user-1", "ws-1", "p-1", "request-123"),
    { kind: "conflict" }
  );
  assert.equal(
    db.state.jobs.length,
    0,
    "new job must roll back on outbox conflict"
  );
  assert.equal(db.state.events.length, 1);
});

test("new idempotency keys derive independent job and event ids", () => {
  assert.notDeepEqual(
    deriveEnqueueIds("user-1", "ws-1", "request-123"),
    deriveEnqueueIds("user-1", "ws-1", "request-456")
  );
  assert.notDeepEqual(
    deriveEnqueueIds("user-1", "ws-1", "request-123"),
    deriveEnqueueIds("user-1", "ws-2", "request-123")
  );
});
