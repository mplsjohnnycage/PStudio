import {
  allowedChatgptUser,
  type HostedChatGPTEnvironment,
} from "@prospect-studio/api/chatgpt-hosted-policy";
import type {
  AuthorizedSiwcCredential,
  SiwcCredentialSource,
} from "@prospect-studio/siwc-provider";
import { createClient } from "rivetkit/client";
import {
  type PrivateRivetEnvironment,
  privateRivetConfigured,
} from "./private-config";
import type { registry } from "./registry";

type BrokerEnvironment = HostedChatGPTEnvironment &
  PrivateRivetEnvironment & {
    RIVET_ADMIN_TOKEN?: string;
  };

interface BrokerGrant {
  access?: string;
  expires?: number;
  scopes?: unknown;
  type?: string;
}

interface CredentialActor {
  refresh: (
    provider: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<BrokerGrant | undefined>;
}

interface CredentialConnection {
  credentials: {
    getOrCreate: (key: string[]) => CredentialActor;
  };
  dispose: () => Promise<void>;
}

export interface RivetSiwcSourceOptions {
  /** Injectable only for isolated contract tests. */
  connect?: () => Promise<CredentialConnection>;
  env?: BrokerEnvironment;
  /** Must come from a trusted, verified Neon subject, not from the Eve prompt. */
  ownerUserId: string;
}

function requireOwner(ownerUserId: string, env: BrokerEnvironment): void {
  if (!allowedChatgptUser(ownerUserId, env)) {
    throw new Error("PStudio SIWC owner access not enabled");
  }
  if (!privateRivetConfigured(env)) {
    throw new Error("PStudio private Rivet credential broker not configured");
  }
}

function connectPrivateActor(
  env: BrokerEnvironment
): Promise<CredentialConnection> {
  const endpoint = env.RIVET_ENDPOINT ?? "";
  const url = new URL(endpoint);
  if (url.username && url.password) {
    return Promise.resolve(createClient<typeof registry>(endpoint));
  }
  return Promise.resolve(
    createClient<typeof registry>({
      endpoint,
      namespace: env.RIVET_NAMESPACE ?? "",
      token: env.RIVET_TOKEN ?? "",
    })
  );
}

function normalizeBrokerGrant(
  grant: BrokerGrant | undefined,
  ownerUserId: string
): AuthorizedSiwcCredential {
  if (grant?.type !== "oauth" || typeof grant.access !== "string") {
    throw new Error("No authorized ChatGPT OAuth credential in Rivet");
  }
  if (
    !(
      Array.isArray(grant.scopes) &&
      grant.scopes.every((scope) => typeof scope === "string")
    )
  ) {
    throw new Error("Rivet credential has no verified scope metadata");
  }
  if (typeof grant.expires !== "number" || grant.expires <= Date.now()) {
    throw new Error("Rivet credential is expired or has no expiry");
  }
  return {
    accessToken: grant.access,
    expiresAt: grant.expires,
    ownerUserId,
    scopes: grant.scopes as string[],
  };
}

/**
 * Eve's model receives only a short-lived access credential, not the Rivet
 * OAuth refresh token. Each model request resolves the actor fresh.
 *
 * Inference requests use a separate public Responses API adapter. This
 * source cannot send or approve PStudio outreach and never exposes credentials
 * through a browser endpoint.
 */
export function createRivetSiwcCredentialSource(
  options: RivetSiwcSourceOptions
): SiwcCredentialSource {
  const env = options.env ?? process.env;
  const trustedOwner = options.ownerUserId;
  // Refuse incorrect or unconfigured identity before any network activity.
  requireOwner(trustedOwner, env);
  return {
    async getCredential(request) {
      if (request.ownerUserId !== trustedOwner) {
        throw new Error("SIWC credential principal mismatch");
      }
      requireOwner(trustedOwner, env);
      const client = await (options.connect?.() ?? connectPrivateActor(env));
      try {
        const actor = client.credentials.getOrCreate([trustedOwner]);
        const credential = await actor.refresh("openai", {
          forceRefresh: request.forceRefresh,
        });
        return normalizeBrokerGrant(credential, trustedOwner);
      } finally {
        await client.dispose();
      }
    },
  };
}
