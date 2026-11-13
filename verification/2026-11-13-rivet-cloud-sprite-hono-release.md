# PStudio Rivet Cloud / Sprite / Hono deployment evidence

Date: 2026-11-13 UTC. **This is an integrated staging checkpoint, not final production authorization.**

## Rivet Cloud to Sprite

- Rivet Cloud organization `johnny-cages-organization-pcme` cluster `pstudio`, endpoint `https://pstudio9jo8-api.onrivet.dev`, Free plan. The official CLI 3.1.1 was authorized by the user via Rivet device login. Rivet MCP plugin was not installable in this ChatGPT execution session; the official Rivet CLI plus official `@rivetkit/engine-api-full` SDK was used for cluster operations.
- API v2 metadata and namespace listings worked through the CLI, but the v2 `/engine/runner-configs` proxy returned HTTP 404. The official engine SDK `pools.upsert('default',{namespace:'default', drainOnVersionUpgrade:true})` succeeded. The SDK read back the pool, then a connected node.
- Sprite `prospect-studio-foundation` service `pstudio-rivet-cloud-node` started from an isolated working tree, Node 24.22.1, local service registry `jobGate`, `operatorAgent`, `chatgptLogin`, `credentials`. The cluster confirmed its `default` pool had a connected node. `jobGate.getOrCreate([testKey]).getState()` over the real Rivet Cloud endpoint returned initial `idle` and attempt `0`.
- The cloud worker uses **only the staging Neon PS/public-scoped read/write role**, with Postgres and Rivet credentials in 0600 Sprite-private paths, not Git, logs, or browser. No production Neon migration was applied. This runner does **not** use Docker or the `rivet-deploy-image` hosted compute workflow. For BYO Sprite nodes, a Rivet Cloud `build_id` and hosted pool HTTP URL do not exist; these apply only to Rivet-hosted Docker image deployments. Node process recovery is controlled by Sprite Services.

## Verified cross-service remote job

An opt-in test using `apps/worker/tests/integration/staging-remote-rivet.e2e.test.ts` ran **one real municipal record** through the **remote Rivet Cloud control plane and Sprite-connected worker**, not a local Rivet engine. It populated a segregated test-only Neon staging workspace, no real-user impersonation.

- Official historical Minneapolis Residential Specialty registry external ID `TLIC19984`, name `MCCLOSKEYS PAINTING AND REPAIR`. All source statements remain reported/historical, never assumed current.
- Test workspace `workspace_4b59bddb-cdb1-4edf-afd1-aa8813437ef9`, prospect `prospect_a384e306-dfdf-40d7-a719-68d44613773f`, job `job_8a25881b63d969d6ba8b6585e2787db9864d855b5ca71b368f2f840b79b94030`.
- Real scoped Neon transaction created a prospect and enqueue/outbox; dispatcher delivered the typed command through Rivet Cloud to Sprite actor. Actor state and Neon job state both became `completed` with attempt count **1**.
- Stored 2 external evidence records and 8 source-linked claims. Created private website HTML artifact SHA-256 `df3bfa014d93981d52b2702e4238257a516d9c4db75721a1307ce64d75f71441`, preview `preview_ad39b2ef-d870-45ac-8563-4c086e3a06cf`. Release status `in_review` with one **pending** approval.
- Test result **1/1 PASS**, and an independent **Neon connector** readback after test exit verified job/attempt completed, 2 evidence, 8 claims, SHA-256 and pending approval. Separate remote Rivet client readback returned `jobGate.phase="completed"` and attempt `1` after the test process exited.
- No fake login, owner approval, unauthorized outreach, published customer website, or production migration.

## Vercel Hono + Sprite action

- Added `apps/vercel-api` as a separate Hono project using the existing `createNeonApi` backend, so API behavior and authorization rules remain shared across Neon Functions and Vercel.
- Uses Node 24+ `@fly/sprites` SDK. Fixed action `POST /v1/workspaces/:workspaceId/actions/wake-sprite` verifies genuine Neon Auth JWT, verifies *live* Neon workspace membership, then invokes the single allowed remote command (`true`) on the fixed Sprite. It never accepts arbitrary Sprite names or shell commands from a caller, and does not return tokens or raw errors.
- Missing Sprite SDK credentials fail closed with `503`. Neither a wake nor a HTTP 200 implies Rivet actor connection; response explicitly reports `rivetActorVerified:false`.
- Local real staging Neon smoke: GET `/health` 200 with schema ready; missing or invalid JWT on Sprite action and jobs routes 401; four dedicated action security tests PASS.

