# Prospect Studio — first operational prospect-to-site loop

Checkpoint: 2026-11-13, UTC. This change makes the existing standalone PStudio workflow usable and records what it does **not** yet provide.

## Findings in production before change

Production Neon Auth had one verified owner identity and an owner workspace (name deliberately omitted here), but zero business prospects, jobs, evidence releases, or drafts. The UI loaded, but left a new user with empty panels. The map had no verified coordinates, while inbox/calendar were placeholders. Business intake supported operator-reported details or a historical Minneapolis license source; source-specific enrichment would always fail for a manually added prospect with no external ID. The worker successfully stored sourced evidence but did not automatically produce a versioned private website draft. The visual generator always returned one fixed-layout landing page.

## Implementation

- A visible first-run panel offers manual business intake or a confirmed historical public-record example. The example prefills the search only and does not import without the operator clicking Import. The fixed provider source was checked live and returned license TLIC19984.
- Successful unique historical-record admission automatically queues one durable Neon job via an idempotency key. The production Sprite outbox dispatcher then runs the source refresh using Rivet Cloud. Duplicate source records do not create a second job automatically.
- Enrichment and private website draft commit in the **same Neon transaction**, including source evidence, claims, job attempt, release, artifact hash, preview and completed job state. Retries of a completed job cannot produce another release. Version allocation locks the prospect row to coordinate with operator-generated versions.
- Manually added prospects still generate operator-drafted sites but **cannot** use the fixed external-source enrichment worker. The UI visibly disables that action instead of allowing a guaranteed failed job.
- Active jobs are polled by the UI every four seconds until terminal state, and completed jobs load their generated draft into the preview panel. Existing versions remain persistent and readable after reload.
- Added three deliberate responsive website directions (Editorial, Atelier, Modern), an evidence-aware full-page structure, safe headline and introduction editing, strict input limits, server-side HTML escaping, per-version immutable drafts, and download of HTML for external inspection. This is an initial evidence-limited design builder, **not** a claim of AI-written factual business content, Puck editing, verified current licensure, a published customer website or a full autonomous website factory.
- Added authenticated, workspace-scoped read-only `/v1/workspaces/:workspaceId/prospects/:prospectId/evidence`. The prospect inspector presents source links, claim field/value, type and capture dates and explicitly labels claims reported rather than verified. No anonymous or cross-workspace data access.
- The stage test was strengthened to require the **worker-generated** draft before a separate operator-created v2, preventing a manually created preview from masquerading as background automation.

## Automated and real-service verification

Full suite: lint and TypeScript checks PASS; 108/110 Node tests passed (2 opt-in external skipped); 22 worker tests passed, four Sprite-action security tests passed, five signup tests passed; web and Hono production builds PASS. Added regression tests for unauthorized evidence access, valid design input, malicious HTML escaping, three different site directions, idempotent auto-draft creation and coherent versions.

Real independent staging proof: restarted isolated `pstudio-rivet-cloud-node` Sprite Service at numeric Rivet node version 3, followed by `pstudio-neon-outbox-dispatcher`. Ran `apps/worker/tests/integration/staging-auto-dispatch.e2e.test.ts` with test-only staging workspace, no real owner token, no manual dispatcher invocation. Result **1/1 passed**. Checkpoints include `background_outbox_delivered`, `rivet_job_completed`, **`worker_auto_site_generated`**, and `preview_created`. Public fixed historical Minneapolis registry record TLIC19984 (MCCLOSKEYS PAINTING AND REPAIR) resolved successfully. Independent Neon staging readback for test prospect `prospect_4aa72925-e38d-4a7c-a2f3-d0ba0f4fbc5a`: completed job, delivered outbox, 2 immutable evidence items, 8 source-linked reported claims, **2 versioned previews** (worker auto v1, operator-created v2), latest release version 2, owner approval pending. Tested artifact SHA256 `4d9b122eece8adf93e8d651a2379890c99d9dd802f7154d8accb49f02880a484`. No website publication, external communication, owner decision, or real-user impersonation.

## Remaining independent release criteria

1. New code needs CI-reviewed merge and production deployment to the existing separate Hono API, Next.js frontend, and Sprite production worker service. Staging was updated and tested first; production worker is still running the prior bundle at this checkpoint.
2. Real owner's authenticated browser-to-Neon-to-Hono workflow still needs an actual owner session; synthetic JWTs or a database membership alone are **not** substitute evidence.
3. Broader buyer-signal research, live website condition assessment, geographic geocoding, Puck/visual editing, CRM/inbox/calendar, multi-provider discovery and final customer-site deployment are not implemented by this patch. They require independent integrations and test evidence, not status claims.
4. Source registry records are historical, not verified current operating businesses; all contact and public publication remain subject to user-controlled review.
