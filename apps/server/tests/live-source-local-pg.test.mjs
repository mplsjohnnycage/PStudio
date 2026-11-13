import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { admitSourcedProspect } from "../../../packages/db/src/admission-queries.ts";
import {
  beginEnrichmentAttempt,
  completeEnrichmentAttempt,
} from "../../../packages/db/src/enrichment-queries.ts";
import { enqueueWorkspaceJob } from "../../../packages/db/src/job-enqueue.ts";
import {
  createWorkspacePreview,
  readPrivatePreview,
} from "../../../packages/db/src/preview-queries.ts";
import {
  decideWorkspaceReview,
  openWorkspaceReview,
  readWorkspaceReview,
} from "../../../packages/db/src/review-queries.ts";
import {
  approvals,
  claimEvidence,
  claims,
  evidence,
  jobAttempts,
  jobs,
  releaseArtifacts,
  releases,
  workspaceMemberships,
  workspaces,
} from "../../../packages/db/src/schema/index.ts";
import {
  lookupMinneapolisLicense,
  searchMinneapolisLicense,
} from "../src/minneapolis-license-source.ts";

const migrationTags = [
  "0000_fluffy_thunderbolt_ross",
  "0001_lush_mister_sinister",
  "0002_elite_mauler",
  "0003_lazy_morg",
  "0004_fine_ender_wiggin",
];
const LIVE = process.env.PSTUDIO_LIVE_SOURCE_PGLITE_TEST === "1";
const WHOLE_DOCUMENT = /MCCLOSKEYS PAINTING AND REPAIR/;
const HISTORICAL = /Historical registry report/i;
const EVIDENCE_LABEL = /Evidence evidence_/;

/**
 * Not a staging or production E2E test.
 * Uses a LIVE public source and a real file-backed LOCAL PGlite database.
 * Test-only roles, no Neon Auth, remote Neon connection, or external Rivet.
 */
