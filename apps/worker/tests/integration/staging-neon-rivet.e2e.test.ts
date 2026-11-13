import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { createDb } from "@prospect-studio/db";
import { admitSourcedProspect } from "@prospect-studio/db/admission-queries";
import { enqueueWorkspaceJob } from "@prospect-studio/db/job-enqueue";
import {
  createWorkspacePreview,
  readPrivatePreview,
} from "@prospect-studio/db/preview-queries";
import {
  openWorkspaceReview,
  readWorkspaceReview,
} from "@prospect-studio/db/review-queries";
import {
  evidence,
  jobAttempts,
  jobs,
  releaseArtifacts,
  workspaceMemberships,
  workspaces,
} from "@prospect-studio/db/schema/index";
import { eq } from "drizzle-orm";
import { setupTest } from "rivetkit/test";
import { describe, expect, test } from "vitest";
import { searchMinneapolisLicense } from "../../../server/src/minneapolis-license-source";
import {
  createPostgresOutboxTransport,
  createRivetSubmitPublisher,
  deliverOutboxBatch,
} from "../../src/outbox-dispatcher";

/**
 * Private-only opt-in staged database + real local Rivet engine test. The
 * identity below is an isolated test principal, NOT a Neon Auth session; this
 * does not prove browser authentication or cloud Rivet production readiness.
 * Do not simulate or issue an owner approval.
 */
