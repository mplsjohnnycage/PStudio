import { createHash } from "node:crypto";
import type { Database } from "@prospect-studio/db";
import type { SourceCandidate } from "@prospect-studio/db/admission-queries";
import {
  evidence,
  prospectExternalIds,
  prospects,
} from "@prospect-studio/db/schema/index";
import { and, desc, eq } from "drizzle-orm";

const SOURCE_TITLE = "Overture Maps Places — source-reported business record";
const SOURCE_URI = "https://docs.overturemaps.org/gers/registry/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** A provider-reported point, not independently verified geography. */
export function sourceCoordinateClaims(observation: Record<string, unknown>) {
  const { latitude, longitude } = observation;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return [];
  }
  return [
    {
      field: "sourceCoordinates",
      value: JSON.stringify({ latitude, longitude }),
    },
  ];
}

/** Replays the immutable, source-reported Overture snapshot already admitted to Neon.
 * This is NOT a fresh independent Overture verification. */
export async function lookupAdmittedOverture(
  db: Database,
  externalId: string,
  prospectId: string
): Promise<SourceCandidate | null> {
  const rows = await db
    .select({
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
        eq(evidence.type, "external_source"),
        eq(evidence.title, SOURCE_TITLE),
        eq(evidence.sourceUri, SOURCE_URI)
      )
    )
    .orderBy(desc(evidence.capturedAt))
    .limit(1);
  const [row] = rows;
  if (!row || row.id !== externalId || row.title !== SOURCE_TITLE) {
    return null;
  }
  const sha = createHash("sha256")
    .update(`${row.uri}\n${row.excerpt}`)
    .digest("hex");
  if (sha !== row.sha) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.excerpt);
  } catch {
    return null;
  }
  if (!(isRecord(parsed) && isRecord(parsed.observation))) {
    return null;
  }
  const { observation } = parsed;
  if (observation.source_id !== externalId || observation.name !== row.name) {
    return null;
  }
  return {
    externalId,
    name: row.name,
    provider: "overture_places",
    ...(typeof observation.address === "string" &&
    observation.address.length > 0 &&
    observation.address.length <= 300
      ? { physicalAddress: observation.address }
      : {}),
    reportedClaims: [
      {
        field: "sourceCategory",
        value: String(observation.category ?? "unknown").slice(0, 2000),
      },
      {
        field: "websiteVerification",
        value:
          parsed.website_verification === "unverified_candidates"
            ? "unverified_candidates"
            : "unknown",
      },
      ...sourceCoordinateClaims(observation),
    ],
    retrievedAt: row.captured,
    sourceExcerpt: row.excerpt,
    sourceTitle: row.title,
    sourceUri: row.uri,
  };
}
