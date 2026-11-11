import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  approvals,
  claimEvidence,
  claims,
  comments,
  evidence,
  jobs,
  outreachDrafts,
  previews,
  previewViewers,
  prospectExternalIds,
  prospects,
  releases,
  workspaces,
} from "../src/schema/index.ts";

test("all durable records identify their workspace or parent prospect", () => {
  assert.equal(getTableColumns(prospects).workspaceId.notNull, true);
  for (const table of [
    evidence,
    claims,
    jobs,
    releases,
    previews,
    comments,
    approvals,
    outreachDrafts,
  ]) {
    assert.equal(getTableColumns(table).prospectId.notNull, true);
  }
  assert.equal(getTableConfig(workspaces).name, "workspaces");
});

test("external provider identities are keyed separately from canonical prospects", () => {
  const config = getTableConfig(prospectExternalIds);
  const cols = getTableColumns(prospectExternalIds);
  assert.equal(cols.provider.notNull, true);
  assert.equal(cols.externalId.notNull, true);
  assert.ok(
    config.uniqueConstraints.length +
      config.indexes.filter((x) => x.config?.unique).length >
      0
  );
});

test("evidence stores source URI, digest and capture time with a foreign key", () => {
  const cols = getTableColumns(evidence);
  assert.equal(cols.sourceUri.notNull, true);
  assert.equal(cols.sha256.notNull, true);
  assert.equal(cols.capturedAt.notNull, true);
  assert.ok(getTableConfig(evidence).foreignKeys.length > 0);
});

test("claims have a prospect-scoped evidence join rather than unvalidated array IDs", () => {
  const cols = getTableColumns(claimEvidence);
  assert.equal(cols.prospectId.notNull, true);
  assert.equal(cols.claimId.notNull, true);
  assert.equal(cols.evidenceId.notNull, true);
  assert.ok(getTableConfig(claimEvidence).foreignKeys.length >= 2);
  assert.ok(getTableConfig(claims).checks.length > 0);
});

test("releases and annotations preserve build-specific version identities", () => {
  assert.equal(getTableColumns(releases).version.notNull, true);
  assert.equal(getTableColumns(previews).releaseId.notNull, true);
  assert.equal(getTableColumns(comments).releaseId.notNull, true);
  assert.equal(getTableColumns(previewViewers).viewerId.notNull, true);
  assert.ok(getTableConfig(comments).foreignKeys.length >= 2);
});

test("approvals and outreach drafts are separate persisted entities", () => {
  assert.equal(getTableColumns(approvals).subjectId.notNull, true);
  assert.equal(getTableColumns(approvals).decidedBy.notNull, false);
  assert.equal(getTableColumns(outreachDrafts).state.notNull, true);
  assert.ok(getTableConfig(approvals).checks.length > 0);
});

test("jobs retain retry limits and state with database checks", () => {
  const cols = getTableColumns(jobs);
  assert.equal(cols.attempt.notNull, true);
  assert.equal(cols.maxAttempts.notNull, true);
  assert.ok(getTableConfig(jobs).checks.length > 0);
});
