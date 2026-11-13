# Prospect Studio — staging execution evidence

**Execution UTC:** 2026-11-12 19:03–19:17 UTC
**Decision:** PARTIALLY COMPLETE — not production ready; full E2E acceptance FAILED / BLOCKED
**Repository:** `mplsjohnnycage/PStudio`
**Branch:** `feat/pstudio-pilot-vertical-slice`, draft PR #8
**Baseline remote commit:** `30ed53c2fb2b4ecb791d74df3056cd25a367019c`
**Source recovery commit:** `63e3fa9101bb7a791f7e7ad2cf68821f7a467815` (newer code/report commit is the containing Git revision)
**Initial local commit:** `1bb9d1bb4d16403ba24506ea79059f7674d52f93`
**CI for recovered commit:** Verify https://github.com/mplsjohnnycage/PStudio/actions/runs/43282866098 — success; Rivet Integration https://github.com/mplsjohnnycage/PStudio/actions/runs/43282866146 — success. Check final commit's fresh CI separately.

## Infrastructure and deployment

- Sprite: `prospect-studio-foundation` / `sprite-8d7a3d82-ebce-4d37-8ec5-1ef5b371ba74`; worktree `/home/sprite/prospect-studio`.
- Frontend: private Next.js Sprite service `pstudio-pilot-web`, port 3000, restart verified; local GET returned HTTP 200. Fly identity protection remains enabled. The public deployment prerequisite is **not met**. Frontend was rebuilt with ignored nonsecret `.env.local` pointing to staging API and managed Neon Auth URLs.
- Database: Neon project `morning-surf-12386530`, database `PS`, validation branch `br-fancy-shadow-bekwm85g`. Production branch `br-steep-surf-bek7urvd` was **not modified**. Staging branch expiry: 2026-11-18 UTC.
- Staging API: Neon Function `pstudioapi`, deployment **3** on staging, Node.js 24; deployed bundle SHA-256 `9bc2de51941274381bfc02d44f67db11df1d588dd7e8936ffb54e282d8bd70b1`.
- Live HTTP probes on deployment 3: `GET /health` → 200 `{authReady:true,schemaReady:true,status:"ok"}`. Anonymous `POST /v1/workspaces/ws1/discover/minneapolis-license` → 401. Anonymous `GET /v1/workspaces/ws1/previews/prev1/review` → 401. These are routing/auth-denial checks, NOT a real signed-in workflow.
- Neon managed Auth exists with email/password settings and trusted private Sprite origin. **No active test user exists.** Staging SQL `SELECT COUNT(*) FROM neon_auth."user"` → **0**. The frontend's real sign-in, session refresh and signed JWT exchange are **unverified**; no synthetic signup was attempted here because the prior checkpoint records that method as blocked.
- Neon staging SQL readback: migrations **4**, Auth users **0**, workspaces **0**, prospects **0**, evidence **0**, claims **0**, jobs **0**, release artifacts **0**, approvals **0**.

## Implemented and locally tested changes

1. **Sourced admission:** `packages/db/src/admission-queries.ts` atomically creates a workspace-scoped prospect, immutable source evidence, reported claims, claim-to-evidence links, and a unique provider/external-ID association. Exact repeats return the same prospect ID without duplicate records. Workspace owner/operator access enforced; outsider and viewer denied. Tested with all four real schema migrations in PGlite. This is a real database-compatible local test, not staging persisted admission.
2. **Fixed-host real public discovery:** `apps/server/src/minneapolis-license-source.ts` reads a bounded set of historical City of Minneapolis ArcGIS license records, rejects malformed search and invalid records, avoids personally identifying contact fields, captures retrieval timestamp and provider source URL. `apps/server/src/discovery-api.ts` requires a signed JWT and current operator membership **before** contacting the provider, handles ambiguity with explicit selected external ID, and admits via the source-backed transaction. Frontend provides a discovery search and optional license-ID selection input. Records are labeled `historical_unverified`; a recorded historical license is never presented as proof of an active business or license. Upstream timeout and error handling tested.
3. **Private review lifecycle:** `packages/db/src/review-queries.ts`, `apps/server/src/review-api.ts`, and UI controls implement review submission, owner-only approval/rejection, idempotency, separate version history, and immutable approved HTML. PGlite tests verify authorization, collision handling, later drafts not replacing an approved artifact, and privileged access to approved snapshots after original draft expiry. No public website is published.

