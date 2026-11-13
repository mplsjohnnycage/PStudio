import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { SourceCandidate } from "./admission-queries";
import type { Database } from "./index";
import { renderProspectPreview } from "./preview-render";
import {
  claimEvidence,
  claims,
  evidence,
  jobAttempts,
  jobs,
  previews,
  prospectExternalIds,
  prospects,
  releaseArtifacts,
  releases,
} from "./schema/index";

export interface EnrichmentClaim {
  attempt: number;
  externalId: string;
  jobId: string;
  prospectId: string;
  provider: string;
}
export type EnrichmentCompletion =
  | { kind: "completed"; evidenceIds: string[]; claimIds: string[] }
  | { kind: "already_completed" }
  | { kind: "conflict" };
export interface EnrichmentFailure {
  kind: "retrying" | "failed" | "conflict";
}

const ERROR_CODE = /^[a-z][a-z0-9_]{0,79}$/;
const MAX_SOURCE_CLAIMS = 12;

function idFor(prefix: string, parts: readonly (string | number)[]): string {
  return (
    prefix +
    "_" +
    createHash("sha256").update(JSON.stringify(parts)).digest("hex")
  );
}

function validateCandidate(candidate: SourceCandidate): void {
  const possibleClaims = candidate.reportedClaims ?? [];
  const good =
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    candidate.name.length <= 160 &&
    (candidate.physicalAddress?.length ?? 0) <= 300 &&
    candidate.sourceTitle.length > 0 &&
    candidate.sourceTitle.length <= 200 &&
    candidate.sourceExcerpt.length > 0 &&
    candidate.sourceExcerpt.length <= 20_000 &&
    candidate.retrievedAt instanceof Date &&
    !Number.isNaN(candidate.retrievedAt.getTime()) &&
    possibleClaims.length <= MAX_SOURCE_CLAIMS &&
    possibleClaims.every(
      (c) =>
        c.field.length > 0 &&
        c.field.length <= 80 &&
        c.value.length > 0 &&
        c.value.length <= 2000
    );
  let validUrl = false;
  try {
    validUrl = new URL(candidate.sourceUri).protocol === "https:";
  } catch {
    validUrl = false;
  }
  if (!(good && validUrl)) {
    throw new Error("Invalid enrichment source evidence");
  }
}

/**
 * Claim exactly one source-backed job with an atomic database state transition.
 * A competing worker receives null; no attempt can be double-claimed.
 */
export function beginEnrichmentAttempt(
  db: Database,
  jobId: string
): Promise<EnrichmentClaim | null> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const updated = await tx
      .update(jobs)
      .set({
        attempt: sql.raw("attempt + 1"),
        finishedAt: null,
        startedAt: now,
        state: "running",
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.type, "enrich"),
          inArray(jobs.state, ["queued", "retrying"]),
          lt(jobs.attempt, jobs.maxAttempts)
        )
      )
      .returning({
        attempt: jobs.attempt,
        jobId: jobs.id,
        prospectId: jobs.prospectId,
      });
    const claimed = updated.at(0);
    if (!claimed) {
      return null;
    }

    const externalRows = await tx
      .select({
        externalId: prospectExternalIds.externalId,
        provider: prospectExternalIds.provider,
      })
      .from(prospectExternalIds)
      .where(eq(prospectExternalIds.prospectId, claimed.prospectId))
      .orderBy(prospectExternalIds.provider)
      .limit(1);

    await tx.insert(jobAttempts).values({
      attempt: claimed.attempt,
      jobId: claimed.jobId,
      startedAt: now,
      state: "running",
    });

    const external = externalRows.at(0);
    if (!external) {
      await tx
        .update(jobAttempts)
        .set({
          errorCode: "no_external_source",
          finishedAt: now,
          state: "failed",
        })
        .where(
          and(
            eq(jobAttempts.jobId, jobId),
            eq(jobAttempts.attempt, claimed.attempt)
          )
        );
      await tx
        .update(jobs)
        .set({ finishedAt: now, state: "failed", updatedAt: now })
        .where(eq(jobs.id, jobId));
      return null;
    }
    return {
      ...claimed,
      externalId: external.externalId,
      provider: external.provider,
    };
  });
}

