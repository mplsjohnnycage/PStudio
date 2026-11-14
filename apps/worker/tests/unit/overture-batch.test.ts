import { describe, expect, test, vi } from "vitest";
import { asSource, queryPlaces } from "../../src/overture-batch";
import { executeEnrichmentWithStore } from "../../src/real-enrichment";

const place = {
  address: "100 Main St",
  category: "plumber",
  name: "Sample Plumbing",
  provenance: { release: "2026-10-21.0", source_record_sha256: "a".repeat(64) },
  source_id: "a3a3a3a3-2222-4444-8888-abcdefabcdef",
  source_observation: {
    name: "Sample Plumbing",
    source_id: "a3a3a3a3-2222-4444-8888-abcdefabcdef",
  },
  website_verification: "unknown",
};
describe("Overture-to-Neon intake contracts", () => {
  test("keeps missing website unknown and preserves source evidence", () => {
    const source = asSource(place);
    expect(source.provider).toBe("overture_places");
    expect(source.reportedClaims).toContainEqual({
      field: "websiteVerification",
      value: "unknown",
    });
    expect(
      source.reportedClaims?.some(
        (x) => x.field === "unverifiedWebsiteCandidate"
      )
    ).toBe(false);
    expect(JSON.parse(source.sourceExcerpt).observation.source_id).toBe(
      place.source_id
    );
  });
  test("rejects malformed source provenance and unbounded query", () => {
    expect(() =>
      asSource({
        ...place,
        provenance: { ...place.provenance, release: "../../etc" },
      })
    ).toThrow();
    expect(() => queryPlaces("0,0,180,90", "%", 1000)).toThrow();
  });
  test("Rivet enrichment accepts only a matching persisted Overture snapshot", async () => {
    const store = {
      begin: vi.fn(async () => ({
        attempt: 1,
        externalId: place.source_id,
        jobId: "job-a",
        prospectId: "prospect-a",
        provider: "overture_places",
      })),
      complete: vi.fn(async () => ({
        claimIds: ["claim-a"],
        evidenceIds: ["evidence-a"],
        kind: "completed" as const,
      })),
      fail: vi.fn(async () => ({ kind: "retrying" as const })),
    };
    const lookupLicense = vi.fn(async () => null);
    const lookupOverture = vi.fn(async () => asSource(place));
    const outcome = await executeEnrichmentWithStore(
      "job-a",
      store,
      lookupLicense,
      lookupOverture
    );
    expect(outcome.kind).toBe("completed");
    expect(lookupOverture).toHaveBeenCalledWith(place.source_id, "prospect-a");
    expect(lookupLicense).not.toHaveBeenCalled();
    expect(store.complete).toHaveBeenCalledOnce();
  });
});
