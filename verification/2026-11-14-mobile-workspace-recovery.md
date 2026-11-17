# PStudio mobile workspace and Agent recovery — staging

**Date:** 2026-11-14. **Scope:** UI-only change on private single-owner staging, not a production data migration.

## Screenshot defect and verified cause

The iPhone screenshot showed a signed-in account, the placeholder "Select a workspace", an empty map with zero prospects, and no accessible ChatGPT Agent control. The app previously displayed its normal empty map while the initial workspace API call was pending and gave no explicit loading state or recovery CTA. The `StudioAgent` React component was only rendered once the active workspace was known to have an owner/operator membership; the mobile bottom bar had no Agent entry. The frontend also offered `New workspace` even though the staging API is configured invite-only (`PSTUDIO_STAGING_INVITE_ONLY=1`), which makes the create route return HTTP 403.

Read-only Neon staging inspection verified an existing owner workspace with **zero real prospects**. A dozen separate prospects belong to isolated TEST-ONLY service-operator workspaces and are not the owner's data. No membership was granted, no test data was copied, and no user identity was impersonated. API runtime request-path counts also showed requests to the real owner's workspace's prospects and agent/events endpoints, evidence that the live session has been able to reach an assigned workspace. An actual user's browser authorization request could not be inspected directly without their session.

## Implemented behavior

- The application now explicitly shows `Loading workspaces...` and a visible loading state until the list request finishes; on failure it shows `Retry`, and for invite-only accounts with no assigned membership it shows `Recheck access` and clear owner-account guidance. No misleading, inert `New workspace` button remains in invite-only staging.
- The last selected workspace is remembered under a key scoped to the Neon Auth subject, and restored **only** when the next authenticated `/workspaces` result still includes the exact ID. Revoked/foreign saved workspace IDs never grant access or override the backend membership list.
- The existing `StudioAgent` React panel now takes controlled visibility props; a fifth **Agent** button on the mobile bottom bar opens the same authenticated panel. It stays disabled without an owner/operator workspace. Both the base and light-theme mobile CSS define five columns.
- The real owner's current zero-prospect state remains truthful; the existing first-run `Add a business`/source-import onboarding becomes reachable once the owner workspace is active. No staging fixtures are presented as real pipeline records.

## Validation

- Five selection scenarios plus one invite-only scenario are covered by `apps/web/tests/workspace-selection.test.mjs`, and the mobile agent panel's controlled open/closed HTML is covered by `apps/web/tests/mobile-agent-panel.test.mjs`. These run as part of `npm test -w web` and the root `npm test` script.
- Verify full workspace lint, type checks, all repo tests, production-style build, and production dependency audit before deploy. Use the staging web Vercel project only, leave the API/Rivet worker/production projects untouched, and verify the staging deployment is READY at the exact source SHA.

## Not yet verified

The actual signed-in iPhone session and OAuth consent still require interactive access. Without a real authenticated browser session we cannot assert the client-side list loaded for that user on their device. A zero-prospect owner workspace is correct until a business is explicitly added or admitted under that owner's authorization. Staging account email verification and first ChatGPT-plan model response are separate acceptance gates.