## Outstanding release gates

1. Deploy the Hono app to isolated Vercel project, configure an encrypted staging DATABASE_URL and restricted CORS, verify actual health/unauthorized behavior. The connected Sprite provider does not give the application a reusable `SPRITES_TOKEN` by default; the server-side SDK secret must be configured to activate the wake action. Never put it in Git, public environment vars, or chat.
2. Verify Sprite Service auto-restart and Rivet actor state survival through a controlled reboot/restart. Test real outbox service health and recovery.
3. A real owner Neon Auth JWT and browser-to-Vercel/API login & workspace operation and a real human review action still need owner involvement. No synthetic accounts or forged approval allowed.
4. Staging branch expiry ~2026-11-18 UTC, production schema migrations and rollback require owner-controlled release decision.

## References

- Official Rivet skills: https://github.com/rivet-dev/skills
- BYO nodes: https://rivet.dev/docs/deploy/self-host/nodes/
- Rivet pool SDK: https://rivet.dev/docs/pool-configuration/
- Hono on Vercel: https://hono.dev/docs/getting-started/vercel
- Sprites JS SDK: https://github.com/superfly/sprites-js

## Vercel Hono monorepo packaging correction

First deploy (pre-fix) failed because the Hono framework preset requires a *direct* `hono` import at `src/index.ts`. Second deploy compiled but returned `FUNCTION_INVOCATION_FAILED`: Node runtime tried to load an unshipped internal workspace dependency (`/var/task/node_modules/@prospect-studio/db/src/index.ts`). The preset transpiles, but does not bundle linked monorepo TypeScript packages.

Fix: `src/backend.ts` is the single canonical Hono implementation and `tsdown` bundles all TS workspaces and runtime dependencies into generated `src/backend.mjs` and sibling chunks. The Vercel Hono entrypoint `src/index.ts` explicitly imports `hono` and the generated bundle. The generated bundles are excluded from Git and Biome but included in the Vercel build output; a fresh-checkout TS declaration `backend.d.mts` permits typechecking before the bundle exists. `npm run build -w @prospect-studio/vercel-api` generates and imports the real bundle as a required build-time smoke check. Local bundled request with real staging Neon: `/health` 200, unauthenticated wake route 401, correct origin CORS OPTIONS 204. Live Vercel rollout still separately requires verification; never infer deployment success from this local proof.

## Hono/oRPC frontend compatibility

The existing standalone Next.js UI uses both authenticated Hono `/v1` operations and the typed oRPC `/rpc/healthCheck` procedure. The original Neon Function Hono variant omitted the oRPC handler, so the new Vercel Hono backend now reuses the official `@orpc/server/fetch` `RPCHandler` and the existing `@prospect-studio/api/routers/index` appRouter. Local real-bundle verification on staging env: `POST /rpc/healthCheck` returns HTTP 200 `{"json":"OK"}`, `GET /health` returns HTTP 200 and unauthenticated Sprite wake returns HTTP 401, with scoped CORS. The Next.js staging Vercel project `NEXT_PUBLIC_SERVER_URL` points to the separate Hono staging project after this change. A Vercel redeploy is required before UI routing is active.

The dedicated Rivet Cloud Sprite Service was restarted with numeric `RIVET_NODE_VERSION=2`; official Rivet node pool readback returned one connected version 2 node. Prior completed actor state remained completed with attempt 1. See https://rivet.dev/docs/versions/.

## Final staging ingress and automatic dispatch verification

