/** Rivet credentials are never passed to the browser or recorded in job state. */
export interface PrivateRivetEnvironment {
  DATABASE_URL?: string;
  RIVET_ENDPOINT?: string;
  RIVET_NAMESPACE?: string;
  RIVET_TOKEN?: string;
}
export function privateRivetConfigured(
  env: PrivateRivetEnvironment = process.env
): boolean {
  if (!(env.RIVET_ENDPOINT && env.DATABASE_URL)) {
    return false;
  }
  try {
    const endpoint = new URL(env.RIVET_ENDPOINT);
    if (endpoint.protocol !== "https:") {
      return false;
    }
    const embeddedSecret =
      endpoint.username.length > 0 && endpoint.password.startsWith("sk_");
    const separateSecret =
      (env.RIVET_TOKEN ?? "").startsWith("sk_") && Boolean(env.RIVET_NAMESPACE);
    return embeddedSecret || separateSecret;
  } catch {
    return false;
  }
}

export function assertPrivateRivetConfigured(
  env: PrivateRivetEnvironment = process.env
): asserts env is PrivateRivetEnvironment & {
  DATABASE_URL: string;
  RIVET_ENDPOINT: string;
} {
  if (!privateRivetConfigured(env)) {
    throw new Error(
      "Private Rivet control plane or database is not configured"
    );
  }
}
