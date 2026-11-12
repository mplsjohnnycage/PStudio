import { Hono } from "hono";
import { z } from "zod";
import type { VerifyIdentity } from "./auth";

const Input = z.strictObject({ name: z.string().trim().min(2).max(160) });
export interface WorkspaceSummary {
  id: string;
  name: string;
  role: string;
}
export interface WorkspacesDependencies {
  create: (
    userId: string,
    name: string
  ) => Promise<{ kind: "created"; id: string } | { kind: "limit_reached" }>;
  list: (userId: string) => Promise<readonly WorkspaceSummary[]>;
  verify: VerifyIdentity;
}
export function createWorkspacesRoutes(deps: WorkspacesDependencies) {
  const app = new Hono();
  async function authenticate(header: string | undefined) {
    try {
      return await deps.verify(header);
    } catch {
      return null;
    }
  }
  app.get("/workspaces", async (c) => {
    const userId = await authenticate(c.req.header("authorization"));
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }
    try {
      const rows = await deps.list(userId);
      return c.json({ workspaces: rows });
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });
  app.post("/workspaces", async (c) => {
    const userId = await authenticate(c.req.header("authorization"));
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }
    let input: unknown;
    try {
      const raw = await c.req.text();
      if (raw.length > 1024) {
        return c.json({ error: "invalid_input" }, 400);
      }
      input = JSON.parse(raw);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const valid = Input.safeParse(input);
    if (!valid.success) {
      return c.json({ error: "invalid_input" }, 400);
    }
    try {
      const result = await deps.create(userId, valid.data.name);
      return result.kind === "created"
        ? c.json(
            { name: valid.data.name, role: "owner", workspaceId: result.id },
            201
          )
        : c.json({ error: "limit_reached" }, 429);
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });
  return app;
}
