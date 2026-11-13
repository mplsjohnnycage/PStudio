import type { PreviewDesignOptions } from "@prospect-studio/db/preview-render";
import { Hono } from "hono";
import { z } from "zod";
import type { VerifyIdentity } from "./auth";

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const designInput = z.strictObject({
  design: z.enum(["editorial", "atelier", "modern"]).optional(),
  headline: z.string().trim().min(1).max(140).optional(),
  introduction: z.string().trim().min(1).max(500).optional(),
});

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
    prospectId: string,
    designOptions?: PreviewDesignOptions
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
      let requested: unknown;
      try {
        const body = await c.req.text();
        if (body.length > 1500) {
          return c.json({ error: "invalid_input" }, 400);
        }
        requested = body.trim() ? JSON.parse(body) : {};
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }
      const parsed = designInput.safeParse(requested);
      if (!parsed.success) {
        return c.json({ error: "invalid_input" }, 400);
      }
      try {
        const result = await deps.create(
          userId,
          workspaceId,
          prospectId,
          parsed.data
        );
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
