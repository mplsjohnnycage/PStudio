import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { createMcpAuth } from "@neon/oauth/mcp";
import { honoMcp, type McpAuthVariables } from "@neon/oauth/mcp/hono";
import {
  operatorCommandSchema,
  operatorTools,
} from "@prospect-studio/api/operator-tools";
import type { Database } from "@prospect-studio/db";
import {
  appendAgentUiEvent,
  bindAgentSession,
} from "@prospect-studio/db/agent-session-queries";
import { Hono } from "hono";
import { executeAuthorizedOperatorOperation } from "./operator-operations";

const MAX_RESULT = 14_000;
const RESOURCE_PATH = "/mcp";
export interface OperatorMcpConfig {
  authBaseUrl?: string;
  database: Database;
  resource?: string;
}

/**
 * The same capability schemas and permission-checked operations as the
 * first-party dashboard and Rivet Pi agent. No separate authorization logic
 * is hidden inside a model tool or trusted source record.
 */
export function createOperatorMcpServer(db: Database, userId: string) {
  const server = new McpServer({
    name: "prospect-studio-operator",
    version: "0.1.0",
  });
  for (const spec of operatorTools) {
    const variant = operatorCommandSchema.options.find(
      (option) => option.shape.tool.value === spec.name
    );
    if (!variant) {
      throw new Error("Missing schema for operator capability");
    }
    server.registerTool(
      spec.name,
      {
        annotations: {
          destructiveHint: false,
          idempotentHint: spec.effect === "read",
          openWorldHint: spec.name === "discover_municipal_record",
          readOnlyHint: spec.effect === "read",
        },
        description: spec.description,
        inputSchema: variant.shape.input,
      },
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: explicit allowlist, identity and owner authorization guards
      async (input: unknown) => {
        let result: unknown;
        const command = operatorCommandSchema.safeParse({
          input,
          tool: spec.name,
        });
        if (command.success) {
          try {
            const payload = command.data;
            if (payload.tool === "decide_review") {
              result = { error: "owner_confirmation_required" };
            } else if (
              payload.tool === "navigate" ||
              payload.tool === "select_prospect"
            ) {
              const { workspaceId } = payload.input;
              if (workspaceId) {
                const bound = await bindAgentSession(db, userId, workspaceId);
                result =
                  bound === "bound"
                    ? await appendAgentUiEvent(db, userId, workspaceId, payload)
                    : { error: "not_found" };
              } else {
                result = { error: "workspace_id_required" };
              }
            } else {
              const workspaceId =
                "workspaceId" in payload.input ? payload.input.workspaceId : "";
              result = await executeAuthorizedOperatorOperation(
                db,
                userId,
                workspaceId,
                payload
              );
            }
          } catch {
            result = { error: "operator_action_temporarily_unavailable" };
          }
        } else {
          result = { error: "invalid_input" };
        }
        const output = JSON.stringify(result);
        return {
          content: [
            {
              text:
                output.length > MAX_RESULT
                  ? `${output.slice(0, MAX_RESULT)}... [result truncated]`
                  : output,
              type: "text" as const,
            },
          ],
          isError: Boolean(
            result && typeof result === "object" && "error" in result
          ),
        };
      }
    );
  }
  return server;
}

function mcpReady(config: OperatorMcpConfig): config is OperatorMcpConfig & {
  authBaseUrl: string;
  resource: string;
} {
  try {
    const resource = new URL(config.resource ?? "");
    const issuer = new URL(config.authBaseUrl ?? "");
    return (
      resource.protocol === "https:" &&
      issuer.protocol === "https:" &&
      resource.pathname === RESOURCE_PATH &&
      !resource.search &&
      !resource.hash &&
      !resource.username &&
      !resource.password
    );
  } catch {
    return false;
  }
}

/**
 * Per-user OAuth 2.1 boundary. Neon validates JWT signature, issuer and MCP
 * resource audience before tools can execute. No anonymous tools.
 */
export function createOperatorMcpRoutes(config: OperatorMcpConfig) {
  const app = new Hono<McpAuthVariables>();
  if (!mcpReady(config)) {
    app.all(RESOURCE_PATH, (c) =>
      c.json(
        {
          error: "mcp_oauth_not_configured",
        },
        503
      )
    );
    return app;
  }
  const auth = createMcpAuth({
    baseUrl: config.authBaseUrl,
    resource: config.resource,
  });
  app.use(honoMcp(auth, { path: RESOURCE_PATH }));
  app.all(RESOURCE_PATH, async (c) => {
    const { sub } = c.get("auth");
    if (!sub) {
      return c.json({ error: "unauthorized" }, 401);
    }
    // Per-request server and transport: no cross-user session reuse.
    const server = createOperatorMcpServer(config.database, sub);
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await transport.close();
      await server.close();
    }
  });
  return app;
}
