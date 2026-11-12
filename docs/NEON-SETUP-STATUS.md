# Prospect Studio — Neon setup verification checkpoint (2026-11-11)

## Scope and authority

Standalone application in Fly Sprite `prospect-studio-foundation` (`sprite-8d7a3d82-ebce-4d37-8ec5-1ef5b371ba74`), repository `https://github.com/mplsjohnnycage/PStudio` (public by owner decision). Original `prospect-studio` Sprite and Convex application are separate and untouched.

Target Neon organization `org-noisy-bread-62731739`, project `morning-surf-12386530` (`PS`, `aws-us-east-2`), default `production` branch `br-steep-surf-bek7urvd`, database `PS`, role `PS_owner`.

## Verified milestones

- GitHub initial foundation imported with 101 tracked file hashes verified, PR #1 merged into main (merge SHA `3c9786c7ceed031447341cc011c3f026cc07e17a`). Main ruleset 27077000 active, requiring PRs and four status checks (`check`, `check-types`, `test`, `build`), preventing deletion and force pushes. CI completed 4/4 checks successfully.
- `neon@9.3.2` installed globally. `neon init -y --org-id org-noisy-bread-62731739 --project-id morning-surf-12386530 --branch production --services postgres,auth,ai-gateway,object-storage,realtime` exited 0 and created `neon.ts`. **It wrote the link offline**; this did not deploy services. Installed Neon agent skills were consulted.
- Native Fly Sprite Neon gateway was authorized and verified project, default production branch and connection. Read-only PostgreSQL smoke test connected to `PS` on production, showing 0 public tables at that time.
- The Neon CLI supports querying the project through Fly's credential-hidden gateway when given `NEON_API_HOST=<Sprite Neon gateway>/api/v2` and a non-secret placeholder `NEON_API_KEY`. However `neon config plan` failed on the gateway's unsupported Auth-management endpoint. No `neon deploy` succeeded; browser-based `neon login` timed out.
- Isolated temporary Neon validation branch: `br-fancy-shadow-bekwm85g` (`validation-20261111`), parent production, expires `2026-11-18T23:17:49Z`. This is **not** a release branch.
- An initial database migration test failed. Root cause confirmed by SQLSTATE 42830: composite foreign-key targets used `uniqueIndex()` created after `ALTER TABLE ... ADD FOREIGN KEY`. Fixed by `unique()` table-level constraints in `packages/db/src/schema/index.ts`, added a regression test, regenerated a new initial migration `packages/db/src/migrations/0000_fluffy_thunderbolt_ross.sql`, and verified its 38 SQL statements **all succeed inside a transaction that rolls back** on the validation branch. Drizzle migration metadata consistency check passed.
- Before correction, Drizzle's failed application left only `drizzle.__drizzle_migrations` and no public app tables on the validation branch. Subsequent live migration execution was blocked by tool safety checks before execution. **Do not claim the new migration was applied.**
- Tests: 16/16 pass; lint, TypeScript, and build passed. Node 24/npm 12 toolchain. npm audit: 0 high/critical; 11 total low/moderate findings, including 6 with `--omit=dev`; these require further review before public deployment.

## Declared services (not yet verified as running)

`neon.ts` declares Managed Better Auth, AI Gateway, private `assets` bucket, preview realtime and a 7-day TTL for newly created non-default branches. PostgreSQL already exists through the project. Neon AI Gateway inference requires separate credits/allowance; no inference was invoked or paid for in this setup.

## Security and production gates

1. Authenticate Neon CLI **without exposing credentials in chat**. Prefer completing `neon login` interactively inside the Sprite where the callback runs, or securely configure a project-scoped API key on that Sprite (e.g., via `sprite-env env set` run by the owner) and allow the CLI to use it. The Fly connector is restricted to some API routes and is **not** full CLI authentication.
2. Re-run `neon config plan` under full authorized Neon API access and review the diff, then `neon deploy --project-id morning-surf-12386530 --branch production` only with approved scope. Verify each service independently, including storage read/write, real authentication lifecycle and authorization denial, AI model availability/inference gating, realtime subscription. Production custom SMTP, trusted origins, RLS, roles, quotas and scoped object links remain required.
3. Independently apply and verify the corrected Drizzle migration on the validation branch first, with a direct (non-pooled) URL. Check table constraints, transaction isolation and rollback strategy; only then apply to the production database. Do not point integration tests or migration runs at production accidentally.
4. Keep all environment secrets server-side in ignored environment files / Sprite secrets, never in the public repo or browser bundles. Do not use any customer data, send external email or publish customer previews until explicit approval and authorization tests.
5. Publish this setup's code changes via a separate PR and validate GitHub CI; no force pushes. Continue native Neon SDK/Drizzle/Better Auth/storage/realtime integrations and their browser end-to-end tests.

## Cost controls

At last Fly Sprite inventory, 20/20 were cold and 0 running. Cold Sprites do not incur compute charges but still use billable storage. Fly Apps/Machines and billing were not accessible with the currently granted Sprites-only tooling; dashboard quota '0/100 Machines' is not a billing receipt. Fly's Cross-Organization Relay remains unnecessary and should stay disabled.

## Resume

1. Inspect `git status` on `setup/neon-services` in `/home/sprite/prospect-studio` and confirm the corrected migration and `neon.ts` are present.
2. Verify full checks, commit changed code, push as a PR to `mplsjohnnycage/PStudio`, and wait for CI.
3. On proper Neon CLI authentication, run plan/deploy and end-to-end tests; stop on any unmet production gate.
