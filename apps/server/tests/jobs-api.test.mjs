import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createNeonTokenVerifier } from "../src/auth.ts";
import { createJobsRoutes } from "../src/jobs-api.ts";

test("jobs API denies missing or forged identity before any database read", async () => {
  let reads = 0;
  const app = createJobsRoutes({
    read: () => {
      reads += 1;
      return Promise.resolve([]);
    },
    verify: (header) =>
      Promise.resolve(header === "Bearer valid" ? "user-1" : null),
  });
  const path = "http://localhost/workspaces/ws-1/jobs";
  const noAuth = await app.request(path, {
    headers: { "x-user-id": "user-1" },
  });
  assert.equal(noAuth.status, 401);
  const badAuth = await app.request(path, {
    headers: { Authorization: "Bearer forged" },
  });
  assert.equal(badAuth.status, 401);
  const badId = await app.request("http://localhost/workspaces/%20/jobs", {
    headers: { Authorization: "Bearer valid" },
  });
  assert.equal(badId.status, 400);
  assert.equal(reads, 0);
});

test("jobs API scopes the read to authenticated user and workspace", async () => {
  const recorded = [];
  const app = createJobsRoutes({
    read: (userId, workspaceId) => {
      recorded.push([userId, workspaceId]);
      if (workspaceId !== "ws-1") {
        return Promise.resolve(null);
      }
      return Promise.resolve([
        {
          attempt: 0,
          id: "job-1",
          maxAttempts: 3,
          prospectId: "prospect-1",
          state: "queued",
          type: "enrich",
        },
      ]);
    },
    verify: () => Promise.resolve("user-1"),
  });
  const headers = {
    Authorization: "Bearer valid",
    "x-user-id": "admin",
    "x-workspace-id": "ws-2",
  };
  const allowed = await app.request("http://localhost/workspaces/ws-1/jobs", {
    headers,
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(
    (await allowed.json()).jobs.map((j) => j.id),
    ["job-1"]
  );
  const denied = await app.request("http://localhost/workspaces/ws-2/jobs", {
    headers,
  });
  assert.equal(denied.status, 404);
  assert.deepEqual(recorded, [
    ["user-1", "ws-1"],
    ["user-1", "ws-2"],
  ]);
});

test("jobs API fails closed when membership database is unavailable", async () => {
  const app = createJobsRoutes({
    read: () => Promise.reject(new Error("database offline")),
    verify: () => Promise.resolve("user-1"),
  });
  const response = await app.request("http://localhost/workspaces/ws-1/jobs", {
    headers: { Authorization: "Bearer valid" },
  });
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(body.includes("database offline"), false);
});

test("verified Neon-style JWT is the only identity used across the Hono request", async () => {
  const keys = await generateKeyPair("EdDSA");
  const pub = await exportJWK(keys.publicKey);
  const verify = createNeonTokenVerifier(
    {
      issuer: "https://auth.example.test",
      jwksUrl: "https://auth.example.test/jwks",
    },
    createLocalJWKSet({ keys: [{ ...pub, alg: "EdDSA", kid: "k1" }] })
  );
  const token = await new SignJWT({ workspaceId: "workspace-other" })
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setIssuer("https://auth.example.test")
    .setSubject("member-user")
    .setIssuedAt()
    .setExpirationTime("3m")
    .sign(keys.privateKey);
  const readCalls = [];
  const app = createJobsRoutes({
    read: (userId, workspaceId) => {
      readCalls.push([userId, workspaceId]);
      return Promise.resolve(workspaceId === "workspace-good" ? [] : null);
    },
    verify,
  });
  const headers = { Authorization: `Bearer ${token}`, "x-user-id": "spoofed" };
  const accepted = await app.request(
    "http://localhost/workspaces/workspace-good/jobs",
    { headers }
  );
  assert.equal(accepted.status, 200);
  const denied = await app.request(
    "http://localhost/workspaces/workspace-other/jobs",
    { headers }
  );
  assert.equal(denied.status, 404);
  assert.deepEqual(readCalls, [
    ["member-user", "workspace-good"],
    ["member-user", "workspace-other"],
  ]);
});