test("real public source -> local durable PostgreSQL-compatible workflow survives restart", {
  skip: !LIVE,
}, async () => {
  const directory = mkdtempSync(join(tmpdir(), "pstudio-local-e2e-"));
  let engine = new PGlite(directory);
  let closed = false;
  try {
    for (const name of migrationTags) {
      // biome-ignore lint/performance/noAwaitInLoops: ordered SQL migrations
      await engine.exec(
        readFileSync(
          new URL(
            `../../../packages/db/src/migrations/${name}.sql`,
            import.meta.url
          ),
          "utf8"
        )
      );
    }
    let db = drizzle(engine);
    const operatorId = `operator_${randomUUID()}`;
    const ownerId = `owner_${randomUUID()}`;
    const outsiderId = `outsider_${randomUUID()}`;
    const workspaceId = `workspace_${randomUUID()}`;
    await db.insert(workspaces).values({
      id: workspaceId,
      name: "Isolated live-source verification workspace",
    });
    await db.insert(workspaceMemberships).values([
      { role: "operator", userId: operatorId, workspaceId },
      { role: "owner", userId: ownerId, workspaceId },
    ]);

    const candidates = await searchMinneapolisLicense("MCCLOSKEYS");
    assert.equal(
      candidates.length,
      1,
      "Official provider must return one test business"
    );
    const [original] = candidates;
    assert.match(original.name, WHOLE_DOCUMENT);
    assert.equal(original.externalId, "TLIC19984");

    const admitted = await admitSourcedProspect(
      db,
      operatorId,
      workspaceId,
      original
    );
    assert.equal(admitted.kind, "created");
    const duplicate = await admitSourcedProspect(
      db,
      operatorId,
      workspaceId,
      original
    );
    assert.equal(duplicate.kind, "duplicate");
    assert.equal(duplicate.prospectId, admitted.prospectId);

    const queued = await enqueueWorkspaceJob(
      db,
      operatorId,
      workspaceId,
      admitted.prospectId,
      "live-source-check"
    );
    assert.equal(queued.kind, "created");
    const claimed = await beginEnrichmentAttempt(db, queued.jobId);
    assert.equal(claimed.attempt, 1);
    assert.equal(claimed.externalId, original.externalId);
    const refreshed = await lookupMinneapolisLicense(claimed.externalId);
    assert.equal(refreshed?.externalId, original.externalId);
    const completed = await completeEnrichmentAttempt(
      db,
      queued.jobId,
      claimed.attempt,
      refreshed
    );
    assert.equal(completed.kind, "completed");

    const draft = await createWorkspacePreview(
      db,
      operatorId,
      workspaceId,
      admitted.prospectId
    );
    assert.equal(draft.kind, "created");
    const preview = await readPrivatePreview(
      db,
      operatorId,
      workspaceId,
      draft.previewId
    );
    assert.match(preview.html, WHOLE_DOCUMENT);
    assert.match(preview.html, HISTORICAL);
    assert.match(preview.html, EVIDENCE_LABEL);
    const opened = await openWorkspaceReview(
      db,
      operatorId,
      workspaceId,
      draft.previewId
    );
    assert.equal(opened.kind, "opened");
    assert.deepEqual(
      await decideWorkspaceReview(
        db,
        operatorId,
        workspaceId,
        draft.previewId,
        "approved"
      ),
      { kind: "not_found" }
    );
    const approved = await decideWorkspaceReview(
      db,
      ownerId,
      workspaceId,
      draft.previewId,
      "approved"
    );
    assert.equal(approved.kind, "approved");
    assert.equal(
      await readPrivatePreview(db, outsiderId, workspaceId, draft.previewId),
      null
    );
    const [artifactBefore] = await db
      .select()
      .from(releaseArtifacts)
      .where(eq(releaseArtifacts.releaseId, draft.releaseId));
    const digestBefore = artifactBefore.sha256;
    assert.equal(
      digestBefore,
      createHash("sha256").update(artifactBefore.html).digest("hex")
    );

    await engine.close();
    closed = true;
    engine = new PGlite(directory);
    closed = false;
    db = drizzle(engine);
    const [jobAfter] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, queued.jobId));
    const [attemptAfter] = await db
      .select()
      .from(jobAttempts)
      .where(eq(jobAttempts.jobId, queued.jobId));
    const [artifactAfter] = await db
      .select()
      .from(releaseArtifacts)
      .where(eq(releaseArtifacts.releaseId, draft.releaseId));
    const [releaseAfter] = await db
      .select()
      .from(releases)
      .where(eq(releases.id, draft.releaseId));
    const [approvalAfter] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, opened.approvalId));
    const reviewAfter = await readWorkspaceReview(
      db,
      ownerId,
      workspaceId,
      draft.previewId
    );
    const evidenceAfter = await db
      .select()
      .from(evidence)
      .where(eq(evidence.prospectId, admitted.prospectId));
    const claimAfter = await db
      .select()
      .from(claims)
      .where(eq(claims.prospectId, admitted.prospectId));
    const linksAfter = await db.select().from(claimEvidence);
    assert.equal(jobAfter.state, "completed");
    assert.equal(attemptAfter.state, "completed");
    assert.equal(releaseAfter.status, "approved");
    assert.equal(approvalAfter.decidedBy, ownerId);
    assert.equal(reviewAfter.state, "approved");
    assert.equal(artifactAfter.sha256, digestBefore);
    assert.ok(evidenceAfter.length >= 2);
    assert.ok(claimAfter.length >= 3);
    assert.ok(linksAfter.length >= 3);
    assert.equal(
      await readPrivatePreview(db, outsiderId, workspaceId, draft.previewId),
      null
    );
    assert.match(
      (await readPrivatePreview(db, ownerId, workspaceId, draft.previewId))
        .html,
      WHOLE_DOCUMENT
    );
    console.log(
      "PSTUDIO_LOCAL_LIVE_SOURCE_PROOF " +
        JSON.stringify({
          approvalId: opened.approvalId,
          approvalState: reviewAfter.state,
          artifactSha256: digestBefore,
          browserPreviewVerified: false,
          claimIds: claimAfter.map((x) => x.id),
          evidenceIds: evidenceAfter.map((x) => x.id),
          externalId: original.externalId,
          externalRivetVerified: false,
          jobId: queued.jobId,
          kind: "LIVE_SOURCE_LOCAL_DB_ONLY",
          name: original.name,
          neonAuthVerified: false,
          neonDatabaseVerified: false,
          persistedAfterRestart: true,
          previewId: draft.previewId,
          prospectId: admitted.prospectId,
          releaseId: draft.releaseId,
          sourceUri: original.sourceUri,
          version: draft.version,
          workspaceId,
        })
    );
  } finally {
    if (!closed) {
      await engine.close();
    }
    rmSync(directory, { force: true, recursive: true });
  }
});
