# Prospect Studio — Production execution checkpoint

Checkpoint: 2026-11-12 UTC
Status: **VERIFIED LOCAL VERTICAL SLICE; PRODUCTION BLOCKED**
Repo: `mplsjohnnycage/PStudio`; worktree: `/home/sprite/prospect-studio`; branch `feat/pstudio-pilot-vertical-slice`
Sprite identity: `prospect-studio-foundation` / `sprite-8d7a3d82-ebce-4d37-8ec5-1ef5b371ba74` (do not substitute the older `prospect-studio` Sprite).

## Verified

- Authenticated job enqueue, including transaction-level atomicity, is merged on GitHub main via PR #7, merge SHA `ce4383be6eec6ad80f350048199a4a514a7c0dea`. The signed Neon JWT must match issuer and audience; role and workspace authorization are database-backed.
- Local pilot branch adds authenticated workspace creation, prospect creation/listing, operator-reported immutable evidence, enrichment job/outbox enqueue, and private release/preview generation and read.
- The preview generator escapes untrusted text, marks claims as operator-reported, never invents websites, renders without client scripts, and does not publish/send outreach.
- Map-first Next.js interface offers login, workspace selection/create, manual prospect creation, queued enrichment, private draft preview, and map background. It intentionally does **not** claim verified business coordinates or working discovery automation.
- Test `apps/server/tests/local-pg-flow.test.mjs` uses PGlite with all 4 real migration SQL files; verifies signed EdDSA JWT, scoped membership, prospect evidence, missing-website semantics, idempotent outbox, two versioned private release drafts, outsider denial, and full rollback. This is local PostgreSQL-compatible integration, **not** a deployed Neon/Rivet worker run.
- Verified local commands before this checkpoint: `npm run check` (pass), `npm run check-types` (pass), `npm test` (52 Node tests passed, 1 live-Neon test skipped, 9 Vitest tests passed = **61 passing, one skipped**), `npm run build` (pass).
- Staging Neon project `morning-surf-12386530`, database `PS`, branch `validation-20261111` / `br-fancy-shadow-bekwm85g`: additive migrations 0000 through 0003 applied; readback verified `drizzle.__drizzle_migrations = 4` and `release_artifacts` table present. The root `production` branch `br-steep-surf-bek7urvd` has not been migrated by this work.
- GitHub PR #7 CI `Verify` and `Rivet Integration` passed before merge; no CI success claim is made for this new pilot branch until its own checks run.

## Hard production blockers (not optional)

1. **Auth security**: latest `npm audit --json` still identifies 20 findings: **1 critical and 3 high**, including pinned vulnerable `better-auth@1.7.6` and `zod@4.5.4` transitive under `@neondatabase/auth@0.7.0-beta`. Local package overrides did not remove these versions. Worker Vitest upgrade to 5.1.0 fixed other critical findings. Do not expose production login until the auth chain is fixed and independently audited.
2. **Real authentication unverified**: deployed Neon Auth origin, CORS/trusted domains, email signup policies, and end-to-end browser login/token-to-API flow have not been configured/verified. `NEXT_PUBLIC_NEON_AUTH_URL` defaults to an invalid placeholder and all protected actions fail closed.
3. **Real DB credentials / prod schema**: local `apps/server/.env` points to localhost, not Neon. Transferring a sensitive connection string from Neon connector into Sprite execution was blocked by safety controls; do not bypass it. Use a supported authorized secret-injection workflow. Production migrations were deliberately not applied.
4. **Worker is not a real enrichment engine**: `apps/worker/src/index.ts` deliberately throws when `NODE_ENV=production` or `RIVET_LOCAL_WORKER_ENABLED != 1`. Rivet jobGate state transitions and outbox transport are built, but an authenticated production worker, dispatcher, actual enrichment adapters, retries, completion reconciliation, and durable output require real integration.
5. **No full production loop**: no live discovery, prospect import from verified provider, enrichment execution, generated preview from enrichment, review approval, or browser end-to-end customer journey has been observed. The successful local manual-prospect-to-draft loop is not the full product definition.
6. **No public production deployment**: no verified hosting revision, public URL, or authenticated browser test. Do not expose the incomplete interface as ready.
7. **Staging retention**: validation branch has a TTL (recorded expiry 2026-11-18 UTC); secure a durable new validation branch if it expires before deployment.

## Acceptance gates for real production

- Resolve all critical/high runtime/auth vulnerabilities; verify `npm audit` output and dependency versions, review any remaining moderate.
- Configure secure secrets and Neon Auth policies without writing credentials to source, logs, Git, or this checkpoint. Verify real end-user JWT issuer, audience, and server-side authorization.
- Apply tested additive migrations to production through an approved, reversible process with backup/snapshot and readback. Verify all FK/tenant invariants.
- Implement/provision authorized isolated Rivet worker, enrichment adapter and outbox background dispatcher; test one real queued job through `queued -> running -> completed` with output evidence and retries.
- Provide a browser-accessible production deployment and run one complete, inspectable test prospect: sourced discovery/manual admission -> dedupe -> enrichment -> claims/evidence -> versioned site -> private review -> approval. Never auto-send prospect outreach, spend money or publish sites without explicit approval.
- Observe logs, idempotency under retries, denied membership, access revocation, and restore/restart behavior. Confirm zero unsupported claims.

## Safe resume

1. Confirm immutable Sprite ID, branch, working tree, remote main SHA and running sessions.
2. Validate the checkpoint's current test/audit claims against live code; preserve any uncommitted changes.
3. Create a draft GitHub PR for pilot, run CI and fix any defects. Do not merge if critical/high auth findings remain.
4. Solve the compatible Neon Auth dependency security problem and set up supported secret injection.
5. Implement actual enrichment worker and run isolated staged end-to-end workflow; only after passing ask/perform approved production promotion.
