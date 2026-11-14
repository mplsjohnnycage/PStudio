import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createDb } from "@prospect-studio/db";
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
  jobOutbox,
  jobs,
  prospectExternalIds,
  prospects,
  releaseArtifacts,
  workspaceMemberships,
  workspaces,
} from "@prospect-studio/db/schema/index";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { runBatch } from "../../src/overture-batch";
import { lookupAdmittedOverture } from "../../src/overture-source";

/**
 * Live Overture read + scoped staging Neon + staging Rivet Cloud worker.
 * Uses an isolated service TEST fixture, not a Neon Auth user/session.
 * Does not trigger owner approvals, publication, or production discovery.
 */
const ENABLED = process.env.PSTUDIO_STAGING_OVERTURE_RIVET_E2E === "1";
const LINE_BREAK = /\r?\n/;
describe.skipIf(!ENABLED)(
  "Overture discovery through staging Neon and Rivet",
  () => {
    test("live source -> admission/outbox -> remote Rivet completion -> private review", async () => {
      const configPath = process.env.PSTUDIO_NEON_STAGING_WORKER_ENV_PATH;
      if (!configPath) {
        throw new Error("Missing scoped staging credential file");
      }
      const contents = readFileSync(configPath, "utf8");
      if (!contents.split(LINE_BREAK).includes("PSTUDIO_STAGING_ONLY=1")) {
        throw new Error("Refusing non-staging configuration");
      }
      const connectionLine = contents
        .split(LINE_BREAK)
        .find((x) => x.startsWith("DATABASE_URL="));
      if (!connectionLine?.includes("pstudio_staging_worker_20261113")) {
        throw new Error("Refusing non-scoped staging worker connection");
      }
      const databaseUrl = connectionLine.slice("DATABASE_URL=".length);
      process.env.DATABASE_URL = databaseUrl;
      process.env.RIVET_REAL_ENRICHMENT_ENABLED = "1";
      const db = createDb({ DATABASE_URL: databaseUrl });
      const uuid = randomUUID();
      const userId = `staging_test_service_${uuid}`;
      const workspaceId = `workspace_${uuid}`;
      await db.insert(workspaces).values({
        id: workspaceId,
        name: `Overture Rivet staging validation ${uuid} — TEST ONLY`,
      });
      await db.insert(workspaceMemberships).values({
        role: "operator",
        userId,
        workspaceId,
      });

      // The production intake API remains private; this calls its real logic
      // with a dedicated, isolated staging service fixture.
      const batch = await runBatch({
        bbox: "-93.38,44.9,-93.16,45.05",
        category: "%plumb%",
        db,
        limit: 1,
        userId,
        workspaceId,
      });
      expect(batch).toEqual({
        created: 1,
        discovered: 1,
        duplicate: 0,
        queued: 1,
      });
      const [prospect] = await db
        .select()
        .from(prospects)
        .where(eq(prospects.workspaceId, workspaceId));
      if (!prospect) {
        throw new Error("Missing admitted prospect");
      }
      expect(prospect.websiteStatus).toBe("unknown");
      expect(prospect.websiteUrl).toBeNull();
      const [external] = await db
        .select()
        .from(prospectExternalIds)
        .where(eq(prospectExternalIds.prospectId, prospect.id));
      if (!external) {
        throw new Error("Missing Overture source identity");
      }
      expect(external.provider).toBe("overture_places");
      const replay = await lookupAdmittedOverture(
        db,
        external.externalId,
        prospect.id
      );
      expect(replay?.provider).toBe("overture_places");
      const [queued] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.prospectId, prospect.id));
      if (!queued) {
        throw new Error("Missing admitted enrichment job");
      }
      expect(["queued", "running", "retrying", "completed"]).toContain(
        queued.state
      );
      const [outboxBefore] = await db
        .select()
        .from(jobOutbox)
        .where(eq(jobOutbox.jobId, queued.id));
      if (!outboxBefore) {
        throw new Error("Missing transactional outbox event");
      }
      expect(["pending", "claimed", "delivered"]).toContain(outboxBefore.state);

      // Production-like staging dispatcher and remote Rivet Cloud node are
      // separately managed services; do not start a mock or local actor here.
      await expect
        .poll(
          async () => {
            const [current] = await db
              .select({ state: jobs.state })
              .from(jobs)
              .where(eq(jobs.id, queued.id));
            return current?.state;
          },
          { interval: 1000, timeout: 75_000 }
        )
        .toBe("completed");

      const [completed] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, queued.id));
      const attempts = await db
        .select()
        .from(jobAttempts)
        .where(eq(jobAttempts.jobId, queued.id));
      const [outboxAfter] = await db
        .select()
        .from(jobOutbox)
        .where(eq(jobOutbox.jobId, queued.id));
      if (!completed) {
        throw new Error("Missing completed job");
      }
      expect(completed.state).toBe("completed");
      expect(attempts).toHaveLength(1);
      expect(attempts.at(0)?.state).toBe("completed");
      if (!outboxAfter) {
        throw new Error("Missing delivered outbox event");
      }
      expect(outboxAfter.state).toBe("delivered");
      const sourceEvidence = await db
        .select()
        .from(evidence)
        .where(eq(evidence.prospectId, prospect.id));
      expect(sourceEvidence.length).toBeGreaterThanOrEqual(2);
      for (const item of sourceEvidence) {
        expect(item.sha256).toBe(
          createHash("sha256")
            .update(`${item.sourceUri}\n${item.excerpt}`)
            .digest("hex")
        );
      }

      const preview = await createWorkspacePreview(
        db,
        userId,
        workspaceId,
        prospect.id
      );
      expect(preview.kind).toBe("created");
      if (preview.kind !== "created") {
        throw new Error("Private preview creation failed");
      }
      const storedPreview = await readPrivatePreview(
        db,
        userId,
        workspaceId,
        preview.previewId
      );
      expect(storedPreview?.html.length).toBeGreaterThan(200);
      const review = await openWorkspaceReview(
        db,
        userId,
        workspaceId,
        preview.previewId
      );
      expect(review.kind).toBe("opened");
      const reviewState = await readWorkspaceReview(
        db,
        userId,
        workspaceId,
        preview.previewId
      );
      expect(reviewState?.state).toBe("pending");
      expect(reviewState?.decidedAt).toBeNull();
      const [artifact] = await db
        .select()
        .from(releaseArtifacts)
        .where(eq(releaseArtifacts.releaseId, preview.releaseId));
      if (!artifact) {
        throw new Error("Missing durable release artifact");
      }
      const artifactSha = createHash("sha256")
        .update(artifact.html)
        .digest("hex");
      expect(artifact.sha256).toBe(artifactSha);
      console.log(
        "PSTUDIO_OVERTURE_STAGING_E2E " +
          JSON.stringify({
            artifactSha256: artifactSha,
            attemptCount: attempts.length,
            authenticatedUserVerified: false,
            discoveryCount: batch.discovered,
            evidenceCount: sourceEvidence.length,
            externalId: external.externalId,
            jobId: queued.id,
            jobState: completed.state,
            kind: "LIVE_OVERTURE_STAGING_NEON_REMOTE_RIVET",
            outboxState: outboxAfter.state,
            previewId: preview.previewId,
            prospectId: prospect.id,
            remoteRivetVerified: true,
            reviewState: reviewState?.state,
            workspaceId,
          })
      );
    }, 110_000);
  }
);
