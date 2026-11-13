import { Hono } from "hono";
import type { VerifyIdentity } from "./auth";

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type CreatePreviewResult =
  | { kind: "created"; previewId: string; releaseId: string; version: number }
  | { kind: "not_found" };
export interface PreviewResult {
  html: string;
  previewId: string;
  releaseId: string;
  version: number;
}
export interface PreviewHistoryEntry {
  createdAt: Date;
  expiresAt: Date;
  previewId: string;
  releaseId: string;
  sha256: string;
  state: string;
  version: number;
}
export interface PreviewsDependencies {
  create: (
    userId: string,
    workspaceId: string,
    prospectId: string
  ) => Promise<CreatePreviewResult>;
  list: (
    userId: string,
    workspaceId: string,
    prospectId: string
  ) => Promise<readonly PreviewHistoryEntry[] | null>;
  read: (
    userId: string,
    workspaceId: string,
    previewId: string
  ) => Promise<PreviewResult | null>;
  verify: VerifyIdentity;
}

export function createPreviewsRoutes(deps: PreviewsDependencies) {
  const app = new Hono();
  async function authorize(header: string | undefined) {
    try {
      return await deps.verify(header);
    } catch {
      return null;
    }
  }
  app.post(
    "/workspaces/:workspaceId/prospects/:prospectId/previews",
    async (c) => {
      const userId = await authorize(c.req.header("authorization"));
      if (!userId) {
        return c.json({ error: "unauthorized" }, 401);
      }
      const { workspaceId, prospectId } = c.req.param();
      if (!(RESOURCE_ID.test(workspaceId) && RESOURCE_ID.test(prospectId))) {
        return c.json({ error: "invalid_resource_id" }, 400);
      }
      try {
        const result = await deps.create(userId, workspaceId, prospectId);
        return result.kind === "not_found"
          ? c.json({ error: "not_found" }, 404)
          : c.json(
              {
                previewId: result.previewId,
                releaseId: result.releaseId,
                state: "draft",
                version: result.version,
              },
              201
            );
      } catch {
        return c.json({ error: "temporarily_unavailable" }, 503);
      }
    }
  );
  app.get(
    "/workspaces/:workspaceId/prospects/:prospectId/previews",
    async (c) => {
      const userId = await authorize(c.req.header("authorization"));
      if (!userId) {
        return c.json({ error: "unauthorized" }, 401);
      }
      const { workspaceId, prospectId } = c.req.param();
      if (!(RESOURCE_ID.test(workspaceId) && RESOURCE_ID.test(prospectId))) {
        return c.json({ error: "invalid_resource_id" }, 400);
      }
      try {
        const history = await deps.list(userId, workspaceId, prospectId);
        return history === null
          ? c.json({ error: "not_found" }, 404)
          : c.json({ previews: history });
      } catch {
        return c.json({ error: "temporarily_unavailable" }, 503);
      }
    }
  );
  app.get("/workspaces/:workspaceId/previews/:previewId", async (c) => {
    const userId = await authorize(c.req.header("authorization"));
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const { workspaceId, previewId } = c.req.param();
    if (!(RESOURCE_ID.test(workspaceId) && RESOURCE_ID.test(previewId))) {
      return c.json({ error: "invalid_resource_id" }, 400);
    }
    try {
      const result = await deps.read(userId, workspaceId, previewId);
      return result ? c.json(result) : c.json({ error: "not_found" }, 404);
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });
  return app;
}
