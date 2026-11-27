# PStudio release lifecycle

The existing standalone Next.js/Hono/Neon/Rivet product is the release unit. Git source is the immutable commit SHA, not a floating branch name. Business approval state remains in Neon; worker state remains in Rivet.

## Gates

1. Use an isolated worktree, review the exact diff, and run check, env:generate, check-types, test and build. Keep all credentials outside Git and build logs.
2. Publish a PR. Require the Verify release verification gate, Discovery Python and Rivet Integration jobs to succeed for the exact head SHA. Require independent review before merge. A green build is not authenticated product acceptance.
3. Deploy the same SHA to protected staging with only staging variables, including the separate OAuth staging Neon branch. Use the stable trusted staging origin; test browser authentication, tenant-scoped evidence, preview continuity, calendar/inbox and approval boundaries. Invalid/missing bearer tokens must be denied. Never use a production token to test staging.
4. Confirm the existing production rollback deployment IDs and database identity, then promote only the accepted SHA through a separate explicitly authorized production deployment. The production project must not auto-promote arbitrary pushes. Configure branch protection/rulesets in GitHub settings; this document does not enforce them by itself.
5. Preserve the previous healthy deployment until smoke tests and owner acceptance pass. Roll back the frontend and API together to the recorded known-good deployment IDs if needed. Never automatically roll back or migrate the database; schema changes require a separate tested migration and recovery plan.

## Frontend API transport

Set NEXT_PUBLIC_PSTUDIO_SAME_ORIGIN=1 at build time to route browser /v1 requests through the Next.js server. Set PSTUDIO_API_UPSTREAM_URL to the environment-specific fixed HTTPS Hono origin. Keep NEXT_PUBLIC_SERVER_URL valid for the existing oRPC client and environment schema. Optional PSTUDIO_API_TRUSTED_SOURCE=1 enables short-lived Vercel OIDC transport authentication only when the target protection is explicitly configured to trust the source project and matching environment. Never forward browser cookies or caller-supplied trusted-source headers. The original user bearer token remains the authoritative application identity. The backend must always enforce workspace access, approval gates, and all business authorization; the proxy is not a replacement for those checks.

## GettUpp migration

GettUpp staging project pstudio-personal (team gettupp-ents-projects) is separate from the prior production web and API projects. Keep Vercel deployment protection enabled. Reuse the existing staging and production Neon resources; do not clone production data or create a second source of truth. Verify project transfer eligibility, protection and environment-variable isolation before production cutover. Do not route staging to production data. Keep the prior production projects and domains intact until the replacement has passed acceptance. No automatic outreach or changes to owner approval are included.
