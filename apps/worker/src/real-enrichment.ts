import type { Database } from "@prospect-studio/db";
import type { SourceCandidate } from "@prospect-studio/db/admission-queries";
import {
  beginEnrichmentAttempt,
  completeEnrichmentAttempt,
  type EnrichmentClaim,
  type EnrichmentCompletion,
  type EnrichmentFailure,
  failEnrichmentAttempt,
} from "@prospect-studio/db/enrichment-queries";
import { lookupMinneapolisLicense } from "../../server/src/minneapolis-license-source";
import { lookupAdmittedOverture } from "./overture-source";

export interface EnrichmentStore {
  begin: (jobId: string) => Promise<EnrichmentClaim | null>;
  complete: (
    jobId: string,
    attempt: number,
    candidate: SourceCandidate
  ) => Promise<EnrichmentCompletion>;
  fail: (
    jobId: string,
    attempt: number,
    errorCode: string
  ) => Promise<EnrichmentFailure>;
}

export interface EnrichmentOutcome {
  attempt?: number;
  claimIds?: string[];
  errorCode?: string;
  evidenceIds?: string[];
  kind:
    | "completed"
    | "already_completed"
    | "retrying"
    | "failed"
    | "conflict"
    | "skipped";
}
export type LookupPublicRecord = (
  license: string
) => Promise<SourceCandidate | null>;

class SourceFailure extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/**
 * Exactly one bounded, source-backed enrichment attempt. Raw upstream errors
 * and credentials never enter Neon state; only an allowlisted safe code does.
 */
export async function executeEnrichmentWithStore(
  jobId: string,
  store: EnrichmentStore,
  lookup: LookupPublicRecord,
  lookupOverture?: (
    externalId: string,
    prospectId: string
  ) => Promise<SourceCandidate | null>
): Promise<EnrichmentOutcome> {
  const claimed = await store.begin(jobId);
  if (!claimed) {
    return { kind: "skipped" };
  }

  let candidate: SourceCandidate;
  try {
    if (
      claimed.provider !== "minneapolis_residential_specialty" &&
      claimed.provider !== "overture_places"
    ) {
      throw new SourceFailure("unsupported_provider");
    }
    const fetched =
      claimed.provider === "overture_places"
        ? await lookupOverture?.(claimed.externalId, claimed.prospectId)
        : await lookup(claimed.externalId);
    if (!fetched) {
      throw new SourceFailure("source_record_missing");
    }
    if (
      fetched.externalId !== claimed.externalId ||
      fetched.provider !== claimed.provider
    ) {
      throw new SourceFailure("source_identity_mismatch");
    }
    candidate = fetched;
  } catch (error) {
    const code =
      error instanceof SourceFailure ? error.code : "source_unavailable";
    const failed = await store.fail(jobId, claimed.attempt, code);
    return { attempt: claimed.attempt, errorCode: code, kind: failed.kind };
  }

  try {
    const completed = await store.complete(jobId, claimed.attempt, candidate);
    if (completed.kind === "completed") {
      return {
        attempt: claimed.attempt,
        claimIds: completed.claimIds,
        evidenceIds: completed.evidenceIds,
        kind: "completed",
      };
    }
    return { attempt: claimed.attempt, kind: completed.kind };
  } catch {
    const code = "storage_unavailable";
    const failed = await store.fail(jobId, claimed.attempt, code);
    return { attempt: claimed.attempt, errorCode: code, kind: failed.kind };
  }
}

/** Wire the real Neon/Pg database to the fixed public-source lookup. */
export function executeEnrichmentAttempt(
  db: Database,
  jobId: string,
  lookup: LookupPublicRecord = lookupMinneapolisLicense
): Promise<EnrichmentOutcome> {
  const store: EnrichmentStore = {
    begin: (id) => beginEnrichmentAttempt(db, id),
    complete: (id, attempt, candidate) =>
      completeEnrichmentAttempt(db, id, attempt, candidate),
    fail: (id, attempt, code) => failEnrichmentAttempt(db, id, attempt, code),
  };
  return executeEnrichmentWithStore(jobId, store, lookup, (id, prospectId) =>
    lookupAdmittedOverture(db, id, prospectId)
  );
}
