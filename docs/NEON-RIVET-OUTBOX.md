# Neon–Rivet transactional job-command outbox

**Status: local implementation and tests only. NOT deployed.**

## Responsibility boundaries

Neon `jobs` remains the authoritative business record. `job_outbox` stores independently retriable commands, not user authorization or Rivet actor state. Rivet `jobGate` provides keyed, idempotent state-machine command consumption. No job enqueue HTTP API or live background polling service has been enabled.

`0002_elite_mauler.sql` creates an additive `job_outbox` table with foreign key to `jobs`, per-job idempotency-key uniqueness, bounded attempts, claim/lease invariants, terminal state checks and due-work index. It does not delete or rewrite existing data.

`buildClaimSql` atomically claims due or expired-lease rows using PostgreSQL `FOR UPDATE SKIP LOCKED`, a random UUID fencing token, database-clock lease, and attempt increment. `buildAckSql` only acknowledges the matching row, token and live lease. `buildRetrySql` retries with bounded backoff or dead-letters on the final attempt. `buildReapSql` dead-letters exhausted, abandoned work. Dispatch batches are capped at ten sends, run concurrently, and validate command/job/prospect IDs against canonical DB fields before publishing.

Delivery is **at least once**, not exactly once: if publish succeeds but acknowledgment fails, duplicate commands may be delivered. The keyed Rivet actor's duplicate submission must remain harmless. No externally consequential operations are authorized by a command's presence alone; human approvals require verified DB records.

## Verification

- Local outbox SQL tests validate lock, lease token, stale acknowledgment, retry/dead-letter, idempotency constraint, and non-destructive migration.
- Worker tests cover successful send/ack, failed send/retry, lost lease, malformed cross-prospect command, and correct workspace actor key.
- Full lint, type checks, unit tests, build and Rivet integration CI remain release gates.
- **Not yet proven**: applying migrations, racing claims and crash restart with a real isolated Neon DB, private worker deployment, authenticated enqueue in one transaction, scheduled polling, Realtime notifications, RLS policies and complete integration with Neon Auth.

## Execution limits

Only use `morning-surf-12386530`, with staging branch `br-fancy-shadow-bekwm85g` for validation. Do not apply migrations to the production branch `br-steep-surf-bek7urvd` without explicit approval. Do not provision paid resources, change storage access, or publish customer material.

The Neon connector now reaches the correct project, and existing Neon Auth, Realtime, storage, AI Gateway and two private buckets (`psassets`, `psrivet`) were verified. Reuse rather than recreate them.
