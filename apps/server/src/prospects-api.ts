import { Hono } from "hono";
import { z } from "zod";
import type { VerifyIdentity } from "./auth";

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const externalUrl = z
  .url()
  .max(2048)
  .refine((url) => {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  });
export const prospectInput = z.strictObject({
  name: z.string().trim().min(1).max(160),
  physicalAddress: z.string().trim().min(1).max(300).optional(),
  sourceUri: externalUrl.optional(),
  websiteUrl: externalUrl.optional(),
});
export type ProspectInput = z.infer<typeof prospectInput>;

export interface ProspectSummary {
  id: string;
  name: string;
  physicalAddress: string | null;
  stage: string;
  websiteStatus: string;
  websiteUrl: string | null;
}
export interface ProspectsDependencies {
  create: (
    userId: string,
    workspaceId: string,
    input: ProspectInput
  ) => Promise<{ kind: "created"; id: string } | { kind: "not_found" }>;
  list: (
    userId: string,
    workspaceId: string
  ) => Promise<readonly ProspectSummary[] | null>;
  verify: VerifyIdentity;
}

/** The authenticated user ID is always from a verified Neon JWT, never request input. */
export function createProspectsRoutes(deps: ProspectsDependencies) {
  const app = new Hono();
  const authenticate = async (header: string | undefined) => {
    try {
      return await deps.verify(header);
    } catch {
      return null;
    }
  };
  app.get("/workspaces/:workspaceId/prospects", async (c) => {
    const userId = await authenticate(c.req.header("authorization"));
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const workspaceId = c.req.param("workspaceId");
    if (!RESOURCE_ID.test(workspaceId)) {
      return c.json({ error: "invalid_workspace_id" }, 400);
    }
    try {
      const items = await deps.list(userId, workspaceId);
      return items === null
        ? c.json({ error: "not_found" }, 404)
        : c.json({ prospects: items });
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });

  app.post("/workspaces/:workspaceId/prospects", async (c) => {
    const userId = await authenticate(c.req.header("authorization"));
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const workspaceId = c.req.param("workspaceId");
    if (!RESOURCE_ID.test(workspaceId)) {
      return c.json({ error: "invalid_workspace_id" }, 400);
    }
    let body: unknown;
    try {
      const raw = await c.req.text();
      if (raw.length > 4096) {
        return c.json({ error: "invalid_input" }, 400);
      }
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const parsed = prospectInput.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input" }, 400);
    }
    try {
      const created = await deps.create(userId, workspaceId, parsed.data);
      if (created.kind === "not_found") {
        return c.json({ error: "not_found" }, 404);
      }
      return c.json({ prospectId: created.id, stage: "discovered" }, 201);
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });
  return app;
}
