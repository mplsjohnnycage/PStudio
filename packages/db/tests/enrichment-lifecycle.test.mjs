import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  beginEnrichmentAttempt,
  completeEnrichmentAttempt,
  failEnrichmentAttempt,
  recoverStaleEnrichmentAttempts,
} from "../src/enrichment-queries.ts";
import {
  claimEvidence,
  claims,
  evidence,
  jobAttempts,
  jobs,
  prospectExternalIds,
  prospects,
  workspaceMemberships,
  workspaces,
} from "../src/schema/index.ts";

const IDENTITY_ERROR = /identity/i;

const migrations = [
  "0000_fluffy_thunderbolt_ross",
  "0001_lush_mister_sinister",
  "0002_elite_mauler",
  "0003_lazy_morg",
  "0004_fine_ender_wiggin",
];

async function fixture() {
  const engine = new PGlite();
  for (const name of migrations) {
    // biome-ignore lint/performance/noAwaitInLoops: SQL migrations must apply in order
    await engine.exec(
      readFileSync(
        new URL(`../src/migrations/${name}.sql`, import.meta.url),
        "utf8"
      )
    );
  }
  const db = drizzle(engine);
  const suffix = randomUUID();
  const workspaceId = `ws_${suffix}`;
  const prospectId = `prospect_${suffix}`;
  const jobId = `job_${suffix}`;
  const externalId = "MN-SRC-REAL-LICENSE-001";
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: "Isolated test workspace" });
  await db
    .insert(workspaceMemberships)
    .values({ role: "owner", userId: "test_owner", workspaceId });
  await db.insert(prospects).values({
    id: prospectId,
    name: "Fixture Repair LLC",
    stage: "discovered",
    websiteStatus: "unknown",
    workspaceId,
  });
  await db.insert(prospectExternalIds).values({
    externalId,
    prospectId,
    provider: "minneapolis_residential_specialty",
    workspaceId,
  });
  await db.insert(jobs).values({
    id: jobId,
    maxAttempts: 3,
    prospectId,
    state: "queued",
    type: "enrich",
  });
  return { db, engine, externalId, jobId, prospectId };
}

function candidate(externalId) {
  return {
    externalId,
    name: "Fixture Repair LLC",
    physicalAddress: "Fixture Address, MN",
    provider: "minneapolis_residential_specialty",
    reportedClaims: [{ field: "licenseNumber", value: externalId }],
    retrievedAt: new Date(),
    sourceExcerpt: JSON.stringify({
      dbaName: "Fixture Repair LLC",
      licenseNumber: externalId,
    }),
    sourceTitle: "Municipal public license source (test fixture)",
    sourceUri:
      "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Residential_Specialty/FeatureServer/0/query",
  };
}

test("enrichment persists real-shaped sourced evidence, claims, attempt and terminal job atomically", async () => {
  const f = await fixture();
  try {
    const claim = await beginEnrichmentAttempt(f.db, f.jobId);
    assert.equal(claim?.attempt, 1);
    assert.equal(claim?.externalId, f.externalId);
    const result = await completeEnrichmentAttempt(
      f.db,
      f.jobId,
      1,
      candidate(f.externalId)
    );
    assert.equal(result.kind, "completed");
    assert.equal(result.evidenceIds.length, 1);
    assert.ok(result.claimIds.length >= 2);
    assert.equal((await f.db.select().from(jobs)).at(0).state, "completed");
    assert.equal((await f.db.select().from(prospects)).at(0).stage, "enriched");
    const linked = await f.db.select().from(claimEvidence);
    assert.equal(linked.length, result.claimIds.length);
    assert.equal((await f.db.select().from(evidence)).length, 1);
    const attempts = await f.db.select().from(jobAttempts);
    assert.equal(attempts[0].state, "completed");
    assert.equal(
      (
        await completeEnrichmentAttempt(
          f.db,
          f.jobId,
          1,
          candidate(f.externalId)
        )
      ).kind,
      "already_completed"
    );
    assert.equal(await beginEnrichmentAttempt(f.db, f.jobId), null);
    assert.equal(
      (await f.db.select().from(claims)).length,
      result.claimIds.length
    );
  } finally {
    await f.engine.close();
  }
});

test("enrichment retries at most three times and retains safe failure codes", async () => {
  const f = await fixture();
  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each attempt must complete before the next
      const claimed = await beginEnrichmentAttempt(f.db, f.jobId);
      assert.equal(claimed?.attempt, attempt);
      const next = await failEnrichmentAttempt(
        f.db,
        f.jobId,
        attempt,
        "source_unavailable"
      );
      assert.equal(next.kind, attempt === 3 ? "failed" : "retrying");
    }
    assert.equal(await beginEnrichmentAttempt(f.db, f.jobId), null);
    const rows = await f.db.select().from(jobAttempts);
    assert.equal(rows.length, 3);
    assert.ok(
      rows.every(
        (row) => row.errorCode === "source_unavailable" && row.finishedAt
      )
    );
    assert.equal((await f.db.select().from(jobs)).at(0).state, "failed");
  } finally {
    await f.engine.close();
  }
});

test("interrupted running attempts become retryable and cannot remain processing forever", async () => {
  const f = await fixture();
  try {
    assert.equal((await beginEnrichmentAttempt(f.db, f.jobId))?.attempt, 1);
    const count = await recoverStaleEnrichmentAttempts(
      f.db,
      new Date(Date.now() + 60_000)
    );
    assert.equal(count, 1);
    assert.equal((await f.db.select().from(jobs)).at(0).state, "retrying");
    assert.equal(
      (await f.db.select().from(jobAttempts)).at(0).errorCode,
      "worker_interrupted"
    );
    assert.equal((await beginEnrichmentAttempt(f.db, f.jobId))?.attempt, 2);
  } finally {
    await f.engine.close();
  }
});

test("source identity mismatch never commits enrichment evidence", async () => {
  const f = await fixture();
  try {
    await beginEnrichmentAttempt(f.db, f.jobId);
    await assert.rejects(
      () =>
        completeEnrichmentAttempt(
          f.db,
          f.jobId,
          1,
          candidate("DIFFERENT-LICENSE")
        ),
      IDENTITY_ERROR
    );
    assert.equal((await f.db.select().from(evidence)).length, 0);
    assert.equal((await f.db.select().from(jobs)).at(0).state, "running");
  } finally {
    await f.engine.close();
  }
});
