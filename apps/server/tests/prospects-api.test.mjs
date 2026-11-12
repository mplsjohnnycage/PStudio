import assert from "node:assert/strict";
import { test } from "node:test";
import { createProspectsRoutes } from "../src/prospects-api.ts";

const url = "http://localhost/workspaces/work-1/prospects";
const auth = {
  Authorization: "Bearer valid",
  "Content-Type": "application/json",
};

test("prospects deny unauthenticated writes and reads before hitting storage", async () => {
  let reads = 0;
  let writes = 0;
  const app = createProspectsRoutes({
    create: () => {
      writes += 1;
      return { id: "p-1", kind: "created" };
    },
    list: () => {
      reads += 1;
      return [];
    },
    verify: () => null,
  });
  assert.equal((await app.request(url)).status, 401);
  assert.equal(
    (await app.request(url, { body: "{}", headers: auth, method: "POST" }))
      .status,
    401
  );
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test("prospect input rejects client role escalation, malformed source, and invalid website", async () => {
  let calls = 0;
  const app = createProspectsRoutes({
    create: () => {
      calls += 1;
      return { id: "p-1", kind: "created" };
    },
    list: () => [],
    verify: () => "member-1",
  });
  const submit = async (body) =>
    app.request(url, {
      body: JSON.stringify(body),
      headers: auth,
      method: "POST",
    });
  assert.equal((await submit({ name: "  " })).status, 400);
  assert.equal((await submit({ name: "Test", role: "owner" })).status, 400);
  assert.equal(
    (await submit({ name: "Test", websiteUrl: "file:///etc/passwd" })).status,
    400
  );
  assert.equal(
    (await submit({ name: "Test", sourceUri: "javascript:alert(1)" })).status,
    400
  );
  assert.equal(calls, 0);
});

test("authorized create is source-attributed, server-identified, and works without a website", async () => {
  const writes = [];
  const app = createProspectsRoutes({
    create: (userId, workspaceId, value) => {
      writes.push({ userId, value, workspaceId });
      return { id: "prospect-123", kind: "created" };
    },
    list: () => [],
    verify: () => "verified-user",
  });
  const r = await app.request(url, {
    body: JSON.stringify({ name: "Sample Shop", physicalAddress: "Minnesota" }),
    headers: { ...auth, "x-user-id": "forged-owner" },
    method: "POST",
  });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).prospectId, "prospect-123");
  assert.deepEqual(writes, [
    {
      userId: "verified-user",
      value: { name: "Sample Shop", physicalAddress: "Minnesota" },
      workspaceId: "work-1",
    },
  ]);
});

test("read and create enforce database membership and fail closed", async () => {
  const app = createProspectsRoutes({
    create: () => ({ kind: "not_found" }),
    list: () => null,
    verify: () => "viewer-1",
  });
  assert.equal((await app.request(url, { headers: auth })).status, 404);
  assert.equal(
    (
      await app.request(url, {
        body: JSON.stringify({ name: "Test" }),
        headers: auth,
        method: "POST",
      })
    ).status,
    404
  );
  const error = createProspectsRoutes({
    create: () => {
      throw new Error("SECRET POSTGRES DETAIL");
    },
    list: () => {
      throw new Error("SECRET POSTGRES DETAIL");
    },
    verify: () => "viewer-1",
  });
  const r = await error.request(url, { headers: auth });
  assert.equal(r.status, 503);
  assert.equal((await r.text()).includes("SECRET POSTGRES DETAIL"), false);
});
