# Prospect Studio — sourced staging Neon + Rivet pipeline verification

**Recorded 2026-11-13 UTC. Status: staging private pipeline PASS; production gates outstanding.**

## Verified systems

- Repository `mplsjohnnycage/PStudio`, GitHub draft PR #8; staging-specific integrated candidate `feat/pstudio-pilot-vertical-slice` head at verification before this note: `dd7cd952d444d5448a08079e7b320630dd89754c`.
- Staging Neon branch `validation-20261111` / `br-fancy-shadow-bekwm85g`, database `PS`. Production branch has not been migrated or modified.
- Scoped Neon PostgreSQL role `pstudio_staging_worker_20261113`: **read_write on PS/public only**, verified real connection and table privileges. Password/URL stored outside repository in a 0600 private Sprite file and excluded from logs. No database-owner password was given to the worker.
- API `pstudioapi` staging deployment 6: health 200; missing JWT on MCP returns 401 with OAuth 2.1 Bearer challenge; authorization-server and protected-resource metadata both return 200. Neon Auth OAuth server enabled for the staging MCP resource, Vercel staging sign-in and consent screens. No real completed OAuth consent/token flow is claimed.
- Vercel `pstudio-standalone-staging` READY, source PStudio at `dd7cd952`, SSO gated; public anonymous requests redirect 302 to Vercel SSO. No real signed-in browser flow is claimed.

## True cross-service staging execution (not mocked)

An opt-in test ran an official public municipal source record through **real remote staging Neon** and a **real locally hosted RivetKit engine** on Sprite. The actor workflow received the *real Neon outbox command*, executed a source-backed enrichment attempt, and committed evidence and a versioned HTML artifact into Neon. After the test process exited, an independent Neon readback verified the rows.

- Public source: Minneapolis Residential Specialty license registry (`minneapolis_residential_specialty`), exact license `TLIC19984`, source name `MCCLOSKEYS PAINTING AND REPAIR`. Source claims are labeled historical/reported, never verified current activity.
- Test-only separate workspace `workspace_b98611b5-180c-4946-bab2-bc901bd4f6e4`, prospect `prospect_a693557c-e540-4973-9a8f-2b3d06f1cc32`; this principal is an **isolated service test fixture, NOT an authenticated Neon user**.
- Job ID `job_abe237a46204a0c46e007831524a01893bfb60e02908e2cb12bda6c8133b7877`, stage `completed` with **one completed attempt**.
- Evidence records: **2**; related claims: **8**. Preview `preview_2dd8d1f5-0a05-4edd-bb86-5a6ca6c3355f`.
- Release `release_7c88165d-62e5-4201-a318-a2ddc88d6142`, status `in_review`.
- Immutable HTML artifact SHA-256: `f6fd684660491448fc438f90ad91eb5e39252d9171e4a718be568626aa1dac1c`, independently re-read from Neon.
- One approval row in state **pending**. **No owner approval was performed**, and there was no outreach, customer website publication, or spending.
- Vitest result: **1/1 passed**. The test output is recorded locally at `/tmp/pstudio-e2e-v4-run.log`, private source context contains no credentials.

## Repeatable test

New opt-in `apps/worker/tests/integration/staging-neon-rivet.e2e.test.ts` exercises the real source, scoped Postgres, transactional outbox, local Rivet jobGate workflow, evidence, HTML artifact and pending review. It is **skipped by default** and its staging credential path must be set explicitly. `apps/worker/scripts/run-staging-neon.mjs` chooses native Rivet lock storage, uses the actual Node binary, and refuses production mode. Example on an authorized Sprite already holding a staging-only, least-privilege connection:

```sh
PSTUDIO_STAGING_NEON_RIVET_E2E=1 \
PSTUDIO_NEON_STAGING_WORKER_ENV_PATH=/path/outside/repository/staging-worker.env \
npm run test:staging-neon -w @prospect-studio/worker
```

Never commit that environment file, print it in logs, or point this opt-in test at production. The test adds an **isolated test-only** staging workspace; it does not delete existing data.

## Rivet guides used

- https://rivet.dev/guides/agent-sandboxes/ — isolate file and code execution, keep the agent outside untrusted code.
- https://rivet.dev/guides/sandbox-code-mode/ — scoped callbacks, credential separation.
- https://rivet.dev/docs/deploy/ — real production needs a connected, durable control plane and worker node.
- https://rivet.dev/docs/connect/ — namespace-scoped secret endpoints stay server-side.
- https://rivet.dev/docs/deploy/self-host/control-plane/ — self-hosted production is not the development engine; durable bucket and replicated control plane required.

## Release-blocking gaps

1. **Rivet Cloud / production control plane** is still not configured. Local Rivet engine proves actual worker logic, but is not equivalent to hosted durable actor storage across machine failures. No Rivet Cloud namespace/token is stored on Sprite.
2. **Real browser authentication and user consent** have not been executed. JWT issuer and protected MCP metadata are configured and verified, but the OAuth sign-in and account approval step needs a real human login, not a forged test principal.
3. **Real owner review/approval** remains pending. Never approve a private proposal autonomously.
4. Staging Neon branch expires 2026-11-18 23:17 UTC. Production DB schema migration, backup, rollback and public release still await readiness and owner authorization.

Do not call this a complete production E2E until a real authenticated session and a remotely durable Rivet control plane have successfully driven the same persistent workflow with human approval and restart/readback evidence.

### Repeatability follow-up

The new `npm run test:staging-neon -w @prospect-studio/worker` runner subsequently passed **1/1 live staging tests** with a second isolated test-only workspace. A separate Neon connector readback confirmed completed job and attempt, in-review release, 2 evidence rows and 1 pending approval for prospect `prospect_775e8e46-1890-4a13-8b27-9916d9b2c4bd`, artifact SHA-256 `3a243e157616d207aea9b0fa699808dfa5faf8bb826253450a7df275b43a16f0`. This proves repeatable local-Rivet-to-staging-Neon persistence without assuming remote Rivet Cloud, authenticated user session, or owner consent.
