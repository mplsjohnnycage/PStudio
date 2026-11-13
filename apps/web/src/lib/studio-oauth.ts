"use client";

import { isOAuthVisit } from "./oauth-query";
import { getAuthClient } from "./studio-auth";

interface OAuthResponse {
  data?: unknown;
  error?: { message?: string } | null;
}
/**
 * @neon/auth's React adapter includes the oauthProviderClient plugin at
 * runtime; the public adapter proxy type does not expose this method.
 * Keep the structural type narrow to only the documented consent endpoints.
 */
interface OAuthMethods {
  oauth2: {
    continue: (input: { selected: boolean }) => Promise<OAuthResponse>;
    publicClient: (input: {
      query: { client_id: string };
    }) => Promise<OAuthResponse>;
    consent: (input: { accept: boolean }) => Promise<OAuthResponse>;
  };
}
export function getOAuthClient(): OAuthMethods {
  const client = getAuthClient() as unknown as Partial<OAuthMethods>;
  if (!client.oauth2) {
    throw new Error("Neon OAuth provider client is unavailable");
  }
  return client as OAuthMethods;
}

/** Neon Auth preserves signed OAuth parameters across its own redirect. */
export function hasAuthorizationQuery(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return isOAuthVisit(window.location.search);
}

/** Never continue an unprompted authorization flow. */
export async function resumeAuthorization(): Promise<string | null> {
  if (!hasAuthorizationQuery()) {
    return null;
  }
  const result = await getOAuthClient().oauth2.continue({ selected: true });
  return result.error
    ? "This sign-in request has expired or cannot be completed. Return to the connecting app and retry."
    : null;
}
