# Prospect Studio — Rivet operator and ChatGPT MCP integration

Checkpoint: 2026-11-12 UTC. **STAGING INTEGRATION IMPLEMENTED; PRODUCTION BLOCKED.**

## Implemented

- One 15-capability strict Zod registry under packages/api, shared by the private dashboard operator, Rivet durable Pi agent and MCP tools. Reject arbitrary HTTP paths, SQL, shell operations, forged identity and model-issued owner approvals.
- Protected Neon Functions gateway exposes /v1/operator/tools, /v1/operator/execute, and authenticated /v1/workspaces/:id/agent/* endpoints.
- Private Rivet Pi actor is keyed to authenticated user and workspace with a durable actor identity document. Neon membership is checked for every tool operation. Per-user ChatGPT credentials stay in a separate private actor.
- Mobile/desktop operator panel reports private runtime status, starts ChatGPT consent, submits instructions, and polls user-session-scoped movement events. Unconfigured agent is visibly unavailable, not simulated.
- OAuth 2.1 MCP server uses official @neon/oauth and @modelcontextprotocol/server, with the same permission-checked DB functions as dashboard buttons. Fail closed when MCP_RESOURCE/provider are not configured.
- Dedicated sign-in, sign-up and consent pages exist, with anti-framing headers. Human review approval and denial remain owner-only; no public website publishing, outreach, payments or sending was added.

## Verified tests

- npm run check PASS (153 files); npm run check-types PASS.
- npm test PASS: 95 Node tests, 2 skipped opt-in external tests, 15 worker Vitest unit tests.
- npm run build PASS (includes auth screens); npm run build:neon -w server PASS (bundle imports).
- Tests cover JWT/workspace denial, idempotent enqueue, draft preview, requested human review, user-scoped movement, permission revocation, MCP initialize and 15-tool listing, MCP database-backed writes, arbitrary-path rejection and human approval gate.

## Staging deployment

- Neon project morning-surf-12386530, validation branch br-fancy-shadow-bekwm85g, database PS. Branch expires around 2026-11-18 23:17 UTC.
- Migration 0005 applied to staging in one transactional SQL block. Ledger ID 6, sha256 8e7489229c33ba5f6ae9d702815135914648dbacebc7a33d984954d5efdf8009. Verified two new agent tables, three check constraints and three foreign keys; no agent session/event records.
- One user-owned workspace, zero prospects, zero jobs and zero approvals at last staging readback.
- Neon Function pstudioapi deployment 4 completed, URL https://br-fancy-shadow-bekwm85g-pstudioapi.compute.c-9.us-east-2.aws.neon.tech. Live GET /health returned HTTP 200 schemaReady=true. Workspace/operator/agent routes returned 401 when unauthenticated. POST /mcp returned 503 mcp_oauth_not_configured.
- Private Sprite frontend restarted. Root and /auth/sign-in, /auth/sign-up and /auth/consent returned HTTP 200. CSS includes operator panel; auth routes return anti-framing headers. No signed-in browser OAuth test yet.

## Unresolved blockers — do not merge or claim production ready

1. Private HTTPS Rivet endpoint, namespace/token, staging DATABASE_URL, CHATGPT_HOST_ID and explicitly enabled worker secrets/config remain unavailable. No real Rivet job or Pi model request has executed.
2. Complete real ChatGPT plan consent and valid provider-model verification; check subscription/commercial terms, worker restart durability.
3. Public HTTPS frontend hosting for OAuth login/consent (Sprite is private). Authorize trusted origin and CORS only for real URL.
4. Enable Neon OAuth server only after login/consent resource URLs and signed token audience/issuer verification. Currently disabled; MCP is fail closed and no ChatGPT plugin registered/installed.
5. Verify logged-in staging discovery -> source provenance -> Rivet enrichment -> versioned private preview -> human approval -> persistence/restart. Capture genuine IDs/hash/browser desktop/mobile evidence.
6. Review CI and vulnerabilities, PR #8 reviews, production migration plan, public hosting, and rollback. No production DB migration, public promotion, merge or outreach was performed.

Prior source-backed local PGlite trace is not a full live external E2E run.
