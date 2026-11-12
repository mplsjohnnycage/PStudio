import assert from "node:assert/strict";
import test from "node:test";
import {
  operatorCommandSchema,
  operatorToolHttpRequest,
  operatorTools,
} from "../src/operator-tools.ts";

test("capabilities are unambiguous and cover both client and server", () => {
  assert.equal(operatorTools.length, 15);
  assert.equal(new Set(operatorTools.map((x) => x.name)).size, 15);
});
test("navigation and approval are not background HTTP actions", () => {
  const nav = operatorCommandSchema.parse({
    input: { view: "studio" },
    tool: "navigate",
  });
  assert.deepEqual(operatorToolHttpRequest(nav), {
    error: "client_navigation",
  });
  const approval = operatorCommandSchema.parse({
    input: { decision: "approved", previewId: "p1", workspaceId: "w1" },
    tool: "decide_review",
  });
  assert.deepEqual(operatorToolHttpRequest(approval), {
    error: "owner_confirmation_required",
  });
});
test("the bounded action API rejects arbitrary paths and extra input", () => {
  assert.equal(
    operatorCommandSchema.safeParse({
      input: { command: "pwd" },
      tool: "run_shell",
    }).success,
    false
  );
  assert.equal(
    operatorCommandSchema.safeParse({
      input: { workspaceId: "../root" },
      tool: "list_jobs",
    }).success,
    false
  );
  assert.equal(
    operatorCommandSchema.safeParse({
      input: { evil: "x", workspaceId: "w" },
      tool: "list_jobs",
    }).success,
    false
  );
});
test("enrichment maps to the existing idempotent API", () => {
  const req = operatorCommandSchema.parse({
    input: {
      idempotencyKey: "agent_12345678",
      prospectId: "prospect_test",
      workspaceId: "workspace_test",
    },
    tool: "enqueue_enrichment",
  });
  assert.deepEqual(operatorToolHttpRequest(req), {
    body: { type: "enrich" },
    headers: { "Idempotency-Key": "agent_12345678" },
    method: "POST",
    path: "/workspaces/workspace_test/prospects/prospect_test/jobs",
  });
});
