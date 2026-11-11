import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appRouter } from "@prospect-studio/api/routers/index";
import { initLogger } from "evlog";
import { createFsDrain } from "evlog/fs";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { createContext } from "./context";
import { ENV } from "./env.server";

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
    allowMethods: ["GET", "POST", "OPTIONS"],
    origin: ENV.CORS_ORIGIN,
  })
);

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
