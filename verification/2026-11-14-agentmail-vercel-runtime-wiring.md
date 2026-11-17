# PStudio — AgentMail server-runtime forwarding verification

**Scope:** Staging-only Hono/Vercel integration; no source secrets, external messages, or production rollout.

## Failure

The direct Neon Functions entrypoint read `AGENTMAIL_API_KEY`, `PSTUDIO_AGENTMAIL_INBOX_ID`, and `PSTUDIO_AGENTMAIL_WORKSPACE_ID`, but the deployed Hono entrypoint at `apps/vercel-api/src/backend.ts` independently built a `createNeonApi` configuration and omitted all three variables. The UI therefore remained disconnected even if the staging project had correct encrypted variables.

## Fix

A dedicated, pure `buildVercelNeonConfiguration(process.env)` function maps all existing Neon Auth/database/CORS configuration and the three server-only AgentMail settings into `createNeonApi`. The Hono entrypoint retains its existing Sprite wake hook. No client bundle receives the API key. Missing mailbox configuration remains an intentionally disconnected state.

## Test-first evidence

- RED: `node --import tsx --test apps/vercel-api/tests/runtime-config.test.mjs` failed `ERR_MODULE_NOT_FOUND` before the runtime configuration function existed.
- GREEN: both new runtime-configuration tests pass, including the absence-of-configuration case.
- `npm run check`: pass, 203 files.
- `npm run check-types`: pass, 7/7 tasks.
- `npm test`: pass, **189 tests total** (125 repository Node, 41 worker, 6 Vercel API, 17 web).
- `NEXT_PUBLIC_SERVER_URL=https://pstudio-hono-staging-johnnyc.vercel.app npm run build`: pass, 6/6 tasks.
- `git diff --check`: pass.

## Configuration and release gates

- User-supplied AgentMail API credential was verified separately against AgentMail via read-only requests, then stored as an **encrypted** variable in the *staging* Vercel API project only, along with a prospect-focused existing inbox and the real authorized owner workspace ID from staging Neon. No key or mailbox contents are recorded here.
- Context7 verified both inbox-scoped and global Get Thread endpoints, and the calendar agenda and internal hold endpoint. The global route in current code checks the response's exact inbox ID before returning any messages.
- Activation needs a new staging Hono build from the merged fix, followed by a read-only health/auth smoke test. Live authorized owner Inbox/Calendar round-trip still requires actual user sign-in; a passing unit test is not a substitute.
- No email, invitation, contact, spending, test-tenant data copy or production API deployment authorized by this change.
