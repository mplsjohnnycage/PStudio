import { assertPrivateRivetConfigured } from "./private-config";
import { registry } from "./registry";

const isolatedLocalTestOnly =
  process.env.NODE_ENV !== "production" &&
  process.env.RIVET_LOCAL_WORKER_ENABLED === "1" &&
  process.env.RIVET_REAL_ENRICHMENT_ENABLED !== "1";

if (!isolatedLocalTestOnly) {
  assertPrivateRivetConfigured();
  if (process.env.RIVET_REAL_ENRICHMENT_ENABLED !== "1") {
    throw new Error("Real private enrichment must be explicitly enabled");
  }
}

registry.start();
