import type { Database } from "@prospect-studio/db";
import {
  ackOutbox,
  backoffSeconds,
  type ClaimedOutboxCommand,
  claimOutbox,
  reapOutbox,
  retryOutbox,
} from "@prospect-studio/db/outbox";
import type { JobCommand } from "./transitions";

type SubmitCommand = Extract<JobCommand, { type: "submit" }>;
type Publisher = (workspaceId: string, command: SubmitCommand) => Promise<void>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export interface OutboxTransport {
  ack: (id: string, claimToken: string) => Promise<boolean>;
  claim: (batchSize: number) => Promise<ClaimedOutboxCommand[]>;
  publish: Publisher;
  reap: () => Promise<number>;
  retry: (
    id: string,
    claimToken: string,
    delaySeconds: number
  ) => Promise<boolean>;
}

export interface DeliverySummary {
  claimed: number;
  delivered: number;
  invalid: number;
  lostLease: number;
  reaped: number;
  retried: number;
}

function parseSubmission(row: ClaimedOutboxCommand): SubmitCommand | null {
  const payload = row.command;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const command = payload as Record<string, unknown>;
  if (
    command.type !== "submit" ||
    command.jobId !== row.job_id ||
    command.prospectId !== row.prospect_id ||
    typeof command.jobId !== "string" ||
    typeof command.prospectId !== "string" ||
    !IDENTIFIER.test(command.jobId) ||
    !IDENTIFIER.test(command.prospectId) ||
    !Number.isInteger(command.maxAttempts) ||
    (command.maxAttempts as number) < 1 ||
    (command.maxAttempts as number) > 20 ||
    typeof command.requiresApproval !== "boolean"
  ) {
    return null;
  }

  return {
    jobId: command.jobId,
    maxAttempts: command.maxAttempts as number,
    prospectId: command.prospectId,
    requiresApproval: command.requiresApproval,
    type: "submit",
  };
}

/**
 * At-least-once command delivery with a lease-fenced acknowledgment.
 * A lost ack may cause the same command to be redelivered; the Rivet workflow
 * must treat duplicate submissions idempotently. No browser access here.
 */
interface DeliveryOutcome {
  delivered: number;
  invalid: number;
  lostLease: number;
  retried: number;
}

async function retryOne(
  io: OutboxTransport,
  row: ClaimedOutboxCommand,
  invalid: number
): Promise<DeliveryOutcome> {
  const retried = await io.retry(
    row.id,
    row.claim_token,
    backoffSeconds(row.delivery_attempts)
  );
  return {
    delivered: 0,
    invalid,
    lostLease: retried ? 0 : 1,
    retried: retried ? 1 : 0,
  };
}

async function deliverOne(
  io: OutboxTransport,
  row: ClaimedOutboxCommand
): Promise<DeliveryOutcome> {
  const command = parseSubmission(row);
  if (!command) {
    return retryOne(io, row, 1);
  }
  try {
    await io.publish(row.workspace_id, command);
  } catch {
    // Never expose raw connector errors or credentials in job state.
    return retryOne(io, row, 0);
  }
  const acknowledged = await io.ack(row.id, row.claim_token);
  return {
    delivered: acknowledged ? 1 : 0,
    invalid: 0,
    lostLease: acknowledged ? 0 : 1,
    retried: 0,
  };
}

/** A batch runs at most 10 independent deliveries concurrently. */
export async function deliverOutboxBatch(
  io: OutboxTransport,
  batchSize = 10
): Promise<DeliverySummary> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) {
    throw new Error("Invalid outbox batch size");
  }

  const reaped = await io.reap();
  const batch = await io.claim(batchSize);
  const outcomes = await Promise.all(batch.map((row) => deliverOne(io, row)));

  return outcomes.reduce<DeliverySummary>(
    (total, result) => ({
      claimed: total.claimed,
      delivered: total.delivered + result.delivered,
      invalid: total.invalid + result.invalid,
      lostLease: total.lostLease + result.lostLease,
      reaped: total.reaped,
      retried: total.retried + result.retried,
    }),
    {
      claimed: batch.length,
      delivered: 0,
      invalid: 0,
      lostLease: 0,
      reaped,
      retried: 0,
    }
  );
}

/** Wire the real database transaction/claims to an authenticated private publisher. */
export function createPostgresOutboxTransport(
  db: Database,
  publish: Publisher
): OutboxTransport {
  return {
    ack: (id, token) => ackOutbox(db, id, token),
    claim: (batchSize) => claimOutbox(db, batchSize),
    publish,
    reap: () => reapOutbox(db),
    retry: (id, token, delay) => retryOutbox(db, id, token, delay),
  };
}

export interface RivetGateClient {
  jobGate: {
    getOrCreate: (key: string[]) => {
      send: (queueName: "commands", message: SubmitCommand) => Promise<unknown>;
    };
  };
}

/** The Rivet client must only be constructed on an authorized private server. */
export function createRivetSubmitPublisher(client: RivetGateClient): Publisher {
  return async (workspaceId, command) => {
    await client.jobGate
      .getOrCreate([workspaceId, command.jobId])
      .send("commands", command);
  };
}
