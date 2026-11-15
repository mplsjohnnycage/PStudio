# PStudio AgentMail + Calendar — implementation verification

**Source:** existing standalone PStudio private Neon API + authenticated Next.js shell; prototype UI reference in `docs/product/prospect-studio-ui-reference.md`.

## Integration

- `AGENTMAIL_API_KEY`: **server-only secret** for the US AgentMail REST API. Never add to `NEXT_PUBLIC_*`.
- `PSTUDIO_AGENTMAIL_INBOX_ID`: the explicit dedicated inbox address for this PStudio workspace.
- `PSTUDIO_AGENTMAIL_WORKSPACE_ID`: the exact owner/operator workspace ID allowed to read that inbox.
- All three must be configured together in the authenticated server runtime before the UI connects.
- Routes: GET `/v1/workspaces/:workspaceId/agentmail/threads`, GET `/threads/:threadId`, GET `/agentmail/agenda?after=&before=`, POST `/agentmail/events`. Each requires Neon JWT identity, owner/operator workspace authorization, exact inbox binding. Unknown workspace and unrelated prospect IDs fail closed.
- The backend never exposes the AgentMail key, internal upstream errors, HTML emails or any inbox switcher. It renders plain message text and caps upstream list pages.
- Event creation uses `client_id` idempotency, a fixed `America/Chicago` timezone, and permanently `send_invites: false` in this route. No recipient invites or outreach endpoints were added.

## External provider state

- AgentMail's own `get_calendar` confirms calendar availability on the connected organization (the existing `cbexmn@agentmail.to` inbox has a UTC-default calendar and zero events).
- Attempting to create a separate `pstudio-ops@agentmail.to` inbox was rejected by AgentMail's existing **three-inbox plan limit**. No existing inbox was deleted, renamed, or reassigned, no plan upgrade/purchase, and no email or calendar event created.
- There is no deployable PStudio-owned inbox/credential binding yet: the feature must display its disconnected state until explicitly configured and verified with an owner login.

## Verification

- Provider API contract is grounded in https://docs.agentmail.to/api-reference/inboxes/threads/list and https://docs.agentmail.to/calendar-events.
- Tests cover missing token, other workspace, unavailable configuration, persisted thread read, agenda read, cross-workspace prospect blocking, rejection of implicit invite flag, server-only credential handling, and internal-only event creation.
- UI SSR tests verify real provider labeling and unavailable external send controls.
- Reuse all existing PStudio test/build checks; record actual exit codes before declaring completion.

## Outstanding acceptance

- Assign a dedicated PStudio mailbox (requires capacity/authorization) and provision scoped AgentMail API key/ID as secrets to the intended staging runtime.
- Validate live owner login, inbox reads, agenda sync, and internal hold round-trip; no sends or invitations without the owner's later explicit approval.
- Complete pixel-accurate map/Studio/Inbox behavior from reference, and accessibility/mobile QA.
- Do not merge into production or disturb draft PRs #12/#13 without release review.

## Latest isolated verification result

- `npm test` **184 pass / 0 fail**: 122 repository Node tests, 41 Rivet/worker unit tests, 4 Vercel API tests, 17 web tests.
- `npm run check` **pass** across 201 files.
- `npm run check-types` **7/7 successful**.
- `NEXT_PUBLIC_SERVER_URL=https://pstudio-hono-staging-johnnyc.vercel.app npm run build` **6/6 successful**, with 7/7 Next.js static pages generated.
- First test run had an unrelated 5-second AgentOS VM startup timeout; isolated AgentOS 7/7 and full rerun then passed. Source code for AgentOS was not changed.
- Browser/mobile pixel inspection of the new authenticated frontend was **not** completed; CSS and server-side rendering checks do not prove screenshot parity.

## Independent pull-request review — 2026-11-14

PR #14 code review identified a functional and privacy bug: the existing full-thread
request used the undocumented `/v0/inboxes/{inbox}/threads/{thread_id}` route.
The AgentMail API documents `GET /v0/threads/{thread_id}`; thread IDs resolve
as global resources, so matching the returned `inbox_id` to the configured
PStudio inbox is mandatory before returning any message content.

The client now uses the documented route, and **fails closed** on foreign or
missing inbox attribution. Three new regression tests were verified RED against
the original implementation and GREEN after repair (proper route, foreign
inbox rejection, missing attribution rejection). The existing server-side
credential and no-invitation contracts are preserved.

Verification of the corrected source:
- `npm run check`: pass, 201 files.
- `npm run check-types`: pass, 7/7 tasks.
- `npm test`: pass, **187/187 tests** (125 repository Node, 41 worker, 4 Vercel API, 17 web).
- `NEXT_PUBLIC_SERVER_URL=https://pstudio-hono-staging-johnnyc.vercel.app npm run build`: pass, 6/6 tasks.
- `git diff --check`: pass.
- Official route: https://docs.agentmail.to/api-reference/threads/get

PR remains draft: live mailbox capacity, actual owner authorization and the
provider round trip are not complete. A merge must not be confused with the
production deployment gate.