/**
 * Evidence, provenance links, business claims, job completion and attempt
 * completion commit in one transaction. External source data stays "reported".
 */
export function completeEnrichmentAttempt(
  db: Database,
  jobId: string,
  attempt: number,
  candidate: SourceCandidate
): Promise<EnrichmentCompletion> {
  if (!Number.isInteger(attempt) || attempt < 1) {
    return Promise.reject(new Error("Invalid attempt"));
  }
  validateCandidate(candidate);
  return db.transaction(async (tx): Promise<EnrichmentCompletion> => {
    const [record] = await tx
      .select({
        attempt: jobs.attempt,
        prospectId: jobs.prospectId,
        state: jobs.state,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)
      .for("update");
    if (record?.state === "completed" && record.attempt === attempt) {
      return { kind: "already_completed" };
    }
    if (record?.state !== "running" || record.attempt !== attempt) {
      return { kind: "conflict" };
    }

    const identities = await tx
      .select({
        externalId: prospectExternalIds.externalId,
        provider: prospectExternalIds.provider,
      })
      .from(prospectExternalIds)
      .where(eq(prospectExternalIds.prospectId, record.prospectId));
    if (
      !identities.some(
        (i) =>
          i.externalId === candidate.externalId &&
          i.provider === candidate.provider
      )
    ) {
      throw new Error("Source identity mismatch");
    }

    const now = new Date();
    const evidenceId = idFor("evidence", [jobId, attempt]);
    await tx.insert(evidence).values({
      capturedAt: candidate.retrievedAt,
      excerpt: candidate.sourceExcerpt,
      id: evidenceId,
      prospectId: record.prospectId,
      sha256: createHash("sha256")
        .update([candidate.sourceUri, candidate.sourceExcerpt].join("\n"))
        .digest("hex"),
      sourceUri: candidate.sourceUri,
      title: candidate.sourceTitle,
      type: "external_source",
    });

    const fields = [
      { field: "name", value: candidate.name },
      ...(candidate.physicalAddress
        ? [{ field: "physicalAddress", value: candidate.physicalAddress }]
        : []),
      ...(candidate.reportedClaims ?? []),
    ];
    const claimRows = fields.map((field, index) => ({
      field: field.field,
      id: idFor("claim", [jobId, attempt, index]),
      kind: "reported" as const,
      observedAt: candidate.retrievedAt,
      prospectId: record.prospectId,
      value: field.value,
    }));
    if (claimRows.length) {
      await tx.insert(claims).values(claimRows);
      await tx.insert(claimEvidence).values(
        claimRows.map(({ id }) => ({
          claimId: id,
          evidenceId,
          prospectId: record.prospectId,
        }))
      );
    }
    // A successful source-backed job also produces a durable private draft.
    // The locked prospect serializes version allocation with manual versions.
    // Publication and review decisions are deliberately left to the owner.
    const [business] = await tx
      .select({
        name: prospects.name,
        physicalAddress: prospects.physicalAddress,
        websiteUrl: prospects.websiteUrl,
      })
      .from(prospects)
      .where(eq(prospects.id, record.prospectId))
      .limit(1)
      .for("update");
    if (!business) {
      throw new Error("Missing prospect during enrichment");
    }
    const [previous] = await tx
      .select({ version: releases.version })
      .from(releases)
      .where(eq(releases.prospectId, record.prospectId))
      .orderBy(desc(releases.version))
      .limit(1);
    const version = (previous?.version ?? 0) + 1;
    const releaseId = idFor("release", [jobId, attempt]);
    const previewId = idFor("preview", [jobId, attempt]);
    const html = renderProspectPreview({
      designVersion: version,
      name: business.name,
      physicalAddress:
        business.physicalAddress ?? candidate.physicalAddress ?? null,
      provenance: {
        capturedAt: candidate.retrievedAt,
        evidenceId,
        kind: "external_source",
        sourceExcerpt: candidate.sourceExcerpt,
        sourceUri: candidate.sourceUri,
        title: candidate.sourceTitle,
      },
      websiteUrl: business.websiteUrl,
    });
    await tx.insert(releases).values({
      artifactObjectKey: `release_artifacts/${releaseId}`,
      id: releaseId,
      prospectId: record.prospectId,
      status: "draft",
      version,
    });
    await tx.insert(releaseArtifacts).values({
      html,
      prospectId: record.prospectId,
      releaseId,
      sha256: createHash("sha256").update(html).digest("hex"),
    });
    await tx.insert(previews).values({
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      id: previewId,
      prospectId: record.prospectId,
      releaseId,
      state: "draft",
    });

    await tx
      .update(prospects)
      .set({ stage: "enriched", updatedAt: now })
      .where(eq(prospects.id, record.prospectId));
    await tx
      .update(jobAttempts)
      .set({ errorCode: null, evidenceId, finishedAt: now, state: "completed" })
      .where(
        and(eq(jobAttempts.jobId, jobId), eq(jobAttempts.attempt, attempt))
      );
    await tx
      .update(jobs)
      .set({ finishedAt: now, state: "completed", updatedAt: now })
      .where(eq(jobs.id, jobId));
    return {
      claimIds: claimRows.map((row) => row.id),
      evidenceIds: [evidenceId],
      kind: "completed",
    };
  });
}

/** Persist a sanitized error code and a bounded retry/terminal decision. */
export function failEnrichmentAttempt(
  db: Database,
  jobId: string,
  attempt: number,
  code: string
): Promise<EnrichmentFailure> {
  if (!ERROR_CODE.test(code)) {
    return Promise.reject(new Error("Invalid safe failure code"));
  }
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        attempt: jobs.attempt,
        maxAttempts: jobs.maxAttempts,
        state: jobs.state,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)
      .for("update");
    if (record?.state !== "running" || record.attempt !== attempt) {
      return { kind: "conflict" as const };
    }
    const now = new Date();
    const state = attempt >= record.maxAttempts ? "failed" : "retrying";
    await tx
      .update(jobAttempts)
      .set({ errorCode: code, finishedAt: now, state })
      .where(
        and(eq(jobAttempts.jobId, jobId), eq(jobAttempts.attempt, attempt))
      );
    await tx
      .update(jobs)
      .set({
        state,
        updatedAt: now,
        ...(state === "failed" ? { finishedAt: now } : {}),
      })
      .where(eq(jobs.id, jobId));
    return { kind: state };
  });
}

