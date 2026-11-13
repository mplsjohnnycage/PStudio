import { createDb, type Database } from "@prospect-studio/db";
import { backoffSeconds } from "@prospect-studio/db/outbox";
import { queue, setup, workflow } from "@rivet-dev/workflows";
import { credentials } from "./chatgpt-credentials";
import { chatgptLogin } from "./chatgpt-login";
import { operatorAgent } from "./operator-agent";
import { executeEnrichmentAttempt } from "./real-enrichment";
import { type JobCommand, type JobState, nextJobState } from "./transitions";

const initialJobState: JobState = {
  attempt: 0,
  jobId: null,
  maxAttempts: 0,
  phase: "idle",
  prospectId: null,
};

let database: Database | null = null;
const realProcessingEnabled = process.env.RIVET_REAL_ENRICHMENT_ENABLED === "1";

function requireDatabase(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!(realProcessingEnabled && connectionString)) {
    throw new Error("Private enrichment database is not configured");
  }
  database ??= createDb({ DATABASE_URL: connectionString });
  return database;
}

/**
 * Rivet's durable state controls job execution but Neon is the authoritative
 * data store. Real execution is strictly opt-in and needs a private, credentialed
 * worker; regular transition-only Rivet integration tests cannot count as E2E.
 */
export const jobGate = workflow({
  actions: {
    getState: (c) => ({ ...c.state }),
  },
  queues: {
    commands: queue<JobCommand>(),
  },
  run: async (ctx) => {
    await ctx.loop("process-commands", async (loopCtx) => {
      const message = await loopCtx.queue.next("wait-command");
      const transitioned = await loopCtx.step("transition-job", (step) => {
        const updated = nextJobState(step.state, message.body);
        Object.assign(step.state, updated);
        return Promise.resolve({ ...updated });
      });
      if (
        !realProcessingEnabled ||
        transitioned.phase !== "queued" ||
        !transitioned.jobId
      ) {
        return;
      }

      for (let index = 0; index < transitioned.maxAttempts; index += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: durable job attempts execute serially
        const running = await loopCtx.step(
          "start-enrichment-".concat(String(index)),
          (step) => {
            const updated = nextJobState(step.state, { type: "start" });
            Object.assign(step.state, updated);
            return Promise.resolve({ ...updated });
          }
        );
        if (running.phase !== "running") {
          return;
        }

        const outcome = await loopCtx.step(
          "execute-enrichment-".concat(String(index)),
          async () =>
            executeEnrichmentAttempt(
              requireDatabase(),
              transitioned.jobId as string
            )
        );
        if (outcome.kind === "skipped" || outcome.kind === "conflict") {
          throw new Error(
            "Enrichment cannot proceed without a durable job claim"
          );
        }
        const updated = await loopCtx.step(
          "finish-enrichment-".concat(String(index)),
          (step) => {
            const completed = nextJobState(step.state, {
              attempt: running.attempt,
              jobId: transitioned.jobId as string,
              ok:
                outcome.kind === "completed" ||
                outcome.kind === "already_completed",
              type: "finish",
            });
            Object.assign(step.state, completed);
            return Promise.resolve({ ...completed });
          }
        );
        if (updated.phase !== "retrying") {
          return;
        }
        await loopCtx.sleep(
          "retry-backoff-".concat(String(index)),
          backoffSeconds(running.attempt) * 1000
        );
      }
    });
  },
  state: { ...initialJobState },
});

export const registry = setup({
  use: { chatgptLogin, credentials, jobGate, operatorAgent },
});
