import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "./index";
import {
  claimEvidence,
  claims,
  evidence,
  prospectExternalIds,
  prospects,
  workspaceMemberships,
  workspaces,
} from "./schema/index";

export interface SourceCandidate {
  externalId: string;
  name: string;
  physicalAddress?: string;
  provider: string;
  reportedClaims?: readonly { field: string; value: string }[];
  retrievedAt: Date;
  sourceExcerpt: string;
  sourceTitle: string;
  sourceUri: string;
}
export type SourceAdmission =
  | { kind: "created" | "duplicate"; prospectId: string }
  | { kind: "not_found" };

const VALID_SOURCE_KEY = /^[a-z][a-z0-9_]{1,63}$/;
const MAX_CLAIMS = 12;

function validCandidate(candidate: SourceCandidate): boolean {
  return (
    VALID_SOURCE_KEY.test(candidate.provider) &&
    candidate.externalId.length > 0 &&
    candidate.externalId.length <= 200 &&
    candidate.name.trim().length > 0 &&
    candidate.name.length <= 160 &&
    (candidate.physicalAddress?.length ?? 0) <= 300 &&
    candidate.sourceTitle.length > 0 &&
    candidate.sourceTitle.length <= 200 &&
    candidate.sourceExcerpt.length > 0 &&
    candidate.sourceExcerpt.length <= 20_000 &&
    (candidate.reportedClaims ?? []).length <= MAX_CLAIMS &&
    (candidate.reportedClaims ?? []).every(
      (item) =>
        item.field.length > 0 &&
        item.field.length <= 80 &&
        item.value.length > 0 &&
        item.value.length <= 2000
    ) &&
    candidate.retrievedAt instanceof Date &&
    !Number.isNaN(candidate.retrievedAt.getTime()) &&
    (() => {
      try {
        return new URL(candidate.sourceUri).protocol === "https:";
      } catch {
        return false;
      }
    })()
  );
}

/**
 * A source provider delivers an actual, timestamped response; this function
 * preserves its original excerpt without promoting provider statements to facts.
 * Workspace row locks serialize exact external IDs across concurrent workers.
 */
export function admitSourcedProspect(
  db: Database,
  userId: string,
  workspaceId: string,
  candidate: SourceCandidate
): Promise<SourceAdmission> {
  if (!validCandidate(candidate)) {
    return Promise.reject(new Error("Invalid external source evidence"));
  }
  return db.transaction(async (tx) => {
    const authorized = await tx
      .select({ role: workspaceMemberships.role })
      .from(workspaces)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.workspaceId, workspaces.id),
          eq(workspaceMemberships.userId, userId)
        )
      )
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
      .for("update", { of: workspaces });
    if (!["owner", "operator"].includes(authorized.at(0)?.role ?? "")) {
      return { kind: "not_found" } as const;
    }
    const existing = await tx
      .select({ prospectId: prospectExternalIds.prospectId })
      .from(prospectExternalIds)
      .where(
        and(
          eq(prospectExternalIds.workspaceId, workspaceId),
          eq(prospectExternalIds.provider, candidate.provider),
          eq(prospectExternalIds.externalId, candidate.externalId)
        )
      )
      .limit(1);
    const earlier = existing.at(0);
    if (earlier) {
      return { kind: "duplicate", prospectId: earlier.prospectId } as const;
    }
    const prospectId = `prospect_${randomUUID()}`;
    const evidenceId = `evidence_${randomUUID()}`;
    const digest = createHash("sha256")
      .update(`${candidate.sourceUri}\n${candidate.sourceExcerpt}`)
      .digest("hex");
    await tx.insert(prospects).values({
      id: prospectId,
      name: candidate.name,
      physicalAddress: candidate.physicalAddress ?? null,
      stage: "discovered",
      websiteStatus: "unknown",
      websiteUrl: null,
      workspaceId,
    });
    await tx.insert(prospectExternalIds).values({
      externalId: candidate.externalId,
      prospectId,
      provider: candidate.provider,
      workspaceId,
    });
    await tx.insert(evidence).values({
      capturedAt: candidate.retrievedAt,
      excerpt: candidate.sourceExcerpt,
      id: evidenceId,
      prospectId,
      sha256: digest,
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
    const claimRows = fields.map((field) => ({
      field: field.field,
      id: `claim_${randomUUID()}`,
      kind: "reported" as const,
      observedAt: candidate.retrievedAt,
      prospectId,
      value: field.value,
    }));
    if (claimRows.length > 0) {
      await tx.insert(claims).values(claimRows);
      await tx.insert(claimEvidence).values(
        claimRows.map(({ id }) => ({
          claimId: id,
          evidenceId,
          prospectId,
        }))
      );
    }
    return { kind: "created", prospectId } as const;
  });
}
