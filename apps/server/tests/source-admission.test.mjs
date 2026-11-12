import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { admitSourcedProspect } from "../../../packages/db/src/admission-queries.ts";
import {
  claimEvidence,
  claims,
  evidence,
  prospectExternalIds,
  prospects,
  workspaceMemberships,
  workspaces,
} from "../../../packages/db/src/schema/index.ts";

const PROSPECT_ID = /^prospect_/;

const source = {
  externalId: "TLIC22572",
  name: "EXCELSIOR PAINT & DESIGN",
  physicalAddress: "701 Highway 7, Excelsior, MN 55331",
  provider: "mpls_residential_specialty",
  reportedClaims: [
    { field: "licenseNumber", value: "TLIC22572" },
    { field: "licenseExpirationDate", value: "2023-12-01" },
  ],
  retrievedAt: new Date("2026-11-12T18:00:00Z"),
  sourceExcerpt: JSON.stringify({
    dbaName: "EXCELSIOR PAINT & DESIGN",
    expirationDate: 1_701_475_199_000,
    licenseNumber: "TLIC22572",
  }),
  sourceTitle:
    "City of Minneapolis residential specialty trade license record (legacy)",
  sourceUri:
    "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Residential_Specialty/FeatureServer/0/query",
};

test("sourced admission is tenant-scoped, repeat-safe, and links every reported claim to immutable evidence", async () => {
  const engine = new PGlite();
  try {
    await [
      "0000_fluffy_thunderbolt_ross",
      "0001_lush_mister_sinister",
      "0002_elite_mauler",
      "0003_lazy_morg",
    ].reduce(async (previous, migration) => {
      await previous;
      return engine.exec(
        readFileSync(
          new URL(
            `../../../packages/db/src/migrations/${migration}.sql`,
            import.meta.url
          ),
          "utf8"
        )
      );
    }, Promise.resolve());
    const db = drizzle(engine);
    const ws = `ws_${randomUUID()}`,
      ws2 = `ws_${randomUUID()}`,
      user = `user_${randomUUID()}`;
    await db.insert(workspaces).values([
      { id: ws, name: "Source admission" },
      { id: ws2, name: "Second tenant" },
    ]);
    await db.insert(workspaceMemberships).values([
      { role: "owner", userId: user, workspaceId: ws },
      { role: "owner", userId: user, workspaceId: ws2 },
      { role: "viewer", userId: "viewer", workspaceId: ws },
    ]);
    assert.deepEqual(await admitSourcedProspect(db, "outsider", ws, source), {
      kind: "not_found",
    });
    assert.deepEqual(await admitSourcedProspect(db, "viewer", ws, source), {
      kind: "not_found",
    });
    const first = await admitSourcedProspect(db, user, ws, source);
    assert.equal(first.kind, "created");
    assert.match(first.prospectId, PROSPECT_ID);
    const again = await admitSourcedProspect(db, user, ws, source);
    assert.deepEqual(again, {
      kind: "duplicate",
      prospectId: first.prospectId,
    });
    const [external] = await db
      .select()
      .from(prospectExternalIds)
      .where(eq(prospectExternalIds.prospectId, first.prospectId));
    assert.equal(external.externalId, source.externalId);
    assert.equal(external.provider, source.provider);
    const [record] = await db
      .select()
      .from(prospects)
      .where(eq(prospects.id, first.prospectId));
    assert.equal(record.workspaceId, ws);
    assert.equal(record.websiteStatus, "unknown");
    assert.equal(record.websiteUrl, null);
    const stored = await db
      .select()
      .from(evidence)
      .where(eq(evidence.prospectId, first.prospectId));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].type, "external_source");
    assert.equal(stored[0].sourceUri, source.sourceUri);
    assert.equal(stored[0].excerpt, source.sourceExcerpt);
    assert.equal(stored[0].sha256.length, 64);
    assert.equal(
      stored[0].capturedAt.toISOString(),
      source.retrievedAt.toISOString()
    );
    const recordedClaims = await db
      .select()
      .from(claims)
      .where(eq(claims.prospectId, first.prospectId));
    assert.deepEqual(recordedClaims.map((c) => c.field).sort(), [
      "licenseExpirationDate",
      "licenseNumber",
      "name",
      "physicalAddress",
    ]);
    assert.equal(
      recordedClaims.every((c) => c.kind === "reported"),
      true
    );
    const linked = await db
      .select()
      .from(claimEvidence)
      .where(eq(claimEvidence.prospectId, first.prospectId));
    assert.equal(linked.length, recordedClaims.length);
    assert.equal(
      linked.every((link) => link.evidenceId === stored[0].id),
      true
    );
    const anotherTenant = await admitSourcedProspect(db, user, ws2, source);
    assert.equal(anotherTenant.kind, "created");
    assert.notEqual(anotherTenant.prospectId, first.prospectId);
  } finally {
    await engine.close();
  }
});
