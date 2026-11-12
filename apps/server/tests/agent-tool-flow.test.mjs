// biome-ignore-all lint/performance/noAwaitInLoops: Migration replay must be sequential to preserve foreign-key dependencies.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
  agentSessionId,
  bindAgentSession,
  listWorkspaceAgentEvents,
  readAgentSession,
} from "../../../packages/db/src/agent-session-queries.ts";
import {
  workspaceMemberships,
  workspaces,
} from "../../../packages/db/src/schema/index.ts";
import { executeBoundOperatorCommand } from "../../worker/src/operator-execution.ts";

test("bound Pi agent uses the dashboard's real DB operations without trusting model identity", async () => {
  const engine = new PGlite();
  try {
    for (const name of [
      "0000_fluffy_thunderbolt_ross",
      "0001_lush_mister_sinister",
      "0002_elite_mauler",
      "0003_lazy_morg",
      "0004_fine_ender_wiggin",
      "0005_marvelous_thaddeus_ross",
    ]) {
      const sql = readFileSync(
        new URL(
          `../../../packages/db/src/migrations/${name}.sql`,
          import.meta.url
        ),
        "utf8"
      );
      await engine.exec(sql);
    }
    const db = drizzle(engine);
    const userId = "owner-test";
    const workspaceId = "workspace_agent_test";
    const other = "workspace_other_test";
    await db.insert(workspaces).values([
      { id: workspaceId, name: "Agent test workspace" },
      { id: other, name: "Other test workspace" },
    ]);
    await db.insert(workspaceMemberships).values({
      role: "owner",
      userId,
      workspaceId,
    });
    const binding = { userId, workspaceId };
    assert.equal(await bindAgentSession(db, userId, workspaceId), "bound");
    assert.equal(
      await bindAgentSession(db, "intruder", workspaceId),
      "unauthorized"
    );
    assert.ok(
      (await readAgentSession(db, agentSessionId(userId, workspaceId)))
        ?.role === "owner"
    );
    const query = (tool, input) =>
      executeBoundOperatorCommand(db, binding, { input, tool });
    assert.deepEqual(await query("list_jobs", { workspaceId: other }), {
      error: "not_found",
    });
    assert.deepEqual(
      await query("arbitrary_http", { path: "https://evil.invalid" }),
      { error: "invalid_input" }
    );
    const created = await query("create_prospect", {
      name: "Verified Agent Test",
      physicalAddress: "123 Test Avenue, Minneapolis",
      workspaceId,
    });
    assert.equal(created.kind, "created");
    const prospectId = created.id;
    const list = await query("list_prospects", { workspaceId });
    assert.equal(
      list.prospects.some((p) => p.id === prospectId),
      true
    );
    const queued = await query("enqueue_enrichment", {
      idempotencyKey: "agent-flow-test-10001",
      prospectId,
      workspaceId,
    });
    assert.equal(queued.kind, "created");
    assert.deepEqual(
      await query("enqueue_enrichment", {
        idempotencyKey: "agent-flow-test-10001",
        prospectId,
        workspaceId,
      }),
      queued
    );
    const site = await query("create_private_preview", {
      prospectId,
      workspaceId,
    });
    assert.equal(site.kind, "created");
    const review = await query("request_review", {
      previewId: site.previewId,
      workspaceId,
    });
    assert.equal(review.kind, "opened");
    assert.equal(
      (await query("read_review", { previewId: site.previewId, workspaceId }))
        .state,
      "pending"
    );
    assert.equal(
      (
        await query("decide_review", {
          decision: "approved",
          previewId: site.previewId,
          workspaceId,
        })
      ).error,
      "owner_confirmation_required"
    );
    const moved = await query("navigate", { view: "studio" });
    assert.equal(moved.kind, "saved");
    const focused = await query("select_prospect", { prospectId });
    assert.equal(focused.kind, "saved");
    const events = await listWorkspaceAgentEvents(
      db,
      userId,
      workspaceId,
      new Date(0)
    );
    assert.equal(events.length, 2);
    assert.equal(events[0].view, "studio");
    assert.equal(events[1].prospectId, prospectId);
    await db
      .delete(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId)
        )
      );
    assert.equal(
      await readAgentSession(db, agentSessionId(userId, workspaceId)),
      null
    );
    assert.deepEqual(await query("list_prospects", { workspaceId }), {
      error: "not_authorized",
    });
    assert.equal(
      await listWorkspaceAgentEvents(db, userId, workspaceId, new Date(0)),
      null
    );
  } finally {
    await engine.close();
  }
});
