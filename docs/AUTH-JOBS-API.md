# Authenticated Workspace Jobs API (implementation checkpoint)

## API contract

**Read-only route:** `GET /v1/workspaces/:workspaceId/jobs`

- Requires `Authorization: Bearer <short-lived Neon Managed Better Auth JWT>`.
- Verifies EdDSA signature using configured Neon JWKS, signed-token issuer, **audience equal to the trusted Neon Auth origin**, expiration and nonempty `sub`. Rejects an unsigned, malformed, invalid, expired or non-expiring token.
- Uses only the verified `sub` as the caller identity. Never trust `x-user-id`, `x-workspace-id` or JWT workspace attributes for access decisions.
- Checks database membership in `workspace_memberships` (workspace + user composite key), then enforces the same membership again in the jobs query via an inner join to `prospects.workspace_id`. No per-workspace membership or records are returned to callers outside that scope.
- Results are capped to 100 jobs, newest first; returns selected non-sensitive job summary fields only.
- `401` for missing/invalid authentication, `400` for malformed workspace ID, `404` when no matching workspace membership, and `503` for DB errors without leaking SQL details.

**This original read-only change now coexists with the new locally implemented write route.** Approval mutation, customer outreach and direct Rivet actor access are still absent. No first-login/self-enrollment route exists.

## Authenticated enqueue (implemented locally; not deployed)

`POST /v1/workspaces/:workspaceId/prospects/:prospectId/jobs` requires a short-lived signed Neon Managed Better Auth JWT (valid EdDSA signature, issuer, audience, expiry and subject); `Idempotency-Key` is mandatory (8–64 ASCII alphanumeric, underscore or hyphen characters). Accepts only `{"type":"enrich"}` and returns `202 {"jobId":"...","state":"queued"}`, `401` for unauthorized, `404` for missing resource or non-operator workspace membership, `409` for an idempotency conflict, or `503` when persistence is unavailable.

The server never trusts client-supplied user identity. Within one DB transaction it locks the `owner`/`operator` workspace membership and matching prospect, inserts deterministic SHA-256-derived job and outbox IDs, verifies replayed job/command content, and aborts the entire transaction on semantic conflict. Jobs are enrichment-only; no outreach, approval, sending, external crawl or paid inference is triggered by the API. Outbox delivery is a separate disabled-by-default worker action. There is no publicly exposed Rivet control plane.

Verification at this PR: 3 Hono enqueue HTTP tests; 5 DB transaction tests (including a RED→GREEN outbox rollback regression); full 48-test suite, lint, TypeScript, build and Drizzle migration check passed on the developer Sprite. CI also verifies a separate Rivet integration workflow. This is *not* a successful production enqueue test: production browser login, Neon JWT, migrated schema, live membership, worker dispatch, restarts, release and outreach approvals still require isolated integration verification.

## Required server configuration

Configure in `apps/server/.env.schema` / runtime secret manager:
- `DATABASE_URL`: direct/pooled PostgreSQL connection per runtime.
- `CORS_ORIGIN`: exact approved web origin (never wildcard).
- `NEON_AUTH_BASE_URL`: trusted Managed Better Auth base URL; JWT issuer must match its origin.
- `NEON_AUTH_JWKS_URL`: HTTPS URL for Neon Auth signing public keys; do not use a user-supplied URL.

`NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` are optional to permit offline builds and local unauthenticated health checks; protected requests fail closed until both are configured. A **production release must fail its readiness gate** if these are missing or misconfigured. Neon Auth JWTs are not interchangeable with opaque Better Auth session cookies. The calling web app must obtain and refresh the actual JWT from Neon Auth and supply the bearer token.

Start the packaged Hono server from its workspace directory (`cd apps/server && npm run start`) so Varlock finds the local environment schema. Starting `node apps/server/dist/index.mjs` from the monorepo root was previously observed to load no environment files and return 500 for the CORS middleware.

## Schema and deployment

New additive migration `packages/db/src/migrations/0001_lush_mister_sinister.sql` creates `workspace_memberships` with `workspace_id` FK to `workspaces`, `user_id` from verified Neon Auth, role constrained to owner/operator/viewer, composite primary key and membership lookup index. No existing tables are dropped or rewritten.

Workspace membership is a privileged administrative enrollment action, not a property that the caller can insert for themselves. Seed verified user IDs only after the owner's explicit approval and identity verification.

**Deployment remains blocked:** the direct Neon connector has no membership in organization `org-noisy-bread-62731739`; the Fly Sprite Neon gateway grants limited access but cannot deploy full Neon Auth services. Neither initial migration nor this additional membership migration is confirmed applied to a live database. No customer data has been touched.

## Test coverage and remaining gates

- Real EdDSA signatures with local test JWKS; wrong issuer, wrong key, expiry and missing configuration denial.
- Hono request tests for unauthorized/forged identity, workspace separation, membership DB failure and a signed JWT through the HTTP route.
- Generated Drizzle SQL inspected for user-membership + workspace joins; migration checks for workspace FK, role limits, composite PK and absence of destructive drops.
- Full CI must pass: lint, types, unit tests, build, Rivet runtime integration.
- Still required: validate actual Neon JWT on isolated Neon branch, establish real workspace membership, test DB query against that branch, activate RLS as appropriate, test browser sign-in/out/token renewal and revocation, implement write-side transactional outbox and authenticated Rivet command dispatch, exercise recovery/restart and production readiness. Do not call this feature live or production-ready before those checks pass.
