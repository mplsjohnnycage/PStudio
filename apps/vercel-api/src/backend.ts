import { RPCHandler } from "@orpc/server/fetch";
import { appRouter } from "@prospect-studio/api/routers/index";
import { createDb } from "@prospect-studio/db";
import { mayDiscoverInWorkspace } from "@prospect-studio/db/workspace-queries";
import { Hono } from "hono";
import { createNeonTokenVerifier } from "../../server/src/auth";
import { createNeonApi } from "../../server/src/neon-api";
import {
  createSpriteActionRoutes,
  wakeProspectStudioSprite,
} from "./sprite-action";

/** Vercel Hono function, separate from the long-running Rivet Sprite worker. */
const corsOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = new Hono();
app.route(
  "/",
  createNeonApi({
    authBaseUrl: process.env.NEON_AUTH_BASE_URL,
    corsOrigins,
    databaseUrl: process.env.DATABASE_URL,
    inviteOnly: process.env.PSTUDIO_STAGING_INVITE_ONLY === "1",
    jwksUrl: process.env.NEON_AUTH_JWKS_URL,
    mcpResource: process.env.MCP_RESOURCE,
    onJobEnqueued: wakeProspectStudioSprite,
    publicStagingUi: false,
  })
);

if (
  process.env.DATABASE_URL &&
  process.env.NEON_AUTH_BASE_URL &&
  process.env.NEON_AUTH_JWKS_URL
) {
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const verify = createNeonTokenVerifier({
    issuer: process.env.NEON_AUTH_BASE_URL,
    jwksUrl: process.env.NEON_AUTH_JWKS_URL,
  });
  // Preserve the existing oRPC healthCheck endpoint used by Next.js.
  // All procedures still run through the same typed application router.
  const rpcHandler = new RPCHandler(appRouter);
  app.use("/rpc/*", async (c, next) => {
    const result = await rpcHandler.handle(c.req.raw, {
      context: { db },
      prefix: "/rpc",
    });
    if (result.matched) {
      return c.newResponse(result.response.body, result.response);
    }
    await next();
  });
  app.route(
    "/v1",
    createSpriteActionRoutes({
      authorize: (userId, workspaceId) =>
        mayDiscoverInWorkspace(db, userId, workspaceId),
      verify,
      wake: wakeProspectStudioSprite,
    })
  );
}

export default app;
