# PStudio — recover a committed Neon enrichment after Rivet step replay

**Date:** 2026-11-14 UTC
**Source base:** `c9f80a6` (`feat/rivet-neon-discovery`, PR #12; staging only)
**Implementation branch:** `feat/pstudio-idempotent-recovery`
**Deployment status:** NOT DEPLOYED. No running worker, production namespace, Neon database, or Vercel project was modified.

## Failure reproduced (RED)

If an enrichment transaction commits in Neon and the Rivet workflow restarts before its `execute-enrichment` step is checkpointed, the next `beginEnrichmentAttempt` returns `null` because the job is already completed. Previously the worker returned `skipped` and the actor rejected the result, even though the evidence and draft were durably committed.

- Focused worker regression returned `skipped` instead of the required `{ kind: "already_completed", attempt: 1 }` (1 failure, 5 passes).
- Database regression failed to import `readCompletedEnrichmentAttempt` because it did not exist.

## Change

- `readCompletedEnrichmentAttempt` queries Neon for a **completed enrichment** with a valid recorded attempt. It returns `null` for missing, uncompleted, or non-enrichment jobs.
- `executeEnrichmentWithStore` checks that state only when a fresh claim is unavailable. Recognized commits are acknowledged without another public-source lookup, attempt claim, evidence write or private preview.
- `jobGate` refuses to accept a result from a different attempt than its current durable workflow state.
- Regression coverage verifies persisted evidence and previews are not duplicated, and competing or unfinished work is not falsely acknowledged.

## Verified in isolated Sprite worktree (GREEN)

- `node --import tsx --test packages/db/tests/enrichment-lifecycle.test.mjs`: **5 pass, 0 fail**.
- Worker focused `vitest run tests/unit/real-enrichment.test.ts`: **6 pass, 0 fail**.
- `npm run check`: **pass**, 193 files, no fixes needed after targeted formatting.
- `npm run check-types`: **pass**, 7/7 tasks.
- `npm test`: **pass**, 115 Node-based repository tests + 36 worker unit tests + 4 Vercel API tests + 12 web tests = **167 passing**, no failures.
- `NEXT_PUBLIC_SERVER_URL=https://pstudio-hono-staging-johnnyc.vercel.app npm run build`: **pass**, 6/6 tasks, Next.js static generation 7/7. Initial build without this required public URL failed at Varlock configuration validation; no source defect was reported.
- No secrets were added to source. New `node_modules` installed in isolated worktree with `npm ci`.

## Outstanding acceptance / intentionally not claimed

- This is a deterministic **commit-before-Rivet-checkpoint replay** regression, not a live demonstration of killing and recovering a running Rivet worker in mid-execution. That original PR #12 release gate remains open.
- The stale `running` attempt reaper and races involving a *different* database attempt are deliberately fail-closed, not automatically reconciled by this change.
- Real owner Neon sign-in, ChatGPT OAuth consent, first plan-backed Pi Durable inference, and refresh-token rotation require genuine owner interaction and remain unverified.
- No production release, outreach, published client website, or other consequential operation was performed.

## Follow-up: exact attempt / evidence reconciliation

A separate isolated QA worktree identified two additional replay cases. These
safeguards were independently reproduced RED and fixed on the canonical PR #13
branch rather than publishing another competing implementation.

- A manually marked `jobs.state=completed` without a completed attempt and
  matching source evidence no longer passes replay validation. The query now
  joins the current attempt and its evidence for the same prospect.
- A lost `completeEnrichmentAttempt` response or a completion conflict can
  acknowledge only the exact attempt committed by Neon. Other attempt IDs
  remain fail-closed. A failed verification read cannot infer success.
- RED: 1 PGlite DB regression and 2 worker regressions failed as expected.
- GREEN: PGlite DB tests 6/6; focused worker tests 9/9.
- Full repository `npm test` rerun: 116 repository + 39 worker + 4 Vercel API
  + 12 web = **171 tests passing**, zero failed. A prior run had two transient
  AgentOS VM timeouts under load; isolated AgentOS 7/7 and fresh full rerun pass.
- `npm run check` pass, 193 files; `npm run check-types` pass, 7/7;
  `NEXT_PUBLIC_SERVER_URL=https://pstudio-hono-staging-johnnyc.vercel.app npm run build`
  pass, 6/6. No staging or production services were restarted.

**Separate live in-flight termination/recovery remains an unverified release
acceptance gate**; these tests prove database-level replay cases, not an actual
Rivet process crash and resume.
