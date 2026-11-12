import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  backoffSeconds,
  buildAckSql,
  buildClaimSql,
  buildReapSql,
  buildRetrySql,
} from "../src/outbox.ts";

const dialect = new PgDialect();
const render = (statement) => dialect.sqlToQuery(statement);
const PATTERNS = {
  ackDelivered: /state = 'delivered'/i,
  ackLeaseFence: /claimed_until > NOW\(\)/i,
  attempts: /delivery_attempts/i,
  claimLease: /claimed_until/i,
  claimLock: /FOR UPDATE SKIP LOCKED/i,
  claimState: /state = 'claimed'/i,
  claimToken: /claim_token/i,
  destructive: /\bDROP\s+(?:TABLE|SCHEMA|DATABASE)\b/i,
  fk: /FOREIGN KEY \("job_id"\) REFERENCES "public"\."jobs"/,
  reapDead: /state = 'dead'/i,
  retryDead: /THEN 'dead' ELSE 'pending'/i,
  role: /job_outbox_claim_ck/,
  table: /CREATE TABLE "job_outbox"/,
  uniqueKey: /job_outbox_job_key_uniq/,
};

test("claim SQL locks only due work and applies a fenced lease", () => {
  const { sql, params } = render(
    buildClaimSql({
      batchSize: 5,
      leaseSeconds: 40,
      leaseToken: "00000000-0000-4000-8000-000000000001",
    })
  );
  assert.match(sql, PATTERNS.claimLock);
  assert.match(sql, PATTERNS.claimLease);
  assert.match(sql, PATTERNS.claimState);
  assert.match(sql, PATTERNS.attempts);
  assert.ok(params.includes("00000000-0000-4000-8000-000000000001"));
  assert.ok(params.includes(5));
  assert.ok(params.includes(40));
});

test("ack and retry require current claim token and unexpired lease", () => {
  const ack = render(
    buildAckSql("event-1", "00000000-0000-4000-8000-000000000001")
  );
  assert.match(ack.sql, PATTERNS.ackDelivered);
  assert.match(ack.sql, PATTERNS.claimToken);
  assert.match(ack.sql, PATTERNS.ackLeaseFence);
  assert.ok(ack.params.includes("event-1"));
  assert.ok(ack.params.includes("00000000-0000-4000-8000-000000000001"));
  const retry = render(
    buildRetrySql("event-1", "00000000-0000-4000-8000-000000000001", 4)
  );
  assert.match(retry.sql, PATTERNS.retryDead);
  assert.match(retry.sql, PATTERNS.ackLeaseFence);
  assert.ok(retry.params.includes(4));
});

test("reaper marks exhausted abandoned claims dead", () => {
  const q = render(buildReapSql());
  assert.match(q.sql, PATTERNS.reapDead);
  assert.match(q.sql, PATTERNS.attempts);
  assert.match(q.sql, PATTERNS.claimLease);
});

test("backoff is bounded and nonnegative", () => {
  assert.equal(backoffSeconds(1), 2);
  assert.equal(backoffSeconds(2), 4);
  assert.equal(backoffSeconds(9), 300);
  assert.equal(backoffSeconds(20), 300);
  assert.throws(() => backoffSeconds(0));
  assert.throws(() => backoffSeconds(21));
});

test("outbox migration is additive, lease-fenced, foreign-keyed, idempotent", () => {
  const sql = readFileSync(
    new URL("../src/migrations/0002_elite_mauler.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, PATTERNS.table);
  assert.match(sql, PATTERNS.role);
  assert.match(sql, PATTERNS.uniqueKey);
  assert.match(sql, PATTERNS.fk);
  assert.doesNotMatch(sql, PATTERNS.destructive);
});