const ENABLED = process.env.PSTUDIO_STAGING_NEON_RIVET_E2E === "1";
const HISTORICAL_REGISTRY = /Historical registry report/i;
function checkpoint(phase: string) {
  const location = process.env.PSTUDIO_E2E_PROGRESS_FILE;
  if (location) {
    appendFileSync(location, `${phase}\n`);
  }
}
describe.skipIf(!ENABLED)("real staging Neon + Rivet job pipeline", () => {
  test("public source -> scoped Neon -> real Rivet workflow -> durable preview pending owner review", async (ctx) => {
    checkpoint("test_started");
    const configFile = process.env.PSTUDIO_NEON_STAGING_WORKER_ENV_PATH;
    if (!configFile) {
      throw new Error("Missing private staging-only credential location");
    }
    const configText = readFileSync(configFile, "utf8");
    if (!configText.includes("PSTUDIO_STAGING_ONLY=1")) {
      throw new Error("Not a staging-only configuration");
    }
    const connectionLine = configText
      .split("\n")
      .find((x) => x.startsWith("DATABASE_URL="));
    if (!connectionLine?.includes("pstudio_staging_worker_20261113")) {
      throw new Error(
        "Refusing to operate without a scoped staging worker connection"
      );
    }
    const databaseUrl = connectionLine.slice("DATABASE_URL=".length);
    checkpoint("config_verified");
    process.env.DATABASE_URL = databaseUrl;
    process.env.RIVET_REAL_ENRICHMENT_ENABLED = "1";
    const [{ registry }] = await Promise.all([import("../../src/registry")]);
    checkpoint("registry_imported");
    const db = createDb({ DATABASE_URL: databaseUrl });
    checkpoint("db_created");
    const testId = randomUUID();
    const userId = `staging_test_service_${testId}`;
    const workspaceId = `workspace_${testId}`;
    const name = `PStudio staging E2E ${testId} — TEST ONLY`;

    checkpoint("before_workspace_insert");
    await db.insert(workspaces).values({ id: workspaceId, name });
    checkpoint("workspace_inserted");
    await db
      .insert(workspaceMemberships)
      .values({ role: "operator", userId, workspaceId });
    checkpoint("membership_inserted");
    const candidates = await searchMinneapolisLicense("MCCLOSKEYS");
    checkpoint("source_loaded");
    const candidate = candidates.find((c) => c.externalId === "TLIC19984");
    if (!candidate) {
      throw new Error("Official municipal source test record unavailable");
    }
    const admitted = await admitSourcedProspect(
      db,
      userId,
      workspaceId,
      candidate
    );
    expect(admitted.kind).toBe("created");
    if (admitted.kind !== "created") {
      throw new Error("staging admission did not create prospect");
    }
    const duplicate = await admitSourcedProspect(
      db,
      userId,
      workspaceId,
      candidate
    );
    expect(duplicate.kind).toBe("duplicate");
    const enqueued = await enqueueWorkspaceJob(
      db,
      userId,
      workspaceId,
      admitted.prospectId,
      `staging-e2e-${testId}`
    );
    expect(enqueued.kind).toBe("created");
    if (enqueued.kind !== "created") {
      throw new Error("job enqueue failed");
    }

    checkpoint("job_enqueued");
    const { client } = await setupTest(ctx, registry);
    checkpoint("rivet_setup_completed");
    const delivered = await deliverOutboxBatch(
      createPostgresOutboxTransport(db, createRivetSubmitPublisher(client)),
      1
    );
    checkpoint("outbox_delivered");
    expect(delivered.claimed).toBe(1);
    expect(delivered.delivered).toBe(1);
    const gate = client.jobGate.getOrCreate([workspaceId, enqueued.jobId]);
    await expect
      .poll(async () => (await gate.getState()).phase, {
        interval: 500,
        timeout: 55_000,
      })
      .toBe("completed");
    const [stored] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, enqueued.jobId));
    const attempts = await db
      .select()
      .from(jobAttempts)
      .where(eq(jobAttempts.jobId, enqueued.jobId));
    if (!stored) {
      throw new Error("No persisted job found");
    }
    expect(stored.state).toBe("completed");
    expect(attempts.at(0)?.state).toBe("completed");

    checkpoint("rivet_job_completed");
    const draft = await createWorkspacePreview(
      db,
      userId,
      workspaceId,
      admitted.prospectId
    );
    expect(draft.kind).toBe("created");
    if (draft.kind !== "created") {
      throw new Error("preview creation failed");
    }
    const preview = await readPrivatePreview(
      db,
      userId,
      workspaceId,
      draft.previewId
    );
    expect(preview?.html).toContain("MCCLOSKEYS PAINTING AND REPAIR");
    expect(preview?.html).toMatch(HISTORICAL_REGISTRY);
    const review = await openWorkspaceReview(
      db,
      userId,
      workspaceId,
      draft.previewId
    );
    expect(review.kind).toBe("opened");
    const reviewState = await readWorkspaceReview(
      db,
      userId,
      workspaceId,
      draft.previewId
    );
    expect(reviewState?.state).toBe("pending");
    const artifactRows = await db
      .select()
      .from(releaseArtifacts)
      .where(eq(releaseArtifacts.releaseId, draft.releaseId));
    const artifact = artifactRows.at(0);
    if (!artifact) {
      throw new Error("No durable artifact saved");
    }
    const sha = createHash("sha256").update(artifact.html).digest("hex");
    checkpoint("preview_created");
    expect(artifact.sha256).toBe(sha);
    const evidenceRows = await db
      .select()
      .from(evidence)
      .where(eq(evidence.prospectId, admitted.prospectId));
    expect(evidenceRows.length).toBeGreaterThanOrEqual(2);
    console.log(
      "PSTUDIO_STAGING_NEON_RIVET_E2E " +
        JSON.stringify({
          artifactSha256: sha,
          attemptCount: attempts.length,
          authenticatedBrowserVerified: false,
          evidenceIds: evidenceRows.map((x) => x.id),
          externalId: candidate.externalId,
          humanApprovalPerformed: false,
          jobId: enqueued.jobId,
          jobState: stored.state,
          kind: "STAGING_NEON_REAL_SOURCE_LOCAL_RIVET",
          previewId: draft.previewId,
          prospectId: admitted.prospectId,
          remoteRivetCloudVerified: false,
          reviewState: reviewState?.state,
          sourceUri: candidate.sourceUri,
          workspaceId,
        })
    );
  }, 90_000);
});
