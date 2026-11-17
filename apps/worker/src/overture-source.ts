import { createHash } from "node:crypto";
import type { Database } from "@prospect-studio/db";
import type { SourceCandidate } from "@prospect-studio/db/admission-queries";
import {
  evidence,
  prospectExternalIds,
  prospects,
} from "@prospect-studio/db/schema/index";
import { and, desc, eq } from "drizzle-orm";

/** Replays the immutable, source-reported Overture snapshot already admitted to Neon.
 * This is NOT a fresh independent Overture verification. */
export async function lookupAdmittedOverture(
  db: Database,
  externalId: string,
  prospectId: string
): Promise<SourceCandidate | null> {
  const rows = await db
    .select({
      address: prospects.physicalAddress,
      captured: evidence.capturedAt,
      excerpt: evidence.excerpt,
      id: prospectExternalIds.externalId,
      name: prospects.name,
      sha: evidence.sha256,
      title: evidence.title,
      uri: evidence.sourceUri,
    })
    .from(prospectExternalIds)
    .innerJoin(prospects, eq(prospectExternalIds.prospectId, prospects.id))
    .innerJoin(evidence, eq(evidence.prospectId, prospects.id))
    .where(
      and(
        eq(prospectExternalIds.provider, "overture_places"),
        eq(prospectExternalIds.externalId, externalId),
        eq(prospectExternalIds.prospectId, prospectId),
        eq(evidence.type, "external_source")
      )
    )
    .orderBy(desc(evidence.capturedAt))
    .limit(1);
  const [row] = rows;
  if (
    !row ||
    row.id !== externalId ||
    row.title !== "Overture Maps Places — source-reported business record"
  ) {
    return null;
  }
  const sha = createHash("sha256")
    .update(`${row.uri}\n${row.excerpt}`)
    .digest("hex");
  if (sha !== row.sha) {
    return null;
  }
  const parsed: unknown = JSON.parse(row.excerpt);
  if (!parsed || typeof parsed !== "object" || !("observation" in parsed)) {
    return null;
  }
  const { observation } = parsed as { observation: Record<string, unknown> };
  if (observation.source_id !== externalId || observation.name !== row.name) {
    return null;
  }
  return {
    externalId,
    name: row.name,
    provider: "overture_places",
    ...(row.address ? { physicalAddress: row.address } : {}),
    reportedClaims: [
      {
        field: "sourceCategory",
        value: String(observation.category ?? "unknown").slice(0, 2000),
      },
      { field: "websiteVerification", value: "unverified_candidates" },
    ],
    retrievedAt: row.captured,
    sourceExcerpt: row.excerpt,
    sourceTitle: row.title,
    sourceUri: row.uri,
  };
}
