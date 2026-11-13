# Prospect Studio — gated embedded agentOS execution

Checkpoint: 2026-11-13 UTC. **Isolated execution implemented and locally tested. NOT a full staging deployment or production release.**

## Implementation

- New worker dependency: `@rivet-dev/agentos-core@0.4.8` in `apps/worker`.
- New `runIsolatedJavascript` runner in `apps/worker/src/operator-sandbox.ts` creates a fresh VM for each call and disposes it in `finally`.
- The extra private Pi tool `validate_isolated_javascript` is exposed **only** when `PSTUDIO_AGENTOS_ENABLED=1` in the trusted server environment. Default is disabled. The previous 15 operator tools remain intact.
- Before VM creation, the tool obtains user/workspace identity from the durable actor state and rechecks the current Neon agent session and owner/operator workspace membership. The model's code cannot supply an alternate identity.
- VM guest environment is empty. No host mounts or host functions are registered; external networking, guest environment access and host-function calls are denied. Guest resource limits: maximum eight processes, 8 MiB filesystem, 32 FDs, 64 MiB V8 heap; 2s CPU and 5s wall-clock bounds. JavaScript source maximum 20,000 characters and tool-visible stdout/stderr each truncated at 8,000 characters. SHA-256 of source accompanies the result, not a claim of artifact persistence.
- There is no arbitrary worker shell tool, external network capability, publishing, outreach, user approval or Neon write from guest code. The VM result is ephemeral; no persisted artifact or Puck builder is claimed.

## Official Rivet guidance used

- https://rivet.dev/guides/agent-sandboxes/ — Pi sandbox adapter is hosted in a separate `services` actor. Not chosen as the first layer because Prospect Studio explicitly requires an embedded VM.
- https://rivet.dev/guides/sandbox-code-mode/ — Keep Pi Durable outside the sandbox and authenticate callbacks; this implementation intentionally does **not** grant callbacks to untrusted code.
- https://rivet.dev/agentos/docs/quickstart/ — `AgentOs.create`/`dispose` embedded lifecycle.
- https://rivet.dev/agentos/docs/permissions/ — deny outbound network and host functions.
- https://rivet.dev/agentos/docs/resource-limits/ — resource ceilings.

## Verified in isolated Sprite worktree

- Worktree `/home/sprite/pstudio-agentos-exec`, branch `feat/pstudio-agentos-exec` (source head `cd2cff3`). Active `/home/sprite/prospect-studio` dirty worktree was not edited.
- TDD: missing `operator-sandbox` import failed first; implementation then passed the new tests.
- New unit tests: seven passed, including a real agentOS JavaScript execution, failed guest network fetch, output truncation, disabled-by-default checks and oversized code rejection.
- Full repository lint/check: **PASS** (155 files).
- Full repository typecheck: **PASS**.
- Full repository tests: **95 Node tests passed, 2 optional external tests skipped; 22 worker Vitest tests passed**.
- Full repository build: **PASS** after copying only the ignored existing private staging web build config into this separate worktree. First attempt failed because isolated worktree lacked `NEXT_PUBLIC_SERVER_URL`.
- `npm audit`: 0 critical, 0 high, 8 moderate, 3 low. These findings remain unreviewed and are not a release approval.

## Outstanding whole-project acceptance gates

1. Register private Rivet endpoint, server credentials and staging-only `DATABASE_URL` with a running private worker; launch real durable enrichment job, not only a local test.
2. Enable a legitimate managed Neon OAuth user sign-in and verify ChatGPT consent + MCP resource/issuer/audience. Do not bypass blocked synthetic signup.
3. Verify signed-in browser discovery -> source-linked staging job -> Rivet enrichment -> private versioned preview -> explicit human review -> database persistence after worker restart; produce correlated IDs and source hashes.
4. Integrate a trusted artifact-generation path into Puck (if adopted) with artifact validation and persistence. The current tool only validates ephemeral JavaScript and must not be described as a complete website generator.
5. Resolve public hosting/billing and production migration via separate owner approval. Do not merge the pilot PR or promote to production without all acceptance gates.
