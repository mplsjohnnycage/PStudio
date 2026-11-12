import { Hono } from "hono";
import type { VerifyIdentity } from "./auth";

const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export interface JobSummary {
  attempt: number;
  id: string;
  maxAttempts: number;
  prospectId: string;
  state: string;
  type: string;
}

export interface JobsRouteDependencies {
  read: (
    userId: string,
    workspaceId: string
  ) => Promise<readonly JobSummary[] | null>;
  verify: VerifyIdentity;
}

/** Private API; never exposes Rivet's actor control plane directly. */
export function createJobsRoutes(deps: JobsRouteDependencies) {
  const app = new Hono();

  app.get("/workspaces/:workspaceId/jobs", async (c) => {
    const authorization = c.req.header("authorization");
    if (!authorization?.toLowerCase().startsWith("bearer ")) {
      return c.json({ error: "unauthorized" }, 401);
    }

    let userId: string | null = null;
    try {
      userId = await deps.verify(authorization);
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const workspaceId = c.req.param("workspaceId");
    if (!WORKSPACE_ID.test(workspaceId)) {
      return c.json({ error: "invalid_workspace_id" }, 400);
    }

    try {
      const jobs = await deps.read(userId, workspaceId);
      if (jobs === null) {
        return c.json({ error: "not_found" }, 404);
      }
      return c.json({ jobs });
    } catch {
      // Deliberately do not disclose SQL error text or existence of records.
      return c.json({ error: "temporarily_unavailable" }, 503);
    }
  });

  return app;
}
