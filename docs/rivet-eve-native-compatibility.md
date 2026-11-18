# PStudio — Rivet native Eve integration compatibility decision

Date: 2026-11-17/18. Owner-only PStudio. All validation is from published
package metadata and inspected npm tarball source, **not** an Eve production
deployment or real OAuth login.

## Finding

**Rivet has official native Eve and Workflow SDK integration packages**, but
their currently published releases cannot be used as drop-in replacements for
the PStudio **Eve 1.0.0** runtime.

| Package | Verified published release | API/compatibility evidence |
| --- | --- | --- |
| `@rivet-dev/agentos-eve` | `0.4.6` | peer `eve >=0.27.0 <0.28.0`; excludes 1.0.0 |
| `@rivet-dev/workflow-world` | `3.1.1` (`latest`) | exact dependency `@workflow/world 5.0.0-beta.21` |
| `@rivet-dev/workflow-world@next` | `2.3.32` | also depends on `@workflow/world 5.0.0-beta.21` |
| Rivet World bundled SDK | `@workflow/world 5.0.0-beta.21` | `SPEC_VERSION_CURRENT = 5`; Rivet World has no `hookForceClaim` or `hookRetention` methods |
| Eve running on Fly Sprite | `eve 1.0.0` | documentation specifies Workflow spec 9 and atomic session-start hooks, requiring `@workflow/world-postgres 5.1.1+` |
| `@workflow/world-postgres` | `5.3.0` (`latest`) | Current official Postgres World candidate; Neon isolated branch remains to be tested |

Sources:
- https://rivet.dev/integrations/vercel-eve/
- https://rivet.dev/integrations/workflow-sdk/
- Eve 1.0.0 installed docs:
  `node_modules/eve/docs/guides/deployment/workflow-worlds.md`
- npm metadata and `@rivet-dev/workflow-world@3.1.1` source tarball.

**Decision for this proof:** retain Eve 1.0.0 and use its supported
Postgres World path for Neon. Do not install incompatible Rivet World or
`agentos-eve` packages, force-install peer dependencies, or downgrade Eve.
Recheck package metadata when Rivet publishes compatibility with Eve 1.0.0
and spec 9 / atomic hooks. A separate compatibility branch could
test native Rivet World when those constraints are met.

## Credential integration remains independent of Workflow World

PStudio already implements Sign in with ChatGPT in Rivet:
- `apps/worker/src/chatgpt-login.ts` owns authorization;
- `apps/worker/src/chatgpt-credentials.ts` holds and refreshes the owner's
  OAuth credential in an Actor;
- `apps/server/src/rivet-agent-client.ts` provides the authenticated
  PStudio backend's private connection.

The new `apps/worker/src/eve-siwc-credential-source.ts` resolves a
short-lived access credential from **only that owner-scoped Actor**, with
no refresh token returned. The private `refresh()` action now supports
`forceRefresh`, including a bounded 401 retry in the existing AI SDK
Responses adapter. `apps/worker/src/eve-siwc-model.ts` constructs an
Eve-compatible AI SDK model using this broker source.

This is **not** a new OAuth service or public credential endpoint.
PStudio remains a private single-owner app. Leave the current Rivet Pi
Agent and agentOS implementation unchanged until Eve phase tests pass.

## Verification / blockers

- The model and credential adapter use injected Rivet clients and mock
  HTTP Responses streams in unit/contract tests; they do **not** prove
  real ChatGPT subscription inference.
- Real private Rivet `RIVET_ENDPOINT`, token, exact verified Neon owner
  ID and `CHATGPT_HOST_ID` must be configured on the test runtime. No
  such values are committed.
- The owner's real `chatgpt.tokens.use.direct` grant must be present
  in the existing Rivet credentials Actor; only the owner may complete it.
- Isolated Neon Postgres World requires schema bootstrap and testing
  with `@workflow/world-postgres >=5.1.1`; not implemented here.
- Real Eve `defineAgent` boot, message processing, restart recovery, and
  PStudio operator approval-denial tests are release gates.
- The private actor client must not be callable by end users or exposed
  as a browser or shared HTTP token endpoint.
- Rollback remains `SESSION_LAYER=rivet`; never merge/deploy this
  proof without owner review.

No claim of complete Eve production deployment, durable Neon state,
subscription-backed model call, or production authorization is made.
