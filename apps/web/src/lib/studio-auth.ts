"use client";
import { createInternalNeonAuth, type ReactBetterAuthClient } from "@neon/auth";
import { BetterAuthReactAdapter } from "@neon/auth/react/adapters";

export const authConfigured = Boolean(
  process.env.NEXT_PUBLIC_NEON_AUTH_URL &&
    process.env.NEXT_PUBLIC_NEON_AUTH_URL !== "https://not-configured.invalid"
);
const neon = authConfigured
  ? createInternalNeonAuth(process.env.NEXT_PUBLIC_NEON_AUTH_URL ?? "", {
      adapter: BetterAuthReactAdapter(),
    })
  : null;

const client = neon?.adapter ?? null;

export function getAuthClient(): ReactBetterAuthClient {
  if (!client) {
    throw new Error("Neon authentication is not configured.");
  }
  // The Neon adapter installs emailOTPClient(), but createInternalNeonAuth
  // currently erases that plugin-specific client type.
  return client as ReactBetterAuthClient;
}
export const getApiToken = () => neon?.getJWTToken() ?? Promise.resolve(null);
