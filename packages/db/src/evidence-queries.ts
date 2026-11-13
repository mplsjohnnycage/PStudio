import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./index";
import {
  claims,
  evidence,
  prospects,
  workspaceMemberships,
} from "./schema/index";

/** Read-only sourced evidence and reported claims; tenant membership is rechecked. */
export async function listProspectEvidence(
  db: Database,
  userId: string,
  workspaceId: string,
  prospectId: string
) {
  const access = await db
    .select({ id: prospects.id })
    .from(prospects)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, userId)
      )
    )
    .where(
      and(eq(prospects.workspaceId, workspaceId), eq(prospects.id, prospectId))
    )
    .limit(1);
  if (!access.length) {
    return null;
  }

  const [sources, reportedClaims] = await Promise.all([
    db
      .select({
        capturedAt: evidence.capturedAt,
        id: evidence.id,
        sha256: evidence.sha256,
        sourceUri: evidence.sourceUri,
        title: evidence.title,
        type: evidence.type,
      })
      .from(evidence)
      .where(eq(evidence.prospectId, prospectId))
      .orderBy(desc(evidence.capturedAt))
      .limit(100),
    db
      .select({
        field: claims.field,
        id: claims.id,
        kind: claims.kind,
        observedAt: claims.observedAt,
        value: claims.value,
      })
      .from(claims)
      .where(eq(claims.prospectId, prospectId))
      .orderBy(desc(claims.observedAt))
      .limit(100),
  ]);
  return { claims: reportedClaims, evidence: sources };
}
