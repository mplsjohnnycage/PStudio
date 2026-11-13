import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appRouter } from "@prospect-studio/api/routers/index";
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
import { initLogger } from "evlog";
import { createFsDrain } from "evlog/fs";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAgentRoutes } from "./agent-broker";
import { createNeonTokenVerifier } from "./auth";
import { createContext } from "./context";
import { createDiscoveryRoutes } from "./discovery-api";
import { ENV } from "./env.server";
import { createJobEnqueueRoutes } from "./job-enqueue-api";
import { createJobsRoutes } from "./jobs-api";
import { searchMinneapolisLicense } from "./minneapolis-license-source";
import { mountOperatorApi } from "./operator-api";
import { createPreviewsRoutes } from "./previews-api";
import { createProspectsRoutes } from "./prospects-api";
import { createReviewRoutes } from "./review-api";
import { createPrivateAgentBroker } from "./rivet-agent-client";
import { db } from "./services";
import { createWorkspacesRoutes } from "./workspaces-api";

initLogger({
  env: { service: "prospect-studio-server" },
});

const app = new Hono<EvlogVariables>();

app.use(
  evlog({
    drain: process.env.NODE_ENV === "production" ? undefined : createFsDrain(),
  })
);

app.use(
  "/*",
  cors({
    allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    origin: ENV.CORS_ORIGIN,
  })
);

const verify = createNeonTokenVerifier({
  issuer: process.env.NEON_AUTH_BASE_URL,
  jwksUrl: process.env.NEON_AUTH_JWKS_URL,
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
  createWorkspacesRoutes({
    create: (userId, name) => createOwnedWorkspace(db, userId, name),
    list: (userId) => listUserWorkspaces(db, userId),
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

export const apiHandler = new OpenAPIHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    context,
    prefix: "/rpc",
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    context,
    prefix: "/api-reference",
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => c.text("OK"));

import { serve } from "@hono/node-server";

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