/**
 * Mark stale running jobs recoverable after a caller-chosen cutoff, recording
 * explicit interruption evidence. Call periodically with cutoff >=2 minutes old.
 */
export function recoverStaleEnrichmentAttempts(
  db: Database,
  staleBefore: Date
): Promise<number> {
  if (!(staleBefore instanceof Date) || Number.isNaN(staleBefore.getTime())) {
    return Promise.reject(new Error("Invalid stale cutoff"));
  }
  return db.transaction(async (tx) => {
    const stale = await tx
      .select({
        attempt: jobs.attempt,
        jobId: jobs.id,
        maxAttempts: jobs.maxAttempts,
      })
      .from(jobs)
      .innerJoin(
        jobAttempts,
        and(
          eq(jobAttempts.jobId, jobs.id),
          eq(jobAttempts.attempt, jobs.attempt)
        )
      )
      .where(
        and(eq(jobs.state, "running"), lt(jobAttempts.startedAt, staleBefore))
      )
      .orderBy(jobAttempts.startedAt)
      .limit(100)
      .for("update", { of: jobs });
    const now = new Date();
    for (const row of stale) {
      const state = row.attempt >= row.maxAttempts ? "failed" : "retrying";
      // biome-ignore lint/performance/noAwaitInLoops: transaction row writes must be serialized
      await tx
        .update(jobAttempts)
        .set({ errorCode: "worker_interrupted", finishedAt: now, state })
        .where(
          and(
            eq(jobAttempts.jobId, row.jobId),
            eq(jobAttempts.attempt, row.attempt)
          )
        );
      await tx
        .update(jobs)
        .set({
          state,
          updatedAt: now,
          ...(state === "failed" ? { finishedAt: now } : {}),
        })
        .where(eq(jobs.id, row.jobId));
    }
    return stale.length;
  });
}
