import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AgentMailClient } from "./agentmail-client";
import type { VerifyIdentity } from "./auth";

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OFFSET_DATE_TIME = /(?:Z|[+-]\d\d:\d\d)$/;
const LOCAL_DATE_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/;
const createEventSchema = z.strictObject({
  clientId: z.uuid(),
  end: z.string().regex(LOCAL_DATE_TIME),
  prospectId: z.string().regex(RESOURCE_ID),
  start: z.string().regex(LOCAL_DATE_TIME),
  timezone: z.literal("America/Chicago"),
  title: z.string().trim().min(3).max(150).optional(),
});
export interface AgentMailRoutesDependencies {
  assignedWorkspaceId?: string;
  authorize: (userId: string, workspaceId: string) => Promise<boolean>;
  client?: AgentMailClient | null;
  prospectExists: (
    userId: string,
    workspaceId: string,
    prospectId: string
  ) => Promise<boolean>;
  verify: VerifyIdentity;
}

/** Explicitly bind one server-side inbox to one workspace to prevent cross-tenant mail reads. */
export function createAgentMailRoutes(deps: AgentMailRoutesDependencies) {
  const app = new Hono();
  async function access(
    c: Context
  ): Promise<{ userId: string; workspaceId: string } | Response> {
    const header = c.req.header("authorization");
    if (!header?.toLowerCase().startsWith("bearer ")) {
      return c.json({ error: "unauthorized" }, 401);
    }
    let userId: string | null;
    try {
      userId = await deps.verify(header);
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const workspaceId = c.req.param("workspaceId") ?? "";
    if (!RESOURCE_ID.test(workspaceId)) {
      return c.json({ error: "invalid_workspace_id" }, 400);
    }
    try {
      if (!(await deps.authorize(userId, workspaceId))) {
        return c.json({ error: "not_found" }, 404);
      }
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
    if (workspaceId !== deps.assignedWorkspaceId) {
      return deps.assignedWorkspaceId
        ? c.json({ error: "not_found" }, 404)
        : c.json({ error: "integration_not_configured" }, 503);
    }
    if (!deps.client) {
      return c.json({ error: "integration_not_configured" }, 503);
    }
    return { userId, workspaceId };
  }

  app.get("/workspaces/:workspaceId/agentmail/threads", async (c) => {
    const allowed = await access(c);
    if (allowed instanceof Response) {
      return allowed;
    }
    try {
      return c.json({ threads: await deps.client?.listThreads() });
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });
  app.get("/workspaces/:workspaceId/agentmail/threads/:threadId", async (c) => {
    const allowed = await access(c);
    if (allowed instanceof Response) {
      return allowed;
    }
    const threadId = c.req.param("threadId");
    if (!(threadId && RESOURCE_ID.test(threadId))) {
      return c.json({ error: "invalid_resource_id" }, 400);
    }
    try {
      return c.json({ messages: await deps.client?.getThread(threadId) });
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });
  app.get("/workspaces/:workspaceId/agentmail/agenda", async (c) => {
    const allowed = await access(c);
    if (allowed instanceof Response) {
      return allowed;
    }
    const after = c.req.query("after") ?? "";
    const before = c.req.query("before") ?? "";
    const from = Date.parse(after);
    const to = Date.parse(before);
    if (
      !(
        Number.isFinite(from) &&
        Number.isFinite(to) &&
        to > from &&
        to - from <= 90 * 86_400_000 &&
        OFFSET_DATE_TIME.test(after) &&
        OFFSET_DATE_TIME.test(before)
      )
    ) {
      return c.json({ error: "invalid_input" }, 400);
    }
    try {
      return c.json({ events: await deps.client?.getAgenda(after, before) });
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });
  app.post("/workspaces/:workspaceId/agentmail/events", async (c) => {
    const allowed = await access(c);
    if (allowed instanceof Response) {
      return allowed;
    }
    let value: unknown;
    try {
      const raw = await c.req.text();
      if (raw.length > 1200) {
        return c.json({ error: "invalid_input" }, 400);
      }
      value = JSON.parse(raw);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const parsed = createEventSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: "invalid_input" }, 400);
    }
    const { data } = parsed;
    const duration = Date.parse(`${data.end}Z`) - Date.parse(`${data.start}Z`);
    if (
      !(
        Number.isFinite(duration) &&
        duration >= 15 * 60_000 &&
        duration <= 2 * 3_600_000
      )
    ) {
      return c.json({ error: "invalid_input" }, 400);
    }
    try {
      if (
        !(await deps.prospectExists(
          allowed.userId,
          allowed.workspaceId,
          data.prospectId
        ))
      ) {
        return c.json({ error: "not_found" }, 404);
      }
      const event = await deps.client?.createEvent({
        clientId: data.clientId,
        end: data.end,
        prospectId: data.prospectId,
        start: data.start,
        timezone: data.timezone,
        title: data.title ?? "Prospect call hold",
        workspaceId: allowed.workspaceId,
      });
      return c.json({ event }, 201);
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });
  return app;
}
