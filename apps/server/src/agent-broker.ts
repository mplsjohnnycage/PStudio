import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { VerifyIdentity } from "./auth";

const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PROMPT = z.strictObject({
  requestId: z.uuid().optional(),
  text: z.string().trim().min(1).max(2500),
});
const CALLBACK = z.strictObject({
  redirectUrl: z.url().max(4096),
});

export interface AgentBrowserEvent {
  createdAt: Date;
  id: string;
  prospectId: string | null;
  type: string;
  view: string | null;
}
export interface AgentBrokerAdapter {
  readonly available: boolean;
  connected: (userId: string) => Promise<boolean>;
  loginFinish: (userId: string, redirectUrl: string) => Promise<void>;
  loginStart: (userId: string) => Promise<string>;
  planEnabled: (userId: string) => boolean;
  prompt: (
    userId: string,
    workspaceId: string,
    text: string,
    requestId: string
  ) => Promise<{ status: string; text?: string; reason?: string }>;
}
export interface AgentRoutesDependencies {
  authorize: (userId: string, workspaceId: string) => Promise<boolean>;
  broker: AgentBrokerAdapter;
  events: (
    userId: string,
    workspaceId: string,
    after: Date
  ) => Promise<AgentBrowserEvent[] | null>;
  verify: VerifyIdentity;
}

async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<T | null> {
  try {
    const raw = await request.text();
    if (raw.length > 6000) {
      return null;
    }
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function validCallback(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname === "/auth/callback" &&
      url.searchParams.has("code") &&
      url.searchParams.has("state") &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

/** All calls require a fresh Neon Auth JWT and owner/operator membership. */
export function createAgentRoutes(deps: AgentRoutesDependencies) {
  const app = new Hono<{
    Variables: { agentUserId: string; agentWorkspaceId: string };
  }>();
  app.use("/workspaces/:workspaceId/agent/*", async (c, next) => {
    let userId: string | null;
    try {
      userId = await deps.verify(c.req.header("authorization"));
    } catch {
      userId = null;
    }
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const workspaceId = c.req.param("workspaceId") ?? "";
    if (!WORKSPACE_ID.test(workspaceId)) {
      return c.json({ error: "invalid_workspace_id" }, 400);
    }
    try {
      if (!(await deps.authorize(userId, workspaceId))) {
        return c.json({ error: "not_found" }, 404);
      }
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
    c.set("agentUserId", userId);
    c.set("agentWorkspaceId", workspaceId);
    await next();
  });

  app.get("/workspaces/:workspaceId/agent/status", async (c) => {
    if (!deps.broker.available) {
      return c.json({
        available: false,
        chatgptConnected: false,
        planEnabled: false,
        reason: "private_rivet_not_configured",
      });
    }
    if (!deps.broker.planEnabled(c.get("agentUserId"))) {
      return c.json(
        {
          available: true,
          chatgptConnected: false,
          planEnabled: false,
          reason: "hosted_chatgpt_plan_not_enabled",
        },
        200,
        { "Cache-Control": "no-store" }
      );
    }
    try {
      return c.json({
        available: true,
        chatgptConnected: await deps.broker.connected(c.get("agentUserId")),
        planEnabled: true,
      });
    } catch {
      return c.json({
        available: false,
        chatgptConnected: false,
        planEnabled: true,
        reason: "private_rivet_unavailable",
      });
    }
  });

  app.get("/workspaces/:workspaceId/agent/events", async (c) => {
    const after = c.req.query("after");
    if (!after || after.length > 40) {
      return c.json({ error: "invalid_cursor" }, 400);
    }
    const date = new Date(after);
    if (Number.isNaN(date.getTime())) {
      return c.json({ error: "invalid_cursor" }, 400);
    }
    try {
      const events = await deps.events(
        c.get("agentUserId"),
        c.get("agentWorkspaceId"),
        date
      );
      return events === null
        ? c.json({ error: "not_found" }, 404)
        : c.json({ events }, 200, { "Cache-Control": "no-store" });
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });

  app.post("/workspaces/:workspaceId/agent/chatgpt/start", async (c) => {
    if (
      deps.broker.available &&
      !deps.broker.planEnabled(c.get("agentUserId"))
    ) {
      return c.json({ error: "hosted_chatgpt_plan_not_enabled" }, 503);
    }
    if (!deps.broker.available) {
      return c.json({ error: "private_rivet_not_configured" }, 503);
    }
    try {
      const authorizationUrl = await deps.broker.loginStart(
        c.get("agentUserId")
      );
      const url = new URL(authorizationUrl);
      if (url.protocol !== "https:") {
        return c.json({ error: "unexpected_authorization_url" }, 502);
      }
      return c.json({ authorizationUrl }, 200, { "Cache-Control": "no-store" });
    } catch {
      return c.json({ error: "chatgpt_login_unavailable" }, 503);
    }
  });

  app.post("/workspaces/:workspaceId/agent/chatgpt/finish", async (c) => {
    if (
      deps.broker.available &&
      !deps.broker.planEnabled(c.get("agentUserId"))
    ) {
      return c.json({ error: "hosted_chatgpt_plan_not_enabled" }, 503);
    }
    if (!deps.broker.available) {
      return c.json({ error: "private_rivet_not_configured" }, 503);
    }
    const input = await parseJson(c.req.raw, CALLBACK);
    if (!(input && validCallback(input.redirectUrl))) {
      return c.json({ error: "invalid_callback" }, 400);
    }
    try {
      await deps.broker.loginFinish(c.get("agentUserId"), input.redirectUrl);
      return c.json({ connected: true });
    } catch {
      return c.json({ error: "chatgpt_consent_failed" }, 503);
    }
  });

  app.post("/workspaces/:workspaceId/agent/prompt", async (c) => {
    if (
      deps.broker.available &&
      !deps.broker.planEnabled(c.get("agentUserId"))
    ) {
      return c.json({ error: "hosted_chatgpt_plan_not_enabled" }, 503);
    }
    if (!deps.broker.available) {
      return c.json({ error: "private_rivet_not_configured" }, 503);
    }
    const parsed = await parseJson(c.req.raw, PROMPT);
    if (!parsed) {
      return c.json({ error: "invalid_input" }, 400);
    }
    try {
      const result = await deps.broker.prompt(
        c.get("agentUserId"),
        c.get("agentWorkspaceId"),
        parsed.text,
        parsed.requestId ?? randomUUID()
      );
      return c.json(result, 200, { "Cache-Control": "no-store" });
    } catch {
      return c.json({ error: "agent_temporarily_unavailable" }, 503);
    }
  });
  return app;
}
