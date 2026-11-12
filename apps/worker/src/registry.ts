import { queue, setup, workflow } from "@rivet-dev/workflows";
import { type JobCommand, type JobState, nextJobState } from "./transitions";

const initialJobState: JobState = {
  attempt: 0,
  jobId: null,
  maxAttempts: 0,
  phase: "idle",
  prospectId: null,
};

/**
 * Single keyed Rivet workflow per (workspaceId, jobId).
 * The control plane MUST remain private; authenticated Hono routes will authorize
 * commands against Neon before dispatch. This workflow intentionally makes no
 * external calls or publishes any prospect data.
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
      await loopCtx.step("transition-job", (step) => {
        const updated = nextJobState(step.state, message.body);
        Object.assign(step.state, updated);
        return Promise.resolve();
      });
    });
  },
  state: { ...initialJobState },
});

export const registry = setup({ use: { jobGate } });
