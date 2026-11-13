# Neon Functions — Prospect Studio staging API

Environment: Neon project morning-surf-12386530, staging branch validation-20261111 / br-fancy-shadow-bekwm85g, database PS. Production untouched.

## API

- GET /health (read-only unauthenticated readiness)
- GET/POST /v1/workspaces
- GET/POST /v1/workspaces/:workspaceId/prospects
- GET /v1/workspaces/:workspaceId/jobs
- POST /v1/workspaces/:workspaceId/prospects/:prospectId/jobs
- POST /v1/workspaces/:workspaceId/prospects/:prospectId/previews
- GET /v1/workspaces/:workspaceId/previews/:previewId

Every /v1 route requires a signed Managed Neon Auth JWT and database membership. Deny missing, forged or expired tokens. CORS is allowlisted and the code exposes no public SQL or Rivet actor controls.

## Reproducible build

Run npm ci; npm run check; npm run check-types; npm test; npm run build:neon -w server; npm run package:neon -w server. The tsdown output includes one main file `neon-api.mjs` **and may include linked `*.mjs` chunks**. Package **all** emitted `*.mjs` with the helper; it maps the main file to `index.mjs` and retains every linked chunk. Never zip only the entry file when it imports siblings. Verify the archive locally by importing its extracted `index.mjs`, then deploy `apps/server/dist-neon/function.zip` using the authenticated Neon Functions tool to slug `pstudioapi` with nodejs24 **on staging first**.

Neon injects DATABASE_URL, NEON_AUTH_BASE_URL and NEON_AUTH_JWKS_URL; never store those values in source, logs, Git or ChatGPT output. Custom function env only sets explicit safe CORS_ORIGIN values.

## Verified staging probes

- Function pstudiohealth deployment 1: GET /health 200 schemaReady=true, unknown GET 404, invalid POST 405.
- Function pstudioapi deployment 1: GET /health 200 with schemaReady=true and authReady=true. authReady means env settings are present; it DOES NOT prove live signed token exchange.
- Missing or forged JWT to workspace, prospect, job and preview endpoints: 401. Unknown route: 404. Allowlisted Sprite origin receives CORS header.
- Next.js Sprite service pstudio-pilot-web is running and serves local HTTP 200; public Sprite hostname redirects anonymous users to Fly authentication.
- Staging Better Auth trusts the precise Sprite hostname.

## Production blockers

Real browser sign-in/JWT validation not run (synthetic signup attempt blocked by runtime safety controls); no external enrichment worker run; no production database migration; no public deployment. Vercel returned HTTP 402 for project creation due overdue billing. Do not claim full production readiness.

Staging validation branch expires around 2026-11-18 UTC. Confirm identity/retention before any further deployment.
## Subsequent checkpoint (2026-11-12)

Read verification/2026-11-12-agent-mcp-staging-gates.md for the later migration, staging function version 4, OAuth/MCP status and production blockers. Newer evidence supersedes older statements.
