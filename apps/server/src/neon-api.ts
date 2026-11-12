import { createDb } from "@prospect-studio/db";
import { admitSourcedProspect } from "@prospect-studio/db/admission-queries";
import { listWorkspaceAgentEvents } from "@prospect-studio/db/agent-session-queries";
import { enqueueWorkspaceJob } from "@prospect-studio/db/job-enqueue";
import { readWorkspaceJobs } from "@prospect-studio/db/job-queries";
import {
  createWorkspacePreview,
  listWorkspacePreviews,
  readPrivatePreview,
} from "@prospect-studio/db/preview-queries";
import {
  createWorkspaceProspect,
  listWorkspaceProspects,
} from "@prospect-studio/db/prospect-queries";
import {
  decideWorkspaceReview,
  openWorkspaceReview,
  readWorkspaceReview,
} from "@prospect-studio/db/review-queries";
import {
  createOwnedWorkspace,
  listUserWorkspaces,
  mayDiscoverInWorkspace,
} from "@prospect-studio/db/workspace-queries";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAgentRoutes } from "./agent-broker";
import { createNeonTokenVerifier } from "./auth";
import { createDiscoveryRoutes } from "./discovery-api";
import { createJobEnqueueRoutes } from "./job-enqueue-api";
import { createJobsRoutes } from "./jobs-api";
import { searchMinneapolisLicense } from "./minneapolis-license-source";
import { mountOperatorApi } from "./operator-api";
import { createOperatorMcpRoutes } from "./operator-mcp";
import { createPreviewsRoutes } from "./previews-api";
import { createProspectsRoutes } from "./prospects-api";
import { createReviewRoutes } from "./review-api";
import { createPrivateAgentBroker } from "./rivet-agent-client";
import { createWorkspacesRoutes } from "./workspaces-api";

export interface NeonFunctionConfiguration {
  authBaseUrl?: string;
  corsOrigins?: string[];
  databaseUrl?: string;
  jwksUrl?: string;
  mcpResource?: string;
}

/**
 * Authenticated API on Neon Functions. Neon injects branch-scoped DATABASE_URL,
 * NEON_AUTH_BASE_URL and NEON_AUTH_JWKS_URL; no secrets are included in bundles.
 */
export function createNeonApi(config: NeonFunctionConfiguration) {
  const app = new Hono();
  const origins = new Set(config.corsOrigins ?? []);
  app.use(
    "/*",
    cors({
      allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      origin: (origin) => (origins.has(origin) ? origin : ""),
    })
  );
  if (!(config.databaseUrl && config.authBaseUrl && config.jwksUrl)) {
    app.get("/health", (c) => c.json({ status: "not_configured" }, 503));
    app.all("/v1/*", (c) => c.json({ error: "temporarily_unavailable" }, 503));
    app.all("/mcp", (c) => c.json({ error: "mcp_oauth_not_configured" }, 503));
    return app;
  }

  const db = createDb({ DATABASE_URL: config.databaseUrl });
  const verify = createNeonTokenVerifier({
    issuer: config.authBaseUrl,
    jwksUrl: config.jwksUrl,
  });

  app.get("/health", async (c) => {
    try {
      const result = await db.execute(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'release_artifacts'
        ) AS schema_ready
      `);
      const row = result.rows.at(0) as { schema_ready?: boolean } | undefined;
      return c.json(
        {
          authReady: true,
          schemaReady: row?.schema_ready === true,
          status: "ok",
        },
        200,
        { "Cache-Control": "no-store" }
      );
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });

  app.route(
    "/v1",
    createDiscoveryRoutes({
      admit: (userId, workspaceId, candidate) =>
        admitSourcedProspect(db, userId, workspaceId, candidate),
      authorize: (userId, workspaceId) =>
        mayDiscoverInWorkspace(db, userId, workspaceId),
      search: (query) => searchMinneapolisLicense(query),
      verify,
    })
  );
  app.route(
    "/v1",
    createWorkspacesRoutes({
      create: (userId, name) => createOwnedWorkspace(db, userId, name),
      list: (userId) => listUserWorkspaces(db, userId),
      verify,
    })
  );
  app.route(
    "/v1",
    createProspectsRoutes({
      create: (userId, workspaceId, input) =>
        createWorkspaceProspect(db, userId, workspaceId, input),
      list: (userId, workspaceId) =>
        listWorkspaceProspects(db, userId, workspaceId),
      verify,
    })
  );
  app.route(
    "/v1",
    createJobsRoutes({
      read: (userId, workspaceId) => readWorkspaceJobs(db, userId, workspaceId),
      verify,
    })
  );
  app.route(
    "/v1",
    createJobEnqueueRoutes({
      enqueue: (userId, workspaceId, prospectId, key) =>
        enqueueWorkspaceJob(db, userId, workspaceId, prospectId, key),
      verify,
    })
  );
  app.route(
    "/v1",
    createPreviewsRoutes({
      create: (userId, workspaceId, prospectId) =>
        createWorkspacePreview(db, userId, workspaceId, prospectId),
      list: (userId, workspaceId, prospectId) =>
        listWorkspacePreviews(db, userId, workspaceId, prospectId),
      read: (userId, workspaceId, previewId) =>
        readPrivatePreview(db, userId, workspaceId, previewId),
      verify,
    })
  );
  app.route(
    "/v1",
    createReviewRoutes({
      decide: (userId, workspaceId, previewId, decision) =>
        decideWorkspaceReview(db, userId, workspaceId, previewId, decision),
      open: (userId, workspaceId, previewId) =>
        openWorkspaceReview(db, userId, workspaceId, previewId),
      read: (userId, workspaceId, previewId) =>
        readWorkspaceReview(db, userId, workspaceId, previewId),
      verify,
    })
  );
  app.route(
    "/v1",
    createAgentRoutes({
      authorize: (userId, workspaceId) =>
        mayDiscoverInWorkspace(db, userId, workspaceId),
      broker: createPrivateAgentBroker(),
      events: (userId, workspaceId, after) =>
        listWorkspaceAgentEvents(db, userId, workspaceId, after),
      verify,
    })
  );
  mountOperatorApi(app, verify);
  app.route(
    "/",
    createOperatorMcpRoutes({
      authBaseUrl: config.authBaseUrl,
      database: db,
      resource: config.mcpResource,
    })
  );
  return app;
}

const runtimeOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export default createNeonApi({
  authBaseUrl: process.env.NEON_AUTH_BASE_URL,
  corsOrigins: runtimeOrigins,
  databaseUrl: process.env.DATABASE_URL,
  jwksUrl: process.env.NEON_AUTH_JWKS_URL,
  mcpResource: process.env.MCP_RESOURCE,
});
