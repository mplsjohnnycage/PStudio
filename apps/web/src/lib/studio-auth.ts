"use client";
import { createInternalNeonAuth } from "@neon/auth";
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

export function getAuthClient() {
  if (!client) {
    throw new Error("Neon authentication is not configured.");
  }
  return client;
}
export const getApiToken = () => neon?.getJWTToken() ?? Promise.resolve(null);
