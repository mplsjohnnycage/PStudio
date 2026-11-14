import type { EnrichmentClaim } from "@prospect-studio/db/enrichment-queries";
import { describe, expect, test, vi } from "vitest";
import { executeEnrichmentWithStore } from "../../src/real-enrichment";

const candidate = {
  externalId: "TLIC22572",
  name: "EXCELSIOR PAINT & DESIGN",
  provider: "minneapolis_residential_specialty",
  reportedClaims: [{ field: "licenseNumber", value: "TLIC22572" }],
  retrievedAt: new Date(),
  sourceExcerpt: '{"licenseNumber":"TLIC22572"}',
  sourceTitle: "Historical public license record",
  sourceUri:
    "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Residential_Specialty/FeatureServer/0/query",
};
const fixture = () => ({
  begin: vi.fn(
    async (): Promise<EnrichmentClaim | null> => ({
      attempt: 1,
      externalId: "TLIC22572",
      jobId: "job-a",
      prospectId: "prospect-a",
      provider: "minneapolis_residential_specialty",
    })
  ),
  complete: vi.fn(async () => ({
    claimIds: ["claim-a"],
    evidenceIds: ["evidence-a"],
    kind: "completed" as const,
  })),
  fail: vi.fn(async () => ({ kind: "retrying" as const })),
  readCompletedAttempt: vi.fn(async (): Promise<number | null> => null),
});

describe("real enrichment orchestration", () => {
  test("acknowledges a previous committed attempt after an actor replay", async () => {
    const store = fixture();
    store.begin.mockResolvedValueOnce(null);
    store.readCompletedAttempt.mockResolvedValueOnce(1);
    const lookup = vi.fn(async () => candidate);
    expect(await executeEnrichmentWithStore("job-a", store, lookup)).toEqual({
      attempt: 1,
      kind: "already_completed",
    });
    expect(store.readCompletedAttempt).toHaveBeenCalledWith("job-a");
    expect(lookup).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.fail).not.toHaveBeenCalled();
  });

  test("does not mistake a competing worker's unclaimed job for completed", async () => {
    const store = fixture();
    store.begin.mockResolvedValueOnce(null);
    const lookup = vi.fn(async () => candidate);
    expect(await executeEnrichmentWithStore("job-a", store, lookup)).toEqual({
      kind: "skipped",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  test("runs fixed public provider and completes durable records with evidence ids", async () => {
    const store = fixture();
    const lookup = vi.fn(async () => candidate);
    const outcome = await executeEnrichmentWithStore("job-a", store, lookup);
    expect(outcome).toEqual({
      attempt: 1,
      claimIds: ["claim-a"],
      evidenceIds: ["evidence-a"],
      kind: "completed",
    });
    expect(lookup).toHaveBeenCalledWith("TLIC22572");
    expect(store.complete).toHaveBeenCalledWith("job-a", 1, candidate);
    expect(store.fail).not.toHaveBeenCalled();
  });
  test("network failures persist sanitized codes and request retry", async () => {
    const store = fixture();
    const outcome = await executeEnrichmentWithStore(
      "job-a",
      store,
      async () => {
        await Promise.resolve();
        throw new Error("Sensitive provider detail");
      }
    );
    expect(outcome).toEqual({
      attempt: 1,
      errorCode: "source_unavailable",
      kind: "retrying",
    });
    expect(store.fail).toHaveBeenCalledWith("job-a", 1, "source_unavailable");
    expect(store.complete).not.toHaveBeenCalled();
  });
  test("unsupported providers never make external requests", async () => {
    const store = fixture();
    store.begin.mockResolvedValueOnce({
      attempt: 1,
      externalId: "x",
      jobId: "job-a",
      prospectId: "prospect-a",
      provider: "untrusted_provider",
    });
    const lookup = vi.fn(async () => candidate);
    const outcome = await executeEnrichmentWithStore("job-a", store, lookup);
    expect(outcome.kind).toBe("retrying");
    expect(outcome.errorCode).toBe("unsupported_provider");
    expect(lookup).not.toHaveBeenCalled();
  });
  test("source provider returning null never creates fake claims", async () => {
    const store = fixture();
    const outcome = await executeEnrichmentWithStore(
      "job-a",
      store,
      async () => null
    );
    expect(outcome.kind).toBe("retrying");
    expect(outcome.errorCode).toBe("source_record_missing");
    expect(store.complete).not.toHaveBeenCalled();
  });
});
