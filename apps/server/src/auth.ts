import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";

export interface NeonJwtOptions {
  issuer?: string;
  jwksUrl?: string;
}

export type VerifyIdentity = (
  authorization: string | undefined
) => Promise<string | null>;

const BEARER_PATTERN = /^Bearer ([^\s]+)$/i;

/**
 * Verify an actual Neon Managed Better Auth JWT. Its short-lived asymmetric
 * JWT is distinct from Better Auth's opaque session cookie. Never accept
 * identity or workspace from unsigned HTTP headers or JWT workspace claims.
 */
export function createNeonTokenVerifier(
  config: NeonJwtOptions,
  keySetOverride?: JWTVerifyGetKey
): VerifyIdentity {
  if (!(config.issuer && config.jwksUrl)) {
    return async () => null;
  }

  const issuerUrl = new URL(config.issuer);
  const jwksUrl = new URL(config.jwksUrl);
  if (issuerUrl.protocol !== "https:" || jwksUrl.protocol !== "https:") {
    throw new Error("Neon Auth issuer and JWKS URL must use https");
  }

  const keys = keySetOverride ?? createRemoteJWKSet(jwksUrl);
  const issuer = issuerUrl.origin;

  return async (authorization) => {
    const token = BEARER_PATTERN.exec(authorization ?? "")?.[1];
    if (!token) {
      return null;
    }

    try {
      const { payload } = await jwtVerify(token, keys, {
        algorithms: ["EdDSA"],
        audience: issuer,
        issuer,
      });
      if (
        typeof payload.sub !== "string" ||
        payload.sub.length < 1 ||
        payload.sub.length > 256 ||
        typeof payload.exp !== "number"
      ) {
        return null;
      }
      return payload.sub;
    } catch {
      return null;
    }
  };
}
