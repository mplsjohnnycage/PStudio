import { registry } from "./registry";

/**
 * Development-only worker boot. Fail closed rather than accidentally exposing
 * unauthenticated job lifecycle controls from a public Rivet endpoint.
 */
if (
  process.env.NODE_ENV === "production" ||
  process.env.RIVET_LOCAL_WORKER_ENABLED !== "1"
) {
  throw new Error(
    "Rivet worker cannot start: private-control-plane and production auth are not configured."
  );
}

registry.start();
