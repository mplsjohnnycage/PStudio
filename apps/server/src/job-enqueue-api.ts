import { Hono } from "hono";
import type { VerifyIdentity } from "./auth";

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

export type EnqueueResult =
  | { kind: "created"; jobId: string }
  | { kind: "not_found" }
  | { kind: "conflict" };

export interface EnqueueDependencies {
  enqueue: (
    userId: string,
    workspaceId: string,
    prospectId: string,
    idempotencyKey: string
  ) => Promise<EnqueueResult>;
  verify: VerifyIdentity;
}

/**
 * Only authenticated workspace operators can enqueue limited, non-outreach
 * enrichment jobs; membership checks happen in the database transaction.
 * There is intentionally no public Rivet, approval or external sending API.
 */
function isEnrichmentRequest(body: unknown): body is { type: "enrich" } {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === 1 &&
    "type" in body &&
    body.type === "enrich"
  );
}

export function createJobEnqueueRoutes(deps: EnqueueDependencies) {
  const app = new Hono();
  app.post("/workspaces/:workspaceId/prospects/:prospectId/jobs", async (c) => {
    let userId: string | null = null;
    try {
      userId = await deps.verify(c.req.header("authorization"));
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const workspaceId = c.req.param("workspaceId");
    const prospectId = c.req.param("prospectId");
    const key = c.req.header("Idempotency-Key");
    if (!(RESOURCE_ID.test(workspaceId) && RESOURCE_ID.test(prospectId))) {
      return c.json({ error: "invalid_resource_id" }, 400);
    }
    if (!(key && IDEMPOTENCY_KEY.test(key))) {
      return c.json({ error: "invalid_idempotency_key" }, 400);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (!isEnrichmentRequest(body)) {
      return c.json({ error: "unsupported_job_type" }, 400);
    }

    try {
      const result = await deps.enqueue(userId, workspaceId, prospectId, key);
      if (result.kind === "not_found") {
        return c.json({ error: "not_found" }, 404);
      }
      if (result.kind === "conflict") {
        return c.json({ error: "conflict" }, 409);
      }
      return c.json({ jobId: result.jobId, state: "queued" }, 202);
    } catch {
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });
  return app;
}
