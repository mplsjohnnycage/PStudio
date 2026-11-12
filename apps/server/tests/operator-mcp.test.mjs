// biome-ignore-all lint/performance/noAwaitInLoops: Migration replay must be sequential to preserve foreign-key dependencies.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { drizzle } from "drizzle-orm/pglite";
import { listWorkspaceAgentEvents } from "../../../packages/db/src/agent-session-queries.ts";
import {
  workspaceMemberships,
  workspaces,
} from "../../../packages/db/src/schema/index.ts";
import {
  createOperatorMcpRoutes,
  createOperatorMcpServer,
} from "../src/operator-mcp.ts";

async function call(method, params = {}, db = {}, userId = "u-test") {
  const server = createOperatorMcpServer(db, userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  const req = new Request("https://mcp.example.test/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-11-25",
    },
    method: "POST",
  });
  const response = await transport.handleRequest(req);
  const payload = response ? await response.json() : null;
  await transport.close();
  await server.close();
  return { payload, status: response?.status };
}
test("MCP server negotiates a stateless initialize request", async () => {
  const { status, payload } = await call("initialize", {
    capabilities: {},
    clientInfo: { name: "prospect-studio-test", version: "1.0.0" },
    protocolVersion: "2025-11-25",
  });
  assert.equal(status, 200);
  assert.equal(payload.result.serverInfo.name, "prospect-studio-operator");
});
test("MCP exposes the exact existing operator tools", async () => {
  const { status, payload } = await call("tools/list");
  assert.equal(status, 200);
  assert.equal(payload.result.tools.length, 15);
  assert.ok(
    payload.result.tools.some(
      (t) =>
        t.name === "enqueue_enrichment" && t.annotations.readOnlyHint === false
    )
  );
  assert.ok(
    payload.result.tools.some(
      (t) => t.name === "list_prospects" && t.annotations.readOnlyHint === true
    )
  );
});
test("no OAuth config means the public MCP endpoint is unavailable", async () => {
  const app = createOperatorMcpRoutes({ database: {} });
  const response = await app.request("https://mcp.example.test/mcp", {
    body: "{}",
    method: "POST",
  });
  assert.equal(response.status, 503);
});

test("MCP tool calls use OAuth subject, enforce membership and move dashboard", async () => {
  const engine = new PGlite();
  try {
    for (const file of [
      "0000_fluffy_thunderbolt_ross",
      "0001_lush_mister_sinister",
      "0002_elite_mauler",
      "0003_lazy_morg",
      "0004_fine_ender_wiggin",
      "0005_marvelous_thaddeus_ross",
    ]) {
      const sql = readFileSync(
        new URL(
          `../../../packages/db/src/migrations/${file}.sql`,
          import.meta.url
        ),
        "utf8"
      );
      await engine.exec(sql);
    }
    const db = drizzle(engine);
    const workspaceId = "workspace_mcp_test",
      userId = "owner_for_mcp";
    await db.insert(workspaces).values({ id: workspaceId, name: "MCP Test" });
    await db
      .insert(workspaceMemberships)
      .values({ role: "owner", userId, workspaceId });
    const requested = {
      arguments: { name: "MCP Example", workspaceId },
      name: "create_prospect",
    };
    const created = await call("tools/call", requested, db, userId);
    assert.equal(created.status, 200);
    const prospectResult = JSON.parse(created.payload.result.content[0].text);
    assert.equal(prospectResult.kind, "created");
    const move = await call(
      "tools/call",
      { arguments: { view: "studio", workspaceId }, name: "navigate" },
      db,
      userId
    );
    assert.equal(JSON.parse(move.payload.result.content[0].text).kind, "saved");
    const events = await listWorkspaceAgentEvents(
      db,
      userId,
      workspaceId,
      new Date(0)
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].view, "studio");
    const approval = await call(
      "tools/call",
      {
        arguments: {
          decision: "approved",
          previewId: "preview_dummy",
          workspaceId,
        },
        name: "decide_review",
      },
      db,
      userId
    );
    assert.equal(
      JSON.parse(approval.payload.result.content[0].text).error,
      "owner_confirmation_required"
    );
    const outsider = await call("tools/call", requested, db, "other_user");
    assert.equal(
      JSON.parse(outsider.payload.result.content[0].text).kind,
      "not_found"
    );
    const foreign = await call(
      "tools/call",
      {
        arguments: { view: "studio", workspaceId: "workspace_other" },
        name: "navigate",
      },
      db,
      userId
    );
    assert.equal(
      JSON.parse(foreign.payload.result.content[0].text).error,
      "not_found"
    );
  } finally {
    await engine.close();
  }
});
