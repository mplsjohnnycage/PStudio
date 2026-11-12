# Prospect Studio — Enrichment worker engineering verification

**Date:** 2026-11-12 UTC
**Repository:** mplsjohnnycage/PStudio
**Branch:** feat/pstudio-pilot-vertical-slice
**Draft PR:** https://github.com/mplsjohnnycage/PStudio/pull/8
**Final status:** PARTIALLY COMPLETE — production and real prospect end-to-end verification NOT achieved

## Infrastructure identity and separation

- Runtime: Sprite \`prospect-studio-foundation\`, immutable ID \`sprite-8d7a3d82-ebce-4d37-8ec5-1ef5b371ba74\`; the separate older \`prospect-studio\` Sprite is not this application's deployment.
- Private Next.js service: \`pstudio-pilot-web\` running on Sprite port 3000. Successful local HTTP 200 is not proof of signed-in browser functionality.
- Neon: project \`morning-surf-12386530\`, staging branch \`br-fancy-shadow-bekwm85g\` / \`validation-20261111\`, database \`PS\`; staging expires November 18, 2026.
- Production Neon branch \`br-steep-surf-bek7urvd\` has NOT received these migrations.
- Staging authenticated Neon Function \`pstudioapi\`: \`/health\` returned HTTP 200 with \`schemaReady=true\` and \`authReady=true\` (configuration presence only); unauthenticated discovery/review/workspaces calls returned HTTP 401.
- Managed Neon Auth configuration exists with staging frontend in trusted origins; real authorized browser sign-in, JWT exchange, refresh, and logout **not yet verified**.
- Private Rivet service is NOT configured/running on Sprite: required endpoint, token/namespace and worker database connection environment are absent. No authenticated external enrichment job has completed.
- Public production hosting is blocked by previously observed Vercel account HTTP 402. No billing changes or public exposure attempted.

## Implemented in this engineering change

1. **Canonical additive migration \`0004_fine_ender_wiggin.sql\`**, generated with Drizzle Kit and paired with \`0004_snapshot.json\`. The table \`job_attempts\` has composite job/attempt primary key, bounded attempt and state checks, safe error codes, two FKs, timestamps, and indexed state/time.
2. **Atomic enrichment attempt and completion persistence** in \`packages/db/src/enrichment-queries.ts\`: incrementally claim bounded jobs; attach exact external-source identity; atomically write timestamped evidence, SHA-256, source-backed reported claims, claim-to-evidence links, job completion, and prospect enriched stage; keep retry/failure/interrupt states durable.
3. **Fixed public-source exact-ID lookup** in \`apps/server/src/minneapolis-license-source.ts\`: bounded ArcGIS query, validated identifier, explicit identity match, 8-second timeout, response size guard, no current-license inference.
4. **Private Rivet worker + dispatcher implementation** under \`apps/worker/src\`: fail-closed credential/config check; durable outbox claim and private Rivet submission; opt-in Rivet actor execution invoking enrichment; bounded retry/backoff; stale DB attempt recovery; safe structured event logging. The real worker is NOT deployed or operational until authorized private Rivet/database credentials and process configuration are provisioned and verified.
5. **Unit and PostgreSQL-compatible integration regression tests** for evidence persistence, bounded failure, identity mismatch, stale recovery, public lookup, private transport and enrichment orchestration.

## Verified evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| Local lint | \`npm run check\` | PASS |
| Local typecheck | \`npm run check-types\` | PASS |
| Local tests | \`npm test\`: 74 Node passing; 1 live-Neon test skipped; 15 worker Vitest passing | PASS with skip |
| Production build | \`npm run build\` | PASS |
| Migration history | \`packages/db/node_modules/.bin/drizzle-kit check --config drizzle.config.ts\` | PASS |
| Five-migration PGlite replay | \`node --import tsx --test packages/db/tests/enrichment-lifecycle.test.mjs\`; 4 tests | PASS |
| Dependency audit | \`npm audit --json\` | 0 critical, 0 high; 8 moderate, 3 low |
| Staging migration | Neon SQL transaction; Drizzle ledger SHA-256 \`aa54417c516315a2500c00e5aaa953cacc93f637c81bbd8d22585a0a33a2d80a\`; readback | 5 migrations, attempt table created, 0 attempts |
| Staging constraints | Neon \`pg_constraint\` query | Job attempts PK, FK, state, attempts, and safe error checks present |
| External provider smoke | Municipal historical license ArcGIS source search \`MCCLOSKEYS\`, exact lookup \`TLIC19984\` | Real source lookup succeeded, matched exact identity; not verified active license |
| Current staging records | Neon direct readback | 0 prospects, 0 jobs, 0 attempts, 0 release artifacts, 0 approvals |
| Existing previous PR-head CI | Verify run 43291004458; Rivet Integration run 43291004759 | PASS on earlier PR head \`2a7070e\`; do not treat as CI for this unpublished worker change |
| Local Rivet engine integration | \`npm run test:integration -w @prospect-studio/worker\` | FAILED: HTTP 503 \`{"runtime":"rivetkit","status":"starting","version":"3.1.1"}\` after 30 seconds; no genuine runtime completion proven |

## Real acceptance trace — UNPROVEN

Actual discovery external source was queried, but no authorized test identity successfully signed in through a real browser and no managed-Neon JWT was obtained for source admission.

- \`discovery_request_id\`: unavailable (no authenticated discovery submitted)
- \`prospect_id\`: unavailable (staging count 0)
- \`enrichment_job_id\`: unavailable (staging count 0)
- \`evidence_ids\`: unavailable for real staging prospect
- \`website_version_id\`: unavailable
- \`review_id\` / \`approval_id\`: unavailable
- Real Rivet job execution, private browser preview, approval identity, restart persistence and cross-tenant browser tests: NOT VERIFIED

**The passing PGlite tests are regression evidence, not a real Neon/Rivet workflow.**

## Blocking dependencies and next mandatory verification

1. Configure authorized private Rivet backend/worker/dispatcher credentials and a least-privilege staging database connection through a supported secrets mechanism. Never transfer or expose raw connector-held secrets in tool output, logs, or repository. Deploy and verify worker restart/lease recovery.
2. Complete an authorized managed-Neon-Auth browser sign-in and exchange a valid token. Previous synthetic signup was blocked by execution safety controls; do not bypass that block.
3. Reconcile updated draft PR and require new CI on final commit; diagnose any Rivet Integration failure (local startup had HTTP 503).
4. Use an authorized test operator to run source discovery and admission, idempotent job queue, real private Rivet worker execution, evidence persistence, private preview creation, review/owner approval, and reload/restart proof. Capture stable IDs and logs.
5. Review residual moderate dependencies, stage-only promotion checklist and backup/restore; production migration and public deployment are **authorization-gated**.
6. Keep zero outbound customer contact and zero public website publication unless explicitly approved.

**Release gate:** DO NOT MERGE AS PRODUCTION READY. The staging schema and local worker implementation do not establish the required live end-to-end acceptance result.
