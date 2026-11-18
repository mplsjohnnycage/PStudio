# PStudio Eve 1.0 — owner-only, private runtime

This is **a standalone testable Eve runtime**, not a production cutover. It
reuses the PStudio private Rivet OAuth credentials Actor through
`apps/worker/src/eve-siwc-credential-source.ts` and
`createOwnerEveSiwcModel`. It has **no write/outreach tools**.

## Backends

- **Eve 1.0 on a self-hosted Sprite**: session and message runtime.
- **Rivet**: existing PStudio ChatGPT consent and private credentials Actor;
  holds/rotates OAuth refresh tokens. Never send refresh tokens to Eve.
- **Neon**: Workflow Postgres World `@workflow/world-postgres >=5.1.1`
  through **an isolated test Neon branch**; the PStudio app DB remains
  authoritative for jobs, user access and approval reviews.
- **OpenAI public Responses API**: subscription-backed model inference
  using `chatgpt.tokens.use.direct` grant; no `OPENAI_API_KEY`.

## Configuration (all server-only)

```dotenv
# From a VERIFIED, logged-in Neon owner, not from user supplied prompts:
PSTUDIO_CHATGPT_OWNER_USER_ID=<exact-owner-neon-subject>
PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED=1
PSTUDIO_CHATGPT_PLAN_ENABLED=1
CHATGPT_HOST_ID=<stable-uuid-from-existing-rivet-login-deployment>
PSTUDIO_SIWC_MODEL_ID=<approved-model-id-discovered-from-owner-plan>
PSTUDIO_SIWC_CONTEXT_WINDOW_TOKENS=<verified-context-length-for-that-model>

# Existing private Rivet control plane, NOT browser credentials:
RIVET_ENDPOINT=https://<private-rivet-endpoint>
RIVET_NAMESPACE=<existing-namespace>
RIVET_TOKEN=<secret>

# Worker privateRivetConfigured requires DATABASE_URL to confirm
# deployment readiness, but Postgres World MUST use an isolated branch:
DATABASE_URL=<isolated-neon-workflow-branch-url>
WORKFLOW_POSTGRES_URL=<same-isolated-neon-workflow-branch-url>
WORKFLOW_POSTGRES_WORKER_CONCURRENCY=2
WORKFLOW_POSTGRES_MAX_POOL_SIZE=4
```

Do not commit or print these values. Do not transfer Vercel decrypted secrets
through chat. Use the original approved secret store and least-privileged
credential delivery to a self-hosted process.

After owner sign-in has created an existing Rivet grant and a nonproduction
Neon branch has been provisioned, run:

```bash
npm run build:runtime -w @prospect-studio/eve
# Bootstrap is a schema-changing action. Verify the test branch first.
(cd apps/eve && npx --package @workflow/world-postgres bootstrap)
(cd apps/eve && ./node_modules/.bin/eve start --host 127.0.0.1 --port 3007)
```

No bootstrap, production database migration, model request, server start
or public proxy is performed by adding this package. Staging sign-in
continues through **PStudio itself**, not a manually assembled OAuth URL.

## Gates before any release

1. Owner-granted `chatgpt.tokens.use.direct` present in the private
   Rivet Actor, with refresh token never sent to Eve.
2. Real model request and measured token refresh/retry.
3. Restart and Workflow Postgres World recovery on isolated Neon branch.
4. Explicitly verify no outreach, approval or production migration path;
   keep production Rivet Pi agent unchanged.
5. Owner approval for merge/cutover.

The workspace-wide `npm run build` only type-checks this **optional**
Eve runtime; the private-model bundle uses `build:runtime` explicitly
after owner configuration. This avoids requiring secrets in ordinary PStudio CI.
