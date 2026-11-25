import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { lookupAdmittedOverture } from "../../../apps/worker/src/overture-source.ts";
import { admitSourcedProspect } from "../src/admission-queries.ts";
import {
  evidence,
  workspaceMemberships,
  workspaces,
} from "../src/schema/index.ts";

const uri = "https://docs.overturemaps.org/gers/registry/";
const title = "Overture Maps Places — source-reported business record";
const externalId = "a3a3a3a3-2222-4444-8888-abcdefabcdef";
const migrations = [
  "0000_fluffy_thunderbolt_ross",
  "0001_lush_mister_sinister",
  "0002_elite_mauler",
  "0003_lazy_morg",
  "0004_fine_ender_wiggin",
];

async function fixture(t, excerpt) {
  const engine = new PGlite();
  t.after(() => engine.close());
  for (const name of migrations) {
    // biome-ignore lint/performance/noAwaitInLoops: migrations must apply in order
    await engine.exec(
      readFileSync(
        new URL(`../src/migrations/${name}.sql`, import.meta.url),
        "utf8"
      )
    );
  }
  const db = drizzle(engine);
  await db.insert(workspaces).values({ id: "workspace", name: "Test" });
  await db
    .insert(workspaceMemberships)
    .values({ role: "owner", userId: "owner", workspaceId: "workspace" });
  const result = await admitSourcedProspect(db, "owner", "workspace", {
    externalId,
    name: "Source Fixture",
    physicalAddress: "100 Main St",
    provider: "overture_places",
    retrievedAt: new Date("2026-11-01T00:00:00Z"),
    sourceExcerpt: excerpt,
    sourceTitle: title,
    sourceUri: uri,
  });
  return { db, prospectId: result.prospectId };
}

function snapshot() {
  return JSON.stringify({
    observation: {
      address: "100 Main St",
      category: "plumber",
      latitude: 44.95,
      longitude: -93.1,
      name: "Source Fixture",
      overture_release: "2026-10-21.0",
      source_id: externalId,
    },
    website_verification: "unknown",
  });
}

test("Overture replay preserves source-reported location and website uncertainty despite newer unrelated evidence", async (t) => {
  const { db, prospectId } = await fixture(t, snapshot());
  const excerpt = "{}";
  await db.insert(evidence).values({
    capturedAt: new Date("2026-11-02T00:00:00Z"),
    excerpt,
    id: "unrelated",
    prospectId,
    sha256: createHash("sha256").update(`${uri}\n${excerpt}`).digest("hex"),
    sourceUri: uri,
    title: "Unrelated public source",
    type: "external_source",
  });
  const replay = await lookupAdmittedOverture(db, externalId, prospectId);
  assert.equal(replay?.sourceExcerpt, snapshot());
  assert.deepEqual(
    replay?.reportedClaims?.find(
      (item) => item.field === "websiteVerification"
    ),
    { field: "websiteVerification", value: "unknown" }
  );
  assert.deepEqual(
    replay?.reportedClaims?.find((item) => item.field === "sourceCoordinates"),
    {
      field: "sourceCoordinates",
      value: '{"latitude":44.95,"longitude":-93.1}',
    }
  );
});

test("Overture replay safely refuses malformed persisted observations", async (t) => {
  const { db, prospectId } = await fixture(t, '{"observation":null}');
  assert.equal(await lookupAdmittedOverture(db, externalId, prospectId), null);
});

test("Out-of-range coordinates remain absent from reported claims", async (t) => {
  const parsed = JSON.parse(snapshot());
  parsed.observation.latitude = 91;
  const { db, prospectId } = await fixture(t, JSON.stringify(parsed));
  const replay = await lookupAdmittedOverture(db, externalId, prospectId);
  assert.ok(replay);
  assert.equal(
    replay.reportedClaims.some((item) => item.field === "sourceCoordinates"),
    false
  );
});
