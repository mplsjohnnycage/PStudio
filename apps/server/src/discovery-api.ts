import type {
  SourceAdmission,
  SourceCandidate,
} from "@prospect-studio/db/admission-queries";
import { Hono } from "hono";
import { z } from "zod";
import type { VerifyIdentity } from "./auth";

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SEARCH = /^[A-Za-z0-9][A-Za-z0-9 &.,-]{2,79}$/;
const inputSchema = z.strictObject({
  externalId: z.string().min(2).max(200).optional(),
  query: z.string().trim().min(3).max(80).regex(SEARCH),
});
export interface DiscoveryDependencies {
  admit: (
    userId: string,
    workspaceId: string,
    candidate: SourceCandidate
  ) => Promise<SourceAdmission>;
  authorize: (userId: string, workspaceId: string) => Promise<boolean>;
  search: (query: string) => Promise<SourceCandidate[]>;
  verify: VerifyIdentity;
}

/** Discovery reads only a fixed public provider and writes via tenant-checked admission. */
export function createDiscoveryRoutes(deps: DiscoveryDependencies) {
  const app = new Hono();
  app.post(
    "/workspaces/:workspaceId/discover/minneapolis-license",
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: explicit fail-closed auth, provider, selection and persistence gates
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
      const workspaceId = c.req.param("workspaceId") ?? "";
      if (!RESOURCE_ID.test(workspaceId)) {
        return c.json({ error: "invalid_resource_id" }, 400);
      }
      try {
        if (!(await deps.authorize(userId, workspaceId))) {
          return c.json({ error: "not_found" }, 404);
        }
      } catch {
        return c.json({ error: "temporarily_unavailable" }, 503);
      }
      let body: unknown;
      try {
        const raw = await c.req.text();
        if (raw.length > 512) {
          return c.json({ error: "invalid_input" }, 400);
        }
        body = JSON.parse(raw);
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }
      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "invalid_input" }, 400);
      }
      let found: SourceCandidate[];
      try {
        found = await deps.search(parsed.data.query);
      } catch {
        return c.json({ error: "source_unavailable" }, 502);
      }
      const selected = parsed.data.externalId
        ? found.filter(
            (candidate) => candidate.externalId === parsed.data.externalId
          )
        : found;
      if (selected.length === 0) {
        return c.json({ error: "not_found" }, 404);
      }
      if (selected.length !== 1) {
        return c.json(
          {
            error: "selection_required",
            matches: selected.map((match) => ({
              externalId: match.externalId,
              name: match.name,
            })),
          },
          409
        );
      }
      const [item] = selected;
      if (!item) {
        return c.json({ error: "not_found" }, 404);
      }
      try {
        const admitted = await deps.admit(userId, workspaceId, item);
        if (admitted.kind === "not_found") {
          return c.json({ error: "not_found" }, 404);
        }
        return c.json(
          {
            externalId: item.externalId,
            kind: admitted.kind,
            prospectId: admitted.prospectId,
            provider: item.provider,
            recordStatus: "historical_unverified",
            retrievedAt: item.retrievedAt,
            sourceUri: item.sourceUri,
          },
          admitted.kind === "created" ? 201 : 200
        );
      } catch {
        return c.json({ error: "temporarily_unavailable" }, 503);
      }
    }
  );
  return app;
}
