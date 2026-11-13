# Prospect Studio production cutover and Neon Auth email OTP verification

## Verified production infrastructure (2026-11-13 UTC)

- Production GitHub main source at launch: `f6f8ca7e94caae044e793eeebadca3e189e66a8e` (reviewed PR #8).
- Separate Vercel production frontend `pstudio-production-johnnyc.vercel.app`, release `dpl_izEnhBS6vjkF5Y2uHtR4ZJHFWBXT`, READY. External GET `/`, `/auth/sign-up`, `/auth/sign-in`, `/auth/consent` all returned 200 without an SSO redirect.
- Separate Vercel production Hono API `pstudio-production-api-johnnyc.vercel.app`, release `dpl_8nC8Pc65PMZi2EwLmBGLRWQww7y3`, READY. External GET `/health` 200 with `authReady` and `schemaReady` true; POST `/rpc/healthCheck` 200; GET `/.well-known/oauth-protected-resource` 200; unauthenticated MCP/privileged Hono routes 401; authenticated origin CORS OPTIONS 204.
- Neon project `morning-surf-12386530`, production branch `br-steep-surf-bek7urvd`, DB `PS`: six Drizzle migrations and 19 public tables. Compared with staging and migration-rehearsal branches: exact same 19 tables / 129 columns / 40 indexes / 180 constraints and matching signatures. No production users or workspaces before first owner signup. Existing Neon snapshot `snap-purple-sky-beo2t6ww` created before migration; no new snapshot could be created because Neon snapshot limit reached. Separate pristine cutover branch `br-summer-sea-bepsk6it` retained. No data was deleted.
- Production least-privilege role `pstudio_prod_worker_20261113` can read/write `PS.public` but not `neon_auth`. Vercel `DATABASE_URL`, `RIVET_TOKEN`, `SPRITES_TOKEN` stored encrypted, production-only.
- Rivet Cloud cluster `pstudio`: production namespace `production` and own pool `default` run on isolated production Sprite services `pstudio-rivet-production-node` and `pstudio-production-outbox-dispatcher`. Existing staging services remain separate. An actor was safely submitted to `awaiting_approval`, then denied into `cancelled` (never touched DB). Controlled service restart with the dispatcher stopped first succeeded; actor state remained `cancelled` with same job ID and attempt 0 after reconnect, pool reported one connected node version 1. Earlier logs include transient WebSocket and SQLite shutdown errors on connection loss; this should be monitored for interruptions/retries.
- Neon Auth production OAuth2.1 server enabled with primary Hono MCP resource, production sign-in and consent URLs, trusted Vercel production origins. Production email signup has email verification by OTP enabled and requires email verification.

## Signup verification correction

Original `apps/web/src/app/auth/sign-up/page.tsx` redirected immediately to `/` after `signUp.email`, incorrectly treating creation of a user record as a valid session when Neon requires email OTP. Home login also had an independent signup path which merely told users to confirm email. Corrected by:

- `apps/web/src/lib/email-signup.ts` distinguishes an established session, pending email verification, verified-but-sign-in-required, and explicit errors. Uses the managed Neon `emailOtp.verifyEmail` and `emailOtp.sendVerificationOtp` plugin, with runtime API presence confirmed against installed `@neon/auth@0.8.2`.
- Sign-up form collects and verifies OTP before resuming OAuth or entering the workspace, and allows resend. It never considers signup success equivalent to authenticated.
- Home login now links to the same `/auth/sign-up` flow rather than maintaining a divergent signup state. A sign-in checks actual Neon session before showing the workspace.
- Five focused OTP tests cover verification-required, immediate-session, errors, successful OTP and sign-in-needed fallback, resend route, and rate-limited resend. Tests integrated with root `npm test`.

## Validation and limits

Local `npm run check`, `npm run check-types`, `npm test`, `npm run build` PASS (102 Node tests pass, 2 external opt-in skipped; 22 worker and 4 Sprite-action tests pass; five new OTP tests pass). Typecheck and Next.js release build pass. A genuine owner signup/received email OTP and authenticated workspace operation are **not** verifiable without the owner's real credentials; never invent or simulate user identity. External network smoke tests verify only the deployed login surfaces and unauthenticated HTTP protections; these are not a substitute for browser completion.

Do not publish a prospect preview, approve prospect output, or authorize external outreach automatically. Rivet runtime and production Neon data remain isolated from the staging namespace.