- Standalone Hono Vercel project `pstudio-hono-staging` deployment `dpl_GpUHuxNA827G85RMpALomN8nzDyF` READY, deployed from PR #8 commit `5153e411fc0aa7f7ceb8551b66ea180c74b31c74`. Live canonical URL `https://pstudio-hono-staging-johnnyc.vercel.app`: `/health` 200 (`authReady`,`schemaReady` true), `POST /rpc/healthCheck` 200 `{"json":"OK"}`, `GET /.well-known/oauth-protected-resource` 200 and exact Rivet-compatible Neon Auth issuer metadata, anonymous `POST /mcp` 401 with OAuth Bearer challenge, anonymous `POST /v1/workspaces/:id/actions/wake-sprite` 401, allowed-origin CORS preflight 204. Invalid origin gets no CORS response header.
- Standalone Next.js Vercel project `pstudio-standalone-staging` deployment `dpl_DSyL4r55uB88t3r1ECiNbsiv3iSj` READY at same PR commit; `NEXT_PUBLIC_SERVER_URL` now references the new Hono Vercel staging API. Anonymous frontend GET still redirects HTTP 302 to Vercel SSO. This is intentional private access protection, not verified user sign-in.
- User-provided Sprite organization credential was added only to Vercel's encrypted `SPRITES_TOKEN` setting, never Git or frontend. An isolated SDK smoke test executed the fixed, harmless `true` command on `prospect-studio-foundation`, returned exit code 0 and deleted its private temporary token file. Vercel's encrypted `RIVET_TOKEN` was also configured for server-side actor brokerage. No authenticated frontend-to-Sprite wake has yet been attempted; do not claim it works until a real Neon Auth session can authorize the route.
- Neon Auth staging OAuth 2.1 primary MCP resource is now `https://pstudio-hono-staging-johnnyc.vercel.app/mcp`, with client-ID-metadata documents enabled. The previous Neon Functions MCP resource is retained as an additional authorized resource, avoiding a forced cutover. Hono origin added to trusted staging domains. Real OAuth browser sign-in, consent, and authorized MCP tool call remain unverified.
- Rivet Sprite Service `pstudio-rivet-cloud-node` runs four registered actors, connected as `default` pool node version **2** after a controlled restart, with `drainOnVersionUpgrade=true`. Independent official SDK readback confirmed completed actor state survives service restart. The second Sprite Service, `pstudio-neon-outbox-dispatcher`, now runs the automatic Neon outbox loop and depends on the Rivet node service for cold starts.
- Added `apps/worker/tests/integration/staging-auto-dispatch.e2e.test.ts` as an opt-in isolated staging test. It **never calls** the dispatcher function itself: it admits a public municipal source candidate, enqueues via transactional Neon outbox, waits for Sprite Service automatic dispatch and the real Rivet Cloud actor, then generates immutable HTML and a pending review. Test 1/1 PASS. Service log records `claimed:1, delivered:1, invalid:0, lostLease:0, retried:0`. Independent Neon readback after test exit: job and attempt completed, outbox state delivered, 2 evidence records, 8 claims, one pending approval, release in_review. Test-only prospect `prospect_74ad65b1-cfc8-4a64-bc07-6b262cd74a08`, job `job_49f1cd47f8f035e7820315f4b437b4cefc6a886aee1dc7cf5319eadea9ee43cf`, artifact SHA-256 `e0ffabe9574b30e3b04c04d911c4897a0105acd03cec0724b949189aa23630a7`. Separate remote actor readback reports phase completed, attempt 1. No owner decision or outgoing contact.

## Production release blockers remain

1. **Real owner authorization:** Vercel SSO login, managed Neon Auth JWT, workspace admission, authorized Sprite wake endpoint, and OAuth 2.1 MCP consent/tool execution are not exercised with a real owner session. Test-only principals are explicitly not Neon Auth users.
2. **Review authority:** The real sourced staging preview awaits a human owner review; no programmatic auto-approval or customer-site publication.
3. **Database promotion:** Neon staging branch expires about 2026-11-18 23:17 UTC. Production branch has not been migrated; require backup, rollback verification and controlled migration approval first. Do not label the staging project `target=production` as a full product production launch.
4. **Availability:** We verified Rivet node Service restart and actor state readback. We have not tested full Sprite sleep/wake after a machine failure, interrupted in-flight job replay, or high availability; this single-user setup intentionally accepts a single Sprite.

Official references: https://rivet.dev/docs/versions/ , https://rivet.dev/docs/nodes/ , https://rivet.dev/docs/actors/ , https://vercel.com/docs/frameworks/backend/hono .
