import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  claimEvidence,
  claims,
  evidence,
  prospects,
  workspaceMemberships,
} from "./schema/index";

export interface ProspectInput {
  name: string;
  physicalAddress?: string;
  sourceUri?: string;
  websiteUrl?: string;
}

export async function listWorkspaceProspects(
  db: Database,
  userId: string,
  workspaceId: string
) {
  const membership = await db
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .limit(1);
  if (!membership.at(0)) {
    return null;
  }
  return db
    .select({
      hasExternalSource: sql<boolean>`EXISTS (SELECT 1 FROM prospect_external_ids AS source_id WHERE source_id.prospect_id = ${prospects.id} AND source_id.workspace_id = ${workspaceId})`,
      id: prospects.id,
      name: prospects.name,
      physicalAddress: prospects.physicalAddress,
      stage: prospects.stage,
      websiteStatus: prospects.websiteStatus,
      websiteUrl: prospects.websiteUrl,
    })
    .from(prospects)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(prospects.workspaceId, workspaceMemberships.workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .where(eq(prospects.workspaceId, workspaceId))
    .orderBy(desc(prospects.createdAt))
    .limit(100);
}

/** All three provenance writes and the prospect are one atomic tenant-checked action. */
export function createWorkspaceProspect(
  db: Database,
  userId: string,
  workspaceId: string,
  input: ProspectInput
): Promise<{ kind: "created"; id: string } | { kind: "not_found" }> {
  return db.transaction(async (tx) => {
    const member = await tx
      .select({ role: workspaceMemberships.role })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      )
      .limit(1)
      .for("share");
    if (
      !(
        member.at(0) && ["owner", "operator"].includes(member.at(0)?.role ?? "")
      )
    ) {
      return { kind: "not_found" as const };
    }
    const id = `prospect_${randomUUID()}`;
    const evidenceId = `evidence_${randomUUID()}`;
    const now = new Date();
    const sourceUri = input.sourceUri ?? "operator-report://manual-submission";
    const excerpt = JSON.stringify({
      name: input.name,
      physicalAddress: input.physicalAddress ?? null,
      websiteUrl: input.websiteUrl ?? null,
    });
    const digest = createHash("sha256")
      .update(`${sourceUri}\\n${excerpt}`)
      .digest("hex");
    await tx.insert(prospects).values({
      id,
      name: input.name,
      physicalAddress: input.physicalAddress ?? null,
      stage: "discovered",
      websiteStatus: input.websiteUrl ? "known" : "unknown",
      websiteUrl: input.websiteUrl ?? null,
      workspaceId,
    });
    await tx.insert(evidence).values({
      capturedAt: now,
      excerpt,
      id: evidenceId,
      prospectId: id,
      sha256: digest,
      sourceUri,
      title: "Operator-reported prospect",
      type: "operator_report",
    });
    if (input.websiteUrl) {
      const claimId = `claim_${randomUUID()}`;
      await tx.insert(claims).values({
        field: "websiteUrl",
        id: claimId,
        kind: "reported",
        observedAt: now,
        prospectId: id,
        value: input.websiteUrl,
      });
      await tx.insert(claimEvidence).values({
        claimId,
        evidenceId,
        prospectId: id,
      });
    }
    return { id, kind: "created" as const };
  });
}
