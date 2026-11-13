# Prospect Studio — Production execution checkpoint

Checkpoint: 2026-11-12 UTC
Status: **VERIFIED STAGING API + PRIVATE PREVIEW; PRODUCTION BLOCKED**
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
- GitHub PR #7 CI `Verify` and `Rivet Integration` passed before merge. Draft GitHub PR #8 at https://github.com/mplsjohnnycage/PStudio/pull/8 also passed both checks at initial head `33a6aec` (security follow-up remains unpushed as of this checkpoint).
- **Auth dependency gate addressed in local code**: migrated deprecated `@neondatabase/auth@0.7.0-beta` to supported `@neon/auth@0.8.2`; transitive Better Auth now `1.7.22`, Zod `4.6.7`. Latest independent npm audit: **0 critical, 0 high, 8 moderate, 3 low**. Post-migration lint, typecheck, all 61 active tests and build passed; live sign-in has still not been verified.

## 2026-11-12 staging execution delta

- Neon Function pstudiohealth deployed: /health HTTP 200, schemaReady=true, database connected using provider-injected DATABASE_URL.
- Neon Function pstudioapi deployed on validation-20261111: /health HTTP 200, schemaReady=true, authReady=true (config present, not proof of real-user login). Workspace/prospect/job/preview routes return HTTP 401 for missing or forged JWT. Verified CORS allowlist and unknown 404.
- Staging URLs: https://br-fancy-shadow-bekwm85g-pstudioapi.compute.c-9.us-east-2.aws.neon.tech and https://br-fancy-shadow-bekwm85g-pstudiohealth.compute.c-9.us-east-2.aws.neon.tech.
- The Neon API bundle is fully bundled by tsdown with dependencies included. Production Neon branch unchanged; no secrets in Git or source.
- Better Auth trusted domain on staging now includes https://prospect-studio-foundation-b33vt.sprites.app; read-after-write verified.
- Sprite service pstudio-pilot-web runs Next.js on port 3000. Local HTTP GET returns 200 with app assets. External Sprite URL redirects unauthenticated visitors to Fly auth, so this is a private preview, NOT public production.
- Vercel project creation for the selected team was denied with HTTP 402 (overdue billing). Account owner action is required; no billing changes or alternate-account substitution attempted.
- Synthetic signup test was blocked by tool safety controls; real login, JWT exchange, browser session and completed external-enrichment job remain UNVERIFIED. Do not retry the blocked operation by another route.

## Hard production blockers (not optional)

1. **Authentication integration**: The high/critical dependency findings have been resolved locally, but the new `@neon/auth` client still requires a live credentialed sign-in, session refresh, JWT audience, CORS/trusted-domain and logout test against the intended managed Auth branch. Review remaining 8 moderate and 3 low findings and ensure the production dependency audit remains clean of high/critical risks.
2. **Real authentication unverified**: deployed Neon Auth origin, CORS/trusted domains, email signup policies, and end-to-end browser login/token-to-API flow have not been configured/verified. `NEXT_PUBLIC_NEON_AUTH_URL` defaults to an invalid placeholder and all protected actions fail closed.
3. **Real DB credentials / prod schema**: local `apps/server/.env` points to localhost, not Neon. Transferring a sensitive connection string from Neon connector into Sprite execution was blocked by safety controls; do not bypass it. Use a supported authorized secret-injection workflow. Production migrations were deliberately not applied.
4. **Worker is not a real enrichment engine**: `apps/worker/src/index.ts` deliberately throws when `NODE_ENV=production` or `RIVET_LOCAL_WORKER_ENABLED != 1`. Rivet jobGate state transitions and outbox transport are built, but an authenticated production worker, dispatcher, actual enrichment adapters, retries, completion reconciliation, and durable output require real integration.
5. **No full production loop**: no live discovery, prospect import from verified provider, enrichment execution, generated preview from enrichment, review approval, or browser end-to-end customer journey has been observed. The successful local manual-prospect-to-draft loop is not the full product definition.
6. **Public frontend blocked**: Vercel creation denied by billing HTTP 402. Sprite preview is running but gated by Fly login. No real authenticated end-to-end browser test. Do not expose it as production.
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
3. Draft PR #8 exists; publish tested SDK security fix, re-run all CI, then address review and deployment gaps. Do not merge until live runtime acceptance gates pass.
4. Validate managed Neon Auth live sign-in and use supported secure secret injection (do not pass raw connector credentials into tool arguments).
5. Implement actual enrichment worker and run isolated staged end-to-end workflow; only after passing ask/perform approved production promotion.
