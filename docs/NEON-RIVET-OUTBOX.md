# Neon–Rivet transactional job-command outbox

**Status: local implementation and tests only. NOT deployed.**

## Responsibility boundaries

Neon `jobs` remains the authoritative business record. `job_outbox` stores independently retriable commands, not user authorization or Rivet actor state. Rivet `jobGate` provides keyed, idempotent state-machine command consumption. An authenticated enqueue HTTP API is implemented in code; no live background polling service has been enabled.

`0002_elite_mauler.sql` creates an additive `job_outbox` table with foreign key to `jobs`, per-job idempotency-key uniqueness, bounded attempts, claim/lease invariants, terminal state checks and due-work index. It does not delete or rewrite existing data.

`buildClaimSql` atomically claims due or expired-lease rows using PostgreSQL `FOR UPDATE SKIP LOCKED`, a random UUID fencing token, database-clock lease, and attempt increment. `buildAckSql` only acknowledges the matching row, token and live lease. `buildRetrySql` retries with bounded backoff or dead-letters on the final attempt. `buildReapSql` dead-letters exhausted, abandoned work. Dispatch batches are capped at ten sends, run concurrently, and validate command/job/prospect IDs against canonical DB fields before publishing.

Delivery is **at least once**, not exactly once: if publish succeeds but acknowledgment fails, duplicate commands may be delivered. The keyed Rivet actor's duplicate submission must remain harmless. No externally consequential operations are authorized by a command's presence alone; human approvals require verified DB records.

## Authenticated enqueue (implemented locally; not deployed)

`POST /v1/workspaces/:workspaceId/prospects/:prospectId/jobs` requires a short-lived signed Neon Managed Better Auth JWT (valid EdDSA signature, issuer, audience, expiry and subject); `Idempotency-Key` is mandatory (8–64 ASCII alphanumeric, underscore or hyphen characters). Accepts only `{"type":"enrich"}` and returns `202 {"jobId":"...","state":"queued"}`, `401` for unauthorized, `404` for missing resource or non-operator workspace membership, `409` for an idempotency conflict, or `503` when persistence is unavailable.

The server never trusts client-supplied user identity. Within one DB transaction it locks the `owner`/`operator` workspace membership and matching prospect, inserts deterministic SHA-256-derived job and outbox IDs, verifies replayed job/command content, and aborts the entire transaction on semantic conflict. Jobs are enrichment-only; no outreach, approval, sending, external crawl or paid inference is triggered by the API. Outbox delivery is a separate disabled-by-default worker action. There is no publicly exposed Rivet control plane.

Verification at this PR: 3 Hono enqueue HTTP tests; 5 DB transaction tests (including a RED→GREEN outbox rollback regression); full 48-test suite, lint, TypeScript, build and Drizzle migration check passed on the developer Sprite. CI also verifies a separate Rivet integration workflow. This is *not* a successful production enqueue test: production browser login, Neon JWT, migrated schema, live membership, worker dispatch, restarts, release and outreach approvals still require isolated integration verification.

## Verification

- Local outbox SQL tests validate lock, lease token, stale acknowledgment, retry/dead-letter, idempotency constraint, and non-destructive migration.
- Worker tests cover successful send/ack, failed send/retry, lost lease, malformed cross-prospect command, and correct workspace actor key.
- Full lint, type checks, unit tests, build and Rivet integration CI remain release gates.
- **Not yet proven**: applying migrations, racing claims and crash restart with a real isolated Neon DB, private worker deployment, live authenticated enqueue against Neon in one transaction, scheduled polling, Realtime notifications, RLS policies and complete integration with Neon Auth.

## Execution limits

Only use `morning-surf-12386530`, with staging branch `br-fancy-shadow-bekwm85g` for validation. Do not apply migrations to the production branch `br-steep-surf-bek7urvd` without explicit approval. Do not provision paid resources, change storage access, or publish customer material.

The Neon connector now reaches the correct project, and existing Neon Auth, Realtime, storage, AI Gateway and two private buckets (`psassets`, `psrivet`) were verified. Reuse rather than recreate them.
