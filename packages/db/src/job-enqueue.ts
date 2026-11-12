import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "./index";
import {
  jobOutbox,
  jobs,
  prospects,
  workspaceMemberships,
} from "./schema/index";

export type EnqueueResult =
  | { kind: "created"; jobId: string }
  | { kind: "conflict" }
  | { kind: "not_found" };

const LIMIT = 3;

/** Throw to abort all transactional inserts on a semantic conflict. */
class EnqueueConflictError extends Error {}

export function deriveEnqueueIds(
  userId: string,
  workspaceId: string,
  key: string
) {
  const digest = createHash("sha256")
    .update(JSON.stringify([userId, workspaceId, key]))
    .digest("hex");
  return {
    eventId: `event_${digest}`,
    jobId: `job_${digest}`,
  };
}

function matchesCommand(actual: unknown, expected: Record<string, unknown>) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }
  const value = actual as Record<string, unknown>;
  return (
    Object.keys(value).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, item]) => value[key] === item)
  );
}

/**
 * Scoped, transactional, repeat-safe enqueue of a non-outreach enrichment job.
 * Auth is a verified Neon JWT subject and is checked against live DB membership.
 * A shared-row lock prevents membership revocation from racing the write.
 * No external Rivet call occurs inside this transaction.
 */
export function enqueueWorkspaceJob(
  db: Database,
  userId: string,
  workspaceId: string,
  prospectId: string,
  idempotencyKey: string
): Promise<EnqueueResult> {
  const { eventId, jobId } = deriveEnqueueIds(
    userId,
    workspaceId,
    idempotencyKey
  );
  return db
    .transaction(async (tx): Promise<EnqueueResult> => {
      const authorized = await tx
        .select({ role: workspaceMemberships.role })
        .from(prospects)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(prospects.workspaceId, workspaceMemberships.workspaceId),
            eq(workspaceMemberships.userId, userId)
          )
        )
        .where(
          and(
            eq(prospects.id, prospectId),
            eq(prospects.workspaceId, workspaceId)
          )
        )
        .limit(1)
        .for("share", { of: workspaceMemberships });

      const membership = authorized.at(0);
      if (!(membership && ["owner", "operator"].includes(membership.role))) {
        return { kind: "not_found" };
      }

      await tx
        .insert(jobs)
        .values({
          id: jobId,
          maxAttempts: LIMIT,
          prospectId,
          state: "queued",
          type: "enrich",
        })
        .onConflictDoNothing();

      const existingJob = await tx
        .select({
          id: jobs.id,
          maxAttempts: jobs.maxAttempts,
          prospectId: jobs.prospectId,
          type: jobs.type,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);

      const currentJob = existingJob.at(0);
      if (
        !currentJob ||
        currentJob.prospectId !== prospectId ||
        currentJob.type !== "enrich" ||
        currentJob.maxAttempts !== LIMIT
      ) {
        throw new EnqueueConflictError();
      }

      const command = {
        jobId,
        maxAttempts: LIMIT,
        prospectId,
        requiresApproval: false,
        type: "submit",
      };
      await tx
        .insert(jobOutbox)
        .values({
          command,
          id: eventId,
          idempotencyKey,
          jobId,
          maxDeliveries: 10,
          state: "pending",
        })
        .onConflictDoNothing();

      const existingEvent = await tx
        .select({
          command: jobOutbox.command,
          id: jobOutbox.id,
          idempotencyKey: jobOutbox.idempotencyKey,
          jobId: jobOutbox.jobId,
        })
        .from(jobOutbox)
        .where(eq(jobOutbox.id, eventId))
        .limit(1);

      const currentEvent = existingEvent.at(0);
      if (
        !currentEvent ||
        currentEvent.jobId !== jobId ||
        currentEvent.idempotencyKey !== idempotencyKey ||
        !matchesCommand(currentEvent.command, command)
      ) {
        throw new EnqueueConflictError();
      }

      return { jobId, kind: "created" };
    })
    .catch((error: unknown): EnqueueResult => {
      if (error instanceof EnqueueConflictError) {
        return { kind: "conflict" };
      }
      throw error;
    });
}
