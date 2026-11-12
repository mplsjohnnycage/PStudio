import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createDb } from "../../../packages/db/src/index.ts";
import { enqueueWorkspaceJob } from "../../../packages/db/src/job-enqueue.ts";
import {
  createWorkspaceProspect,
  listWorkspaceProspects,
} from "../../../packages/db/src/prospect-queries.ts";
import {
  claims,
  evidence,
  jobOutbox,
  workspaceMemberships,
  workspaces,
} from "../../../packages/db/src/schema/index.ts";
import { createNeonTokenVerifier } from "../src/auth.ts";
import { createProspectsRoutes } from "../src/prospects-api.ts";

const run = Boolean(
  process.env.PSTUDIO_STAGING_DATABASE_URL &&
    process.env.PSTUDIO_STAGING_TEST_OK === "1"
);
const Rollback = class extends Error {};

test("real staging DB: signed JWT, operator import, source provenance, tenant denial, enqueue+outbox and rollback", {
  skip: !run,
}, async () => {
  const db = createDb({
    DATABASE_URL: process.env.PSTUDIO_STAGING_DATABASE_URL,
  });
  const uid = `test-${randomUUID()}`;
  const other = `other-${randomUUID()}`;
  const workspace = `ws-test-${randomUUID()}`;
  const issuer = "https://auth-staging.example.test";
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const jwks = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
  const verify = createNeonTokenVerifier(
    { issuer, jwksUrl: `${issuer}/.well-known/jwks.json` },
    jwks
  );
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(issuer)
    .setAudience(issuer)
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  const url = `http://localhost/workspaces/${workspace}/prospects`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  let wasRolledBack = false;
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(workspaces)
        .values({ id: workspace, name: "Staging integration fixture" });
      await tx
        .insert(workspaceMemberships)
        .values({ role: "operator", userId: uid, workspaceId: workspace });
      const app = createProspectsRoutes({
        create: (user, ws, input) =>
          createWorkspaceProspect(tx, user, ws, input),
        list: (user, ws) => listWorkspaceProspects(tx, user, ws),
        verify,
      });
      const created = await app.request(url, {
        body: JSON.stringify({
          name: "Staging Fixture Studio",
          physicalAddress: "Test only, Minnesota",
        }),
        headers: { ...headers, "x-user-id": "forged-admin" },
        method: "POST",
      });
      assert.equal(created.status, 201);
      const { prospectId } = await created.json();
      const listing = await app.request(url, { headers });
      assert.equal(listing.status, 200);
      assert.ok(
        (await listing.json()).prospects.some(
          (x) => x.id === prospectId && x.websiteStatus === "unknown"
        )
      );
      const sourceRows = await tx
        .select()
        .from(evidence)
        .where(eq(evidence.prospectId, prospectId));
      assert.equal(sourceRows.length, 1);
      assert.equal(sourceRows[0].type, "operator_report");
      assert.equal(
        sourceRows[0].sourceUri,
        "operator-report://manual-submission"
      );
      const claimRows = await tx
        .select()
        .from(claims)
        .where(eq(claims.prospectId, prospectId));
      assert.equal(
        claimRows.length,
        0,
        "unknown website must not yield fabricated claim"
      );
      const denied = await createWorkspaceProspect(tx, other, workspace, {
        name: "Unauthorized",
      });
      assert.deepEqual(denied, { kind: "not_found" });
      const queued = await enqueueWorkspaceJob(
        tx,
        uid,
        workspace,
        prospectId,
        "staging-probe-123"
      );
      assert.equal(queued.kind, "created");
      assert.deepEqual(
        await enqueueWorkspaceJob(
          tx,
          uid,
          workspace,
          prospectId,
          "staging-probe-123"
        ),
        queued
      );
      const events = await tx
        .select()
        .from(jobOutbox)
        .where(eq(jobOutbox.jobId, queued.jobId));
      assert.equal(events.length, 1);
      assert.equal(events[0].state, "pending");
      throw new Rollback("rollback integration test fixture");
    });
  } catch (e) {
    if (!(e instanceof Rollback)) {
      throw e;
    }
    wasRolledBack = true;
  }
  assert.equal(wasRolledBack, true);
  const remaining = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspace));
  assert.equal(remaining.length, 0, "fixture must be fully rolled back");
});
