import assert from "node:assert/strict";
import { test } from "node:test";
import { createLatestRequestGate } from "../src/lib/latest-request-gate.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

test("a slow agenda response cannot replace a newer successful refresh", async () => {
  const gate = createLatestRequestGate();
  const old = deferred();
  const next = deferred();
  const state = { events: [], loading: true };
  async function refresh(response) {
    const isCurrent = gate.begin();
    try {
      const events = await response;
      if (isCurrent()) {
        state.events = events;
      }
    } finally {
      if (isCurrent()) {
        state.loading = false;
      }
    }
  }
  const previous = refresh(old.promise);
  const current = refresh(next.promise);
  next.resolve(["new agenda"]);
  await current;
  old.resolve(["stale agenda"]);
  await previous;
  assert.deepEqual(state, { events: ["new agenda"], loading: false });
});

test("a stale error and finally cannot disturb an active refresh", async () => {
  const gate = createLatestRequestGate();
  const old = deferred();
  const next = deferred();
  const state = { error: "", loading: true };
  async function refresh(response) {
    const isCurrent = gate.begin();
    try {
      await response;
    } catch (error) {
      if (isCurrent()) {
        state.error = error.message;
      }
    } finally {
      if (isCurrent()) {
        state.loading = false;
      }
    }
  }
  const previous = refresh(old.promise);
  const current = refresh(next.promise);
  old.reject(new Error("old error"));
  await previous;
  assert.deepEqual(state, { error: "", loading: true });
  next.resolve([]);
  await current;
  assert.deepEqual(state, { error: "", loading: false });
});

test("workspace cleanup invalidates pending responses without affecting a fresh scope", () => {
  const oldWorkspace = createLatestRequestGate();
  const pending = oldWorkspace.begin();
  oldWorkspace.invalidate();
  const newWorkspace = createLatestRequestGate();
  const current = newWorkspace.begin();
  assert.equal(pending(), false);
  assert.equal(current(), true);
  assert.equal(oldWorkspace.begin()(), true);
});
