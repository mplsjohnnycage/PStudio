import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { enqueueWorkspaceJob } from "../../../packages/db/src/job-enqueue.ts";
import {
  createWorkspacePreview,
  readPrivatePreview,
} from "../../../packages/db/src/preview-queries.ts";
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

const NAME_IN_PREVIEW = /Staging Fixture Studio/;
const DRAFT_IN_PREVIEW = /Draft preview/;
const Rollback = class extends Error {};

test("local PostgreSQL schema: signed JWT, tenant-scoped prospect import, provenance, enqueue and full rollback", async () => {
  const engine = new PGlite();
  const migrations = [
    "0000_fluffy_thunderbolt_ross",
    "0001_lush_mister_sinister",
    "0002_elite_mauler",
    "0003_lazy_morg",
  ];
  await migrations.reduce(async (previous, name) => {
    await previous;
    const sqlText = readFileSync(
      new URL(
        `../../../packages/db/src/migrations/${name}.sql`,
        import.meta.url
      ),
      "utf8"
    );
    await engine.exec(sqlText);
  }, Promise.resolve());
  const db = drizzle(engine);
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
      const draft = await createWorkspacePreview(
        tx,
        uid,
        workspace,
        prospectId
      );
      assert.equal(draft.kind, "created");
      const draftRepeat = await createWorkspacePreview(
        tx,
        uid,
        workspace,
        prospectId
      );
      assert.equal(draftRepeat.kind, "created");
      assert.equal(draftRepeat.version, 2);
      const privateDraft = await readPrivatePreview(
        tx,
        uid,
        workspace,
        draft.previewId
      );
      assert.ok(privateDraft);
      assert.equal(privateDraft.version, 1);
      assert.match(privateDraft.html, NAME_IN_PREVIEW);
      assert.match(privateDraft.html, DRAFT_IN_PREVIEW);
      const hidden = await readPrivatePreview(
        tx,
        other,
        workspace,
        draft.previewId
      );
      assert.equal(hidden, null);
      const blocked = await createWorkspacePreview(
        tx,
        other,
        workspace,
        prospectId
      );
      assert.deepEqual(blocked, { kind: "not_found" });
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
  await engine.close();
});
