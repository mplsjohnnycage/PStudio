import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "./index";

const LEASE_TOKEN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClaimedOutboxCommand {
  claim_token: string;
  command: unknown;
  delivery_attempts: number;
  id: string;
  job_id: string;
  max_deliveries: number;
  prospect_id: string;
  workspace_id: string;
}

/** Validate database output before publishing a command to any external actor. */
export function isClaimedOutboxCommand(
  value: unknown
): value is ClaimedOutboxCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.job_id === "string" &&
    typeof row.prospect_id === "string" &&
    typeof row.workspace_id === "string" &&
    typeof row.claim_token === "string" &&
    LEASE_TOKEN.test(row.claim_token) &&
    Number.isInteger(row.delivery_attempts) &&
    Number.isInteger(row.max_deliveries) &&
    row.command !== null &&
    typeof row.command === "object" &&
    !Array.isArray(row.command)
  );
}

export interface ClaimOptions {
  batchSize: number;
  leaseSeconds: number;
  leaseToken: string;
}

function checkLeaseToken(token: string): void {
  if (!LEASE_TOKEN.test(token)) {
    throw new Error("Invalid claim token");
  }
}

export function backoffSeconds(deliveryAttempt: number): number {
  if (
    !Number.isInteger(deliveryAttempt) ||
    deliveryAttempt < 1 ||
    deliveryAttempt > 20
  ) {
    throw new Error("Invalid delivery attempt");
  }
  return Math.min(300, 2 ** deliveryAttempt);
}

/**
 * One PostgreSQL statement claims a bounded batch under row locks, then
 * returns the workspace from the canonical prospect (not from the payload).
 * Lease timestamps are database-clock based, never worker-clock based.
 */
export function buildClaimSql(options: ClaimOptions) {
  const { batchSize, leaseSeconds, leaseToken } = options;
  checkLeaseToken(leaseToken);
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 50 ||
    !Number.isInteger(leaseSeconds) ||
    leaseSeconds < 10 ||
    leaseSeconds > 300
  ) {
    throw new Error("Invalid outbox claim limits");
  }

  return sql`
    WITH due AS (
      SELECT id FROM job_outbox
      WHERE delivery_attempts < max_deliveries
        AND (
          (state = 'pending' AND next_attempt_at <= NOW())
          OR (state = 'claimed' AND claimed_until < NOW())
        )
      ORDER BY created_at, id
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
      UPDATE job_outbox AS o
      SET state = 'claimed',
          claim_token = ${leaseToken},
          claimed_until = NOW() + (${leaseSeconds} * INTERVAL '1 second'),
          delivery_attempts = o.delivery_attempts + 1,
          updated_at = NOW()
      FROM due
      WHERE o.id = due.id
      RETURNING o.id, o.job_id, o.command, o.claim_token,
                o.delivery_attempts, o.max_deliveries
    )
    SELECT c.id, c.job_id, c.command, c.claim_token,
           c.delivery_attempts, c.max_deliveries,
           j.prospect_id, p.workspace_id
    FROM claimed AS c
    JOIN jobs AS j ON j.id = c.job_id
    JOIN prospects AS p ON p.id = j.prospect_id
  `;
}

/** Acknowledgment is fenced to the current unexpired lease. */
export function buildAckSql(outboxId: string, claimToken: string) {
  checkLeaseToken(claimToken);
  return sql`
    UPDATE job_outbox
       SET state = 'delivered',
           claim_token = NULL,
           claimed_until = NULL,
           delivered_at = NOW(),
           updated_at = NOW()
     WHERE id = ${outboxId}
       AND claim_token = ${claimToken}
       AND state = 'claimed'
       AND claimed_until > NOW()
     RETURNING id
  `;
}

/** Failed delivery requeues with backoff or transitions to dead at its cap. */
export function buildRetrySql(
  outboxId: string,
  claimToken: string,
  delaySeconds: number
) {
  checkLeaseToken(claimToken);
  if (
    !Number.isInteger(delaySeconds) ||
    delaySeconds < 0 ||
    delaySeconds > 300
  ) {
    throw new Error("Invalid retry backoff");
  }
  return sql`
    UPDATE job_outbox
       SET state = CASE WHEN delivery_attempts >= max_deliveries
                        THEN 'dead' ELSE 'pending' END,
           claim_token = NULL,
           claimed_until = NULL,
           next_attempt_at = NOW() + (${delaySeconds} * INTERVAL '1 second'),
           updated_at = NOW()
     WHERE id = ${outboxId}
       AND claim_token = ${claimToken}
       AND state = 'claimed'
       AND claimed_until > NOW()
     RETURNING id, state
  `;
}

/** Expired final claims must not remain permanently in the claimed state. */
export function buildReapSql() {
  return sql`
    UPDATE job_outbox
       SET state = 'dead',
           claim_token = NULL,
           claimed_until = NULL,
           updated_at = NOW()
     WHERE delivery_attempts >= max_deliveries
       AND (
         state = 'pending'
         OR (state = 'claimed' AND claimed_until <= NOW())
       )
     RETURNING id
  `;
}

export async function claimOutbox(
  db: Database,
  batchSize = 10,
  leaseSeconds = 60
): Promise<ClaimedOutboxCommand[]> {
  const result = await db.execute(
    buildClaimSql({ batchSize, leaseSeconds, leaseToken: randomUUID() })
  );
  const rows: unknown[] = result.rows;
  if (!rows.every(isClaimedOutboxCommand)) {
    throw new Error("Unexpected database outbox row shape");
  }
  return rows;
}

export async function ackOutbox(
  db: Database,
  outboxId: string,
  claimToken: string
): Promise<boolean> {
  const result = await db.execute(buildAckSql(outboxId, claimToken));
  return result.rows.length === 1;
}

export async function retryOutbox(
  db: Database,
  outboxId: string,
  claimToken: string,
  delaySeconds: number
): Promise<boolean> {
  const result = await db.execute(
    buildRetrySql(outboxId, claimToken, delaySeconds)
  );
  return result.rows.length === 1;
}

export async function reapOutbox(db: Database): Promise<number> {
  const result = await db.execute(buildReapSql());
  return result.rows.length;
}
