import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
  createWorkspacePreview,
  listWorkspacePreviews,
  readPrivatePreview,
} from "../../../packages/db/src/preview-queries.ts";
import { createWorkspaceProspect } from "../../../packages/db/src/prospect-queries.ts";
import {
  decideWorkspaceReview,
  openWorkspaceReview,
  readWorkspaceReview,
} from "../../../packages/db/src/review-queries.ts";
import {
  approvals,
  previews,
  releaseArtifacts,
  releases,
  workspaceMemberships,
  workspaces,
} from "../../../packages/db/src/schema/index.ts";

async function fixture() {
  const engine = new PGlite();
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
    owner = `owner_${randomUUID()}`;
  const operator = `op_${randomUUID()}`,
    viewer = `viewer_${randomUUID()}`;
  await db.insert(workspaces).values({ id: ws, name: "Staging review test" });
  await db.insert(workspaceMemberships).values([
    { role: "owner", userId: owner, workspaceId: ws },
    { role: "operator", userId: operator, workspaceId: ws },
    { role: "viewer", userId: viewer, workspaceId: ws },
  ]);
  const prospect = await createWorkspaceProspect(db, operator, ws, {
    name: "Reviewed Business",
    physicalAddress: "Saint Paul, Minnesota",
  });
  assert.equal(prospect.kind, "created");
  const draft = await createWorkspacePreview(db, operator, ws, prospect.id);
  assert.equal(draft.kind, "created");
  return {
    db,
    draft,
    engine,
    operator,
    owner,
    prospectId: prospect.id,
    viewer,
    ws,
  };
}

test("operator opens a durable review; only owner approves; subsequent drafts do not alter approved version", async () => {
  const f = await fixture();
  try {
    const first = await openWorkspaceReview(
      f.db,
      f.operator,
      f.ws,
      f.draft.previewId
    );
    assert.equal(first.kind, "opened");
    assert.equal(first.releaseId, f.draft.releaseId);
    assert.equal(
      (await openWorkspaceReview(f.db, f.operator, f.ws, f.draft.previewId))
        .approvalId,
      first.approvalId
    );
    assert.equal(
      (await readWorkspaceReview(f.db, f.owner, f.ws, f.draft.previewId)).state,
      "pending"
    );
    assert.deepEqual(
      await decideWorkspaceReview(
        f.db,
        f.operator,
        f.ws,
        f.draft.previewId,
        "approved"
      ),
      { kind: "not_found" }
    );
    const decided = await decideWorkspaceReview(
      f.db,
      f.owner,
      f.ws,
      f.draft.previewId,
      "approved"
    );
    assert.equal(decided.kind, "approved");
    assert.equal(decided.approvalId, first.approvalId);
    const again = await decideWorkspaceReview(
      f.db,
      f.owner,
      f.ws,
      f.draft.previewId,
      "approved"
    );
    assert.equal(again.kind, "approved");
    assert.equal(
      (await readWorkspaceReview(f.db, f.owner, f.ws, f.draft.previewId))
        .decidedBy,
      f.owner
    );
    const [approval] = await f.db
      .select()
      .from(approvals)
      .where(eq(approvals.id, first.approvalId));
    assert.equal(approval.subjectId, f.draft.previewId);
    assert.equal(approval.subjectType, "preview");
    assert.equal(approval.state, "approved");
    assert.ok(approval.decidedAt);
    const [original] = await f.db
      .select()
      .from(releaseArtifacts)
      .where(eq(releaseArtifacts.releaseId, f.draft.releaseId));
    const next = await createWorkspacePreview(
      f.db,
      f.operator,
      f.ws,
      f.prospectId
    );
    assert.equal(next.version, f.draft.version + 1);
    const [approvedRelease] = await f.db
      .select()
      .from(releases)
      .where(eq(releases.id, f.draft.releaseId));
    const [approvedPreview] = await f.db
      .select()
      .from(previews)
      .where(eq(previews.id, f.draft.previewId));
    const [untouched] = await f.db
      .select()
      .from(releaseArtifacts)
      .where(eq(releaseArtifacts.releaseId, f.draft.releaseId));
    const [newRelease] = await f.db
      .select()
      .from(releases)
      .where(eq(releases.id, next.releaseId));
    assert.equal(approvedRelease.status, "approved");
    assert.equal(approvedPreview.state, "approved");
    assert.equal(newRelease.status, "draft");
    assert.equal(untouched.sha256, original.sha256);
    assert.equal(untouched.html, original.html);
    const versions = await listWorkspacePreviews(
      f.db,
      f.owner,
      f.ws,
      f.prospectId
    );
    assert.deepEqual(
      versions.map((v) => v.version),
      [2, 1]
    );
    assert.equal(versions[0].state, "draft");
    assert.equal(versions[1].state, "approved");
    assert.equal(
      await listWorkspacePreviews(f.db, "outsider", f.ws, f.prospectId),
      null
    );
    assert.equal(
      (
        await decideWorkspaceReview(
          f.db,
          f.owner,
          f.ws,
          f.draft.previewId,
          "rejected"
        )
      ).kind,
      "conflict"
    );
    await f.db
      .update(previews)
      .set({ expiresAt: new Date(Date.now() - 86_400_000) })
      .where(eq(previews.id, f.draft.previewId));
    const preserved = await readPrivatePreview(
      f.db,
      f.owner,
      f.ws,
      f.draft.previewId
    );
    assert.equal(preserved?.releaseId, f.draft.releaseId);
    assert.equal(preserved?.html, original.html);
  } finally {
    await f.engine.close();
  }
});

test("review and approval deny outsiders and viewers and do not permit decisions before review", async () => {
  const f = await fixture();
  try {
    await Promise.all(
      [f.viewer, "outsider"].map(async (user) => {
        assert.deepEqual(
          await openWorkspaceReview(f.db, user, f.ws, f.draft.previewId),
          { kind: "not_found" }
        );
        assert.deepEqual(
          await decideWorkspaceReview(
            f.db,
            user,
            f.ws,
            f.draft.previewId,
            "approved"
          ),
          { kind: "not_found" }
        );
      })
    );
    assert.deepEqual(
      await decideWorkspaceReview(
        f.db,
        f.owner,
        f.ws,
        f.draft.previewId,
        "approved"
      ),
      { kind: "conflict" }
    );
    assert.equal(
      await readWorkspaceReview(f.db, "outsider", f.ws, f.draft.previewId),
      null
    );
    assert.equal(
      (
        await openWorkspaceReview(
          f.db,
          f.operator,
          "other-workspace",
          f.draft.previewId
        )
      ).kind,
      "not_found"
    );
    assert.equal(
      (await openWorkspaceReview(f.db, f.owner, f.ws, f.draft.previewId)).kind,
      "opened"
    );
    assert.equal(
      (
        await decideWorkspaceReview(
          f.db,
          f.owner,
          f.ws,
          f.draft.previewId,
          "rejected"
        )
      ).kind,
      "rejected"
    );
    const [release] = await f.db
      .select()
      .from(releases)
      .where(eq(releases.id, f.draft.releaseId));
    assert.equal(release.status, "rejected");
  } finally {
    await f.engine.close();
  }
});
