import {
  operatorCommandSchema,
  operatorToolHttpRequest,
  operatorTools,
} from "@prospect-studio/api/operator-tools";
import type { Env, Hono } from "hono";
import type { VerifyIdentity } from "./auth";

const MAX_INPUT_BYTES = 3000;

/**
 * One authenticated control surface for the React dashboard, agent backend,
 * and prospective external MCP adapter. Routes to existing handlers rather
 * than reimplementing permission checks or persistence semantics.
 *
 * The model cannot send arbitrary URLs/methods or approve its own work.
 */
export function mountOperatorApi<TEnv extends Env>(
  app: Hono<TEnv>,
  verify: VerifyIdentity
): void {
  app.get("/v1/operator/tools", async (c) => {
    let identity: string | null = null;
    try {
      identity = await verify(c.req.header("authorization"));
    } catch {
      identity = null;
    }
    if (!identity) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return c.json({ tools: operatorTools }, 200, {
      "Cache-Control": "no-store",
    });
  });
  app.post(
    "/v1/operator/execute",
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: explicit fail-closed authentication and bounded tool dispatch
    async (c) => {
      let identity: string | null = null;
      try {
        identity = await verify(c.req.header("authorization"));
      } catch {
        identity = null;
      }
      if (!identity) {
        return c.json({ error: "unauthorized" }, 401);
      }

      let raw: string;
      try {
        raw = await c.req.text();
      } catch {
        return c.json({ error: "invalid_input" }, 400);
      }
      if (raw.length > MAX_INPUT_BYTES) {
        return c.json({ error: "invalid_input" }, 400);
      }
      let request: unknown;
      try {
        request = JSON.parse(raw);
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }
      const parsed = operatorCommandSchema.safeParse(request);
      if (!parsed.success) {
        return c.json({ error: "invalid_input" }, 400);
      }

      const route = operatorToolHttpRequest(parsed.data);
      if ("error" in route) {
        if (route.error === "client_navigation") {
          return c.json({ clientCommand: parsed.data }, 200, {
            "Cache-Control": "no-store",
          });
        }
        return c.json({ error: "owner_confirmation_required" }, 403);
      }

      // Replay only a fixed mapped path into the existing authenticated app,
      // retaining the caller's original signed Neon Auth bearer JWT.
      const originalAuthorization = c.req.header("authorization");
      const target = new URL(`/v1${route.path}`, c.req.url);
      const headers = new Headers({
        authorization: originalAuthorization ?? "",
        "content-type": "application/json",
        ...route.headers,
      });
      const delegatedRequest = new Request(target, {
        headers,
        method: route.method,
        ...(route.method === "POST"
          ? { body: JSON.stringify(route.body ?? {}) }
          : {}),
      });
      const response = await app.fetch(delegatedRequest);
      return new Response(response.body, {
        headers: {
          "cache-control": "no-store",
          "content-type":
            response.headers.get("content-type") ?? "application/json",
        },
        status: response.status,
      });
    }
  );
}
