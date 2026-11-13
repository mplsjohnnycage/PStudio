import { Hono } from "hono";
import { z } from "zod";
import type { VerifyIdentity } from "./auth";

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const decisionSchema = z.strictObject({
  decision: z.enum(["approved", "rejected"]),
});

type Fail = { kind: "not_found" } | { kind: "conflict" };
type Open = Fail | { kind: "opened"; approvalId: string; releaseId: string };
type Decision =
  | Fail
  | { kind: "approved" | "rejected"; approvalId: string; releaseId: string };
export interface ReviewData {
  approvalId: string;
  decidedAt: Date | null;
  decidedBy: string | null;
  previewId: string;
  releaseId: string;
  state: string;
}
export interface ReviewDependencies {
  decide: (
    userId: string,
    workspaceId: string,
    previewId: string,
    decision: "approved" | "rejected"
  ) => Promise<Decision>;
  open: (
    userId: string,
    workspaceId: string,
    previewId: string
  ) => Promise<Open>;
  read: (
    userId: string,
    workspaceId: string,
    previewId: string
  ) => Promise<ReviewData | null>;
  verify: VerifyIdentity;
}

/** Review operations only modify private, unpublished website proposals. */
export function createReviewRoutes(deps: ReviewDependencies) {
  const app = new Hono();
  const path = "/workspaces/:workspaceId/previews/:previewId";
  async function authenticate(header: string | undefined) {
    try {
      return await deps.verify(header);
    } catch {
      return null;
    }
  }
  async function validated(c: {
    req: {
      header: (name: string) => string | undefined;
      param: () => Record<string, string>;
    };
  }): Promise<
    | { kind: "unauthorized" }
    | { kind: "invalid" }
    | {
        kind: "authorized";
        userId: string;
        workspaceId: string;
        previewId: string;
      }
  > {
    const userId = await authenticate(c.req.header("authorization"));
    if (!userId) {
      return { kind: "unauthorized" };
    }
    const { workspaceId = "", previewId = "" } = c.req.param();
    if (!(RESOURCE_ID.test(workspaceId) && RESOURCE_ID.test(previewId))) {
      return { kind: "invalid" };
    }
    return { kind: "authorized", previewId, userId, workspaceId };
  }

  app.get(`${path}/review`, async (c) => {
    const result = await validated(c);
    if (result.kind === "unauthorized") {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (result.kind === "invalid") {
      return c.json({ error: "invalid_resource_id" }, 400);
    }
    try {
      const record = await deps.read(
        result.userId,
        result.workspaceId,
        result.previewId
      );
      return record ? c.json(record) : c.json({ error: "not_found" }, 404);
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });

  app.post(`${path}/review`, async (c) => {
    const result = await validated(c);
    if (result.kind === "unauthorized") {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (result.kind === "invalid") {
      return c.json({ error: "invalid_resource_id" }, 400);
    }
    try {
      const created = await deps.open(
        result.userId,
        result.workspaceId,
        result.previewId
      );
      if (created.kind === "not_found") {
        return c.json({ error: "not_found" }, 404);
      }
      if (created.kind === "conflict") {
        return c.json({ error: "conflict" }, 409);
      }
      return c.json(created, 201);
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });

  app.post(`${path}/decision`, async (c) => {
    const result = await validated(c);
    if (result.kind === "unauthorized") {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (result.kind === "invalid") {
      return c.json({ error: "invalid_resource_id" }, 400);
    }
    let value: unknown;
    try {
      const body = await c.req.text();
      if (body.length > 256) {
        return c.json({ error: "invalid_input" }, 400);
      }
      value = JSON.parse(body);
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const parsed = decisionSchema.safeParse(value);
    if (!parsed.success) {
      return c.json({ error: "invalid_input" }, 400);
    }
    try {
      const decided = await deps.decide(
        result.userId,
        result.workspaceId,
        result.previewId,
        parsed.data.decision
      );
      if (decided.kind === "not_found") {
        return c.json({ error: "not_found" }, 404);
      }
      if (decided.kind === "conflict") {
        return c.json({ error: "conflict" }, 409);
      }
      return c.json(decided);
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });

  return app;
}
