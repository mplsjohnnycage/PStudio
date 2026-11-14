# Personal ChatGPT/Pi Durable staging follow-up — 2026-11-14 UTC

**Scope:** Private, open-source, one-owner PStudio staging. Not proof of a completed ChatGPT consent or inference.

## Previously verified live staging baseline

- Sprite `prospect-studio-foundation` isolated worker `pstudio-rivet-cloud-node` runs code in `/home/sprite/pstudio-chatgpt-harden`, staged with private persistent `CHATGPT_HOST_ID` (`urn:uuid:...`), personal self-hosted opt-in, and one exact Neon Auth owner ID. A separately managed staging dispatcher runs from the same worktree. Production Sprite services were not targeted.
- Vercel Hono staging API `pstudio-hono-staging-johnnyc.vercel.app` deployed PStudio PR #12 SHA `dbca5de180fca59fc2c68b6804f4d2f1faf5f083` as `dpl_DyXMndq8JXfh3JL5yVfWMHDZxkyV`: READY; public `/health` returned HTTP 200 `authReady:true`, `schemaReady:true`; anonymous agent status and ChatGPT start returned HTTP 401; preflight from the staging web origin returned HTTP 204 with correct allowed origin.
- Vercel Next.js staging UI `pstudio-standalone-staging-johnnyc.vercel.app` on SHA `dbca5de` as `dpl_EPwWxKkpnpbfiGTHFbaCJTQrYGws`: READY. The web app is protected by Vercel Authentication (observed redirect), and must remain protected.
- Three GitHub workflows passed for this SHA (Verify, Rivet Integration, Discovery Python), as did local lint/type checks, worker unit tests and production-style build.
- Staging Neon owner account showed `emailVerified:false`. Do not impersonate the owner, modify verification fields or claim a signed-in session.

## Follow-up fixes

1. **Strict OAuth callback handling.** Only `http://127.0.0.1:<port>/auth/callback` is accepted. Explicit port, no userinfo, no fragment, exactly one nonempty `code` and one nonempty `state`; optional issued `client_id` and port changes are permitted. The pi-ai provider performs the actual state/PKCE check; Hono's shape validation is an additional guard. Official source: https://developers.openai.com/siwc/token-sharing-open-source/sign-in.
2. **Credential status validity.** A stored provider entry alone no longer establishes `chatgptConnected`. The private Hono Rivet broker asks the owner-scoped credentials actor to refresh the OpenAI OAuth credential. Status reports connected only if the returned OAuth access token is present and is valid beyond a one-minute margin. Refresh failures/revocations fail closed. No credential is sent to the browser.
3. **Owner-facing UX.** Removed incorrect commercial-hosting approval instructions from the personal self-hosted sign-in panel. No new plan token or OAuth code is present in source or output logs.

## Verification after the fixes

- `node --import tsx --test apps/server/tests/agent-broker.test.mjs`: **11 passing**, including strict callback variations and status tests for fresh, missing, expired and revoked credentials.
- `npm run check`: PASS.
- `npm run check-types`: **7/7 tasks successful**.
- `npm test`: PASS (**34 worker tests**, full repository suite succeeded).
- `NEXT_PUBLIC_SERVER_URL=<existing private staging URL> npm run build`: **6/6 tasks successful**.

## Acceptance still missing

The real owner must sign into the Vercel-protected UI, complete Neon Auth and the ChatGPT-plan consent flow, save the callback *inside the PStudio UI*, run an actual Pi Durable model request and verify a successful response and later token refresh. Do not mark OAuth end-to-end or production readiness as passing until those steps actually occur. Preserve PR as draft until product-wide production release gates are satisfied.
