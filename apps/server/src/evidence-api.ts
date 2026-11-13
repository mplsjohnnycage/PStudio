import { Hono } from "hono";
import type { VerifyIdentity } from "./auth";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
export interface EvidenceRoutesDependencies {
  read: (
    userId: string,
    workspaceId: string,
    prospectId: string
  ) => Promise<{
    evidence: readonly {
      capturedAt: Date;
      id: string;
      sha256: string;
      sourceUri: string;
      title: string;
      type: string;
    }[];
    claims: readonly {
      field: string;
      id: string;
      kind: string;
      observedAt: Date;
      value: string | null;
    }[];
  } | null>;
  verify: VerifyIdentity;
}

/** No source/claim data is returned without a genuine JWT and live membership. */
export function createEvidenceRoutes(deps: EvidenceRoutesDependencies) {
  const app = new Hono();
  app.get(
    "/workspaces/:workspaceId/prospects/:prospectId/evidence",
    async (c) => {
      let userId: string | null;
      try {
        userId = await deps.verify(c.req.header("authorization"));
      } catch {
        userId = null;
      }
      if (!userId) {
        return c.json({ error: "unauthorized" }, 401);
      }
      const { workspaceId, prospectId } = c.req.param();
      if (!(ID.test(workspaceId) && ID.test(prospectId))) {
        return c.json({ error: "invalid_resource_id" }, 400);
      }
      try {
        const result = await deps.read(userId, workspaceId, prospectId);
        return result ? c.json(result) : c.json({ error: "not_found" }, 404);
      } catch {
        return c.json({ error: "temporarily_unavailable" }, 503);
      }
    }
  );
  return app;
}
