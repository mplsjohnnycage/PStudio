import assert from "node:assert/strict";
import { test } from "node:test";
import { settleWorkspaceRefresh } from "../src/lib/workspace-refresh.ts";

const ACTIVE_WORKSPACE_ERROR = /workspace B unavailable/;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

test("an obsolete workspace failure cannot surface after selection changes", async () => {
  let selected = "workspace-a";
  let epoch = 1;
  const old = deferred();
  const oldResult = settleWorkspaceRefresh(
    old.promise,
    () => selected === "workspace-a" && epoch === 1
  );
  selected = "workspace-b";
  epoch += 1;
  const newResult = settleWorkspaceRefresh(
    Promise.resolve({ jobs: [], prospects: ["B"] }),
    () => selected === "workspace-b" && epoch === 2
  );
  assert.deepEqual(await newResult, { jobs: [], prospects: ["B"] });
  old.reject(new Error("workspace A failed"));
  assert.equal(await oldResult, undefined);
});

test("the current workspace failure is still reported", async () => {
  const current = deferred();
  const result = settleWorkspaceRefresh(current.promise, () => true);
  current.reject(new Error("workspace B unavailable"));
  await assert.rejects(result, ACTIVE_WORKSPACE_ERROR);
});

test("obsolete successful responses do not replace active data", async () => {
  const request = deferred();
  let active = true;
  const result = settleWorkspaceRefresh(request.promise, () => active);
  active = false;
  request.resolve({ prospects: ["old"] });
  assert.equal(await result, undefined);
});
