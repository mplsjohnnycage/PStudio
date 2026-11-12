import { createDb } from "@prospect-studio/db";
import { recoverStaleEnrichmentAttempts } from "@prospect-studio/db/enrichment-queries";
import { createClient } from "rivetkit/client";
import {
  createPostgresOutboxTransport,
  createRivetSubmitPublisher,
  deliverOutboxBatch,
} from "./outbox-dispatcher";
import { assertPrivateRivetConfigured } from "./private-config";
import type { registry } from "./registry";

/** Private-only process. Never accept inbound HTTP, tokens, or browser jobs. */
const runtime = process.env;
assertPrivateRivetConfigured(runtime);
if (runtime.RIVET_PRIVATE_DISPATCHER_ENABLED !== "1") {
  throw new Error("Private outbox dispatcher must be explicitly enabled");
}
const db = createDb({ DATABASE_URL: runtime.DATABASE_URL });
const client = createClient<typeof registry>(runtime.RIVET_ENDPOINT);
const transport = createPostgresOutboxTransport(
  db,
  createRivetSubmitPublisher(client)
);

let shuttingDown = false;
process.on("SIGINT", () => {
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  shuttingDown = true;
});

async function main(): Promise<void> {
  while (!shuttingDown) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: serial poll cycles are required for leased jobs
      const recovered = await recoverStaleEnrichmentAttempts(
        db,
        new Date(Date.now() - 120_000)
      );
      const delivered = await deliverOutboxBatch(transport, 10);
      if (delivered.claimed || delivered.reaped || recovered) {
        console.info(
          JSON.stringify({
            component: "pstudio-private-dispatcher",
            event: "delivery_batch",
            ...delivered,
            recovered,
          })
        );
      }
    } catch {
      console.error(
        JSON.stringify({
          code: "storage_or_control_plane_unavailable",
          component: "pstudio-private-dispatcher",
          event: "batch_failed",
        })
      );
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    });
  }
  await client.dispose();
}
main().catch(() => {
  console.error("Private outbox dispatcher could not initialize");
  process.exitCode = 1;
});