### Real source evidence (not a persisted production workflow)

- Provider endpoint: `https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Residential_Specialty/FeatureServer/0/query`.
- Live query: `dbaName LIKE '%EXCELSIOR PAINT%'`, maximum five results, exact returned match count **1**.
- Observed public record name: `EXCELSIOR PAINT & DESIGN`, external ID `TLIC22572`, provider `minneapolis_residential_specialty`, retrieval UTC `2026-11-12T19:13:53.584Z`.
- Source response excerpt SHA-256: `d7b3ee8f17da874940675fa3d7da5e5745b59446ce527df2c585c80d946aff81`.
- Reported license expiration: **2023-12-01**; **historical only**, not evidence of current licensing or business operation.
- This external fetch was real. Its admission/queueing/review was **not executed against live Neon**, because no authorized staging user exists.

## QA and security

Commands executed from the Sprite at `2026-11-12T19:15:18Z`:

| Command | Result |
| --- | --- |
| `npm run check` | PASS |
| `npm run check-types` | PASS |
| `npm test` | PASS: 68 Node tests, 1 live Neon test skipped; 9 worker unit tests passed |
| `npm run build` | PASS |
| `npm run build:neon -w server` | PASS |
| `npm audit --json` | 0 critical, 0 high, 8 moderate, 3 low. Exit 1 reflects remaining advisories |
| `npm run test:integration -w @prospect-studio/worker` on Sprite | **FAIL: timeout after 30 seconds** |

Local Rivet failure investigation: instrumented `apps/worker/tests/integration/job-gate.integration.test.ts` solely for diagnosis, observed `before setupTest`, never observed `after setupTest`; the hang occurs during `setupTest(testCtx, registry)` initialization, before any outbox publication or state transition. Original test source was restored. This is not a successful live Rivet run. GitHub's Rivet Integration passed on prior source-recovery commit, but does not establish external real enrichment.

## Mandatory acceptance trace (not achieved)

| Stage | Observed result | Persistent ID |
| --- | --- | --- |
| Real authorized browser login | BLOCKED: no managed Auth user | none |
| Public discovery | PASS: actual external read | public provider ID `TLIC22572` only |
| Authenticated discovery admission and deduplication in staging | BLOCKED | none |
| Job enqueue in staging | BLOCKED | none |
| Rivet private worker execution | NOT IMPLEMENTED in production; local test setup timeout | none |
| Actual enrichment with durable evidence | NOT IMPLEMENTED | none |
| Persisted website artifact in staging | NOT RUN | none |
| Actual private browser preview | UNVERIFIED | none |
| Recorded authorized review/approval in staging | NOT RUN; local tests pass | none |
| Restart-safe re-fetch of live approved artifact | NOT RUN | none |
| Unauthorized route denial | PASS: 401 for anonymous requests | route probes |
| Full correlated discovery→approved-release trace | **FAIL / INCOMPLETE** | none |

## Release blockers and required actions

1. Authorized managed Neon Auth staging test identity and real browser login: no staging users exist; do not circumvent earlier blocked synthetic signup operation or fabricate credentials.
2. Private Rivet service/dispatcher integration and secure staging DB access, currently absent. Current worker startup intentionally rejects production, outbox publisher and Rivet workflow are present but do not execute a real enrichment adapter. Diagnose the local Rivet test fixture startup separately.
3. Persist completed enrichment job output and claims/evidence with retry/recovery mechanics in real staging; demonstrate traceable status transition to completion. Existing source admission is *not* this worker.
4. Real staging browser sign-in, rendered preview and owner review/approval; rerun the full acceptance trace with actual stable IDs and verify restart persistence.
5. Public production frontend is blocked by Vercel account billing HTTP402 from prior handoff. No billing change/alternate public host was attempted.
6. Production migration and exposure need explicit owner authorization. The production Neon branch and customer websites remain untouched.
7. Review remaining 8 moderate and 3 low audit findings, staging expiry, logging, rate limits, and backup/recovery before release.

**Outcome:** Source control, real public discovery adapter, sourced local admission, private review and staging API/UI were advanced and validated at their boundaries. A completed real persistent prospect lifecycle and production readiness are **not established**. Do not treat health, mocked unit tests, or merely queued work as acceptance proof.
