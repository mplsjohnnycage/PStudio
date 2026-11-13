import assert from "node:assert/strict";
import { test } from "node:test";
import { createEvidenceRoutes } from "../src/evidence-api.ts";

function fixture() {
  const calls = [];
  const app = createEvidenceRoutes({
    read: (user, ws, prospect) => {
      calls.push([user, ws, prospect]);
      if (ws !== "workspace_allow") {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        claims: [
          {
            field: "name",
            id: "claim_1",
            kind: "reported",
            observedAt: new Date("2026-01-01T00:00:00Z"),
            value: "Source Name",
          },
        ],
        evidence: [
          {
            capturedAt: new Date("2026-01-01T00:00:00Z"),
            id: "evidence_1",
            sha256: "a".repeat(64),
            sourceUri: "https://source.example/record",
            title: "Official source",
            type: "external_source",
          },
        ],
      });
    },
    verify: (header) =>
      Promise.resolve(header === "Bearer valid" ? "actual-auth-subject" : null),
  });
  return { app, calls };
}

test("evidence route denies anonymous and invalid tokens before database access", async () => {
  const { app, calls } = fixture();
  const path = "/workspaces/workspace_allow/prospects/prospect_1/evidence";
  assert.equal((await app.request(path)).status, 401);
  assert.equal(
    (await app.request(path, { headers: { Authorization: "Bearer forged" } }))
      .status,
    401
  );
  assert.deepEqual(calls, []);
});

test("evidence route validates ids and cannot reveal another workspace", async () => {
  const { app, calls } = fixture();
  const headers = { Authorization: "Bearer valid" };
  assert.equal(
    (
      await app.request("/workspaces/invalid!/prospects/prospect_1/evidence", {
        headers,
      })
    ).status,
    400
  );
  assert.equal(
    (
      await app.request(
        "/workspaces/workspace_other/prospects/prospect_1/evidence",
        { headers }
      )
    ).status,
    404
  );
  assert.deepEqual(calls, [
    ["actual-auth-subject", "workspace_other", "prospect_1"],
  ]);
});

test("authenticated workspace source and claims remain read-only and labeled reported", async () => {
  const { app } = fixture();
  const response = await app.request(
    "/workspaces/workspace_allow/prospects/prospect_1/evidence",
    {
      headers: { Authorization: "Bearer valid" },
    }
  );
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.evidence[0].type, "external_source");
  assert.equal(value.claims[0].kind, "reported");
  assert.equal(value.evidence[0].sourceUri, "https://source.example/record");
});
