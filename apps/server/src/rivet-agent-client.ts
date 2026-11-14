import { allowedChatgptUser } from "@prospect-studio/api/chatgpt-hosted-policy";
import type { AgentBrokerAdapter } from "./agent-broker";

const PUBLIC_TOKEN = /^(pk_|ck_)/;

/**
 * Fail closed until a private HTTPS Rivet endpoint, a server-side secret
 * and staging DB credentials are explicitly provisioned.
 */
export function privateAgentConfigured(env = process.env): boolean {
  if (env.RIVET_OPERATOR_AGENT_ENABLED !== "1" || !env.DATABASE_URL) {
    return false;
  }
  try {
    const endpoint = new URL(env.RIVET_ENDPOINT ?? "");
    if (endpoint.protocol !== "https:") {
      return false;
    }
    if (endpoint.username && endpoint.password) {
      return !PUBLIC_TOKEN.test(endpoint.password);
    }
    const token = env.RIVET_TOKEN ?? env.RIVET_ADMIN_TOKEN ?? "";
    return (
      Boolean(env.RIVET_NAMESPACE) &&
      token.length >= 12 &&
      !PUBLIC_TOKEN.test(token)
    );
  } catch {
    return false;
  }
}

/** A provider listed in Rivet may be revoked or expired; verify refreshability. */
export async function chatgptCredentialConnected(source: {
  refresh: (
    provider: string
  ) => Promise<{ type: string; access?: string; expires?: number } | undefined>;
}): Promise<boolean> {
  try {
    const credential = await source.refresh("openai");
    return (
      credential?.type === "oauth" &&
      typeof credential.access === "string" &&
      credential.access.length > 0 &&
      typeof credential.expires === "number" &&
      credential.expires > Date.now() + 60_000
    );
  } catch {
    return false;
  }
}

export function createPrivateAgentBroker(): AgentBrokerAdapter {
  const available = privateAgentConfigured();

  async function connect() {
    const { createClient } = await import("rivetkit/client");
    const endpoint = process.env.RIVET_ENDPOINT ?? "";
    const url = new URL(endpoint);
    if (url.username && url.password) {
      return createClient<typeof import("../../worker/src/registry").registry>(
        endpoint
      );
    }
    return createClient<typeof import("../../worker/src/registry").registry>({
      endpoint,
      namespace: process.env.RIVET_NAMESPACE ?? "",
      token: process.env.RIVET_TOKEN ?? process.env.RIVET_ADMIN_TOKEN ?? "",
    });
  }

  async function clientCall<T>(
    run: (client: Awaited<ReturnType<typeof connect>>) => Promise<T>
  ): Promise<T> {
    if (!available) {
      throw new Error("Rivet operator runtime not configured");
    }
    const client = await connect();
    try {
      return await run(client);
    } finally {
      await client.dispose();
    }
  }

  return {
    available,
    connected: (userId) =>
      clientCall(async (client) =>
        chatgptCredentialConnected(client.credentials.getOrCreate([userId]))
      ),
    loginFinish: (userId, redirectUrl) =>
      clientCall(async (client) =>
        client.chatgptLogin.getOrCreate([userId]).finish(redirectUrl)
      ),
    loginStart: (userId) =>
      clientCall(async (client) =>
        client.chatgptLogin.getOrCreate([userId]).start()
      ),
    planEnabled: (userId: string) => allowedChatgptUser(userId),
    prompt: (userId, workspaceId, text, requestId) =>
      clientCall(async (client) => {
        const result = await client.operatorAgent
          .getOrCreate([userId, workspaceId])
          .prompt(text, { requestId });
        return result.status === "done"
          ? { status: "done", ...(result.text ? { text: result.text } : {}) }
          : { reason: result.reason, status: "unanswered" };
      }),
  };
}
