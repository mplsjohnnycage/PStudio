import { createDb } from "@prospect-studio/db";
import { enqueueWorkspaceJob } from "@prospect-studio/db/job-enqueue";
import { readWorkspaceJobs } from "@prospect-studio/db/job-queries";
import {
  createWorkspacePreview,
  readPrivatePreview,
} from "@prospect-studio/db/preview-queries";
import {
  createWorkspaceProspect,
  listWorkspaceProspects,
} from "@prospect-studio/db/prospect-queries";
import {
  createOwnedWorkspace,
  listUserWorkspaces,
} from "@prospect-studio/db/workspace-queries";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createNeonTokenVerifier } from "./auth";
import { createJobEnqueueRoutes } from "./job-enqueue-api";
import { createJobsRoutes } from "./jobs-api";
import { createPreviewsRoutes } from "./previews-api";
import { createProspectsRoutes } from "./prospects-api";
import { createWorkspacesRoutes } from "./workspaces-api";

export interface NeonFunctionConfiguration {
  authBaseUrl?: string;
  corsOrigins?: string[];
  databaseUrl?: string;
  jwksUrl?: string;
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
      read: (userId, workspaceId, previewId) =>
        readPrivatePreview(db, userId, workspaceId, previewId),
      verify,
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
});
