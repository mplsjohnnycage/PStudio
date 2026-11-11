# Prospect Studio handoff status — 2026-11-11

## Environment identity

- Dedicated, private Sprite: `prospect-studio-foundation` (`sprite-8d7a3d82-ebce-4d37-8ec5-1ef5b371ba74`).
- Project checkout: `/home/sprite/prospect-studio`. This is separate from the existing `prospect-studio` Sprite and its Convex-backed implementation.
- Stack confirmed locally: Node 24.22.1, npm 12.0.2, Better-T-Stack Next.js/Hono/oRPC/Drizzle/Turborepo/Ultracite scaffold.
- Git has no upstream origin; do not push this as a replacement for the existing Prospect Studio repository without architecture/repository reconciliation.

## Changes implemented from attached 17-node graph

- `preflight`: inspected Sprite resources, process/services, git state, toolchain and network policy without exposing credentials. This Sprite has no configured app services yet.
- `create_sprite`: an already provisioned private dedicated Sprite was found and reused (no duplicate created).
- `repo_foundation`: existing scaffold reproducibly installs and builds; repo guidance, CI, environment docs and safe defaults present. GitHub workflow has been extended to include tests; CI has not been triggered on GitHub.
- `contracts`: added versioned schemas and 8 behavior tests for unknown values, source attribution, jobs, approvals, version-specific review and constrained outreach.
- `database` (partial): added 13 Drizzle tables with workspace, prospect, source, claim-evidence, job, immutable-release reference, reviewer ACL, comments, decisions, and draft structures. Generated initial SQL migration `packages/db/src/migrations/0000_tiny_scarecrow.sql` **offline**. Seven database structural tests added. No hosted Neon project was found under a read-only search for `prospect`; no production DB was provisioned, migrated or queried.
- Corrected the noninteractive migration-generation failure by removing the unnecessary Turbo `interactive` requirement for `db:generate`.

## Required work before marking integration or database complete

1. Reconcile this new standalone Neon/Lakebase foundation with the existing Convex-backed Prospect Studio project; avoid two authoritative business-state stores.
2. Link a reviewed GitHub repository and run CI on a remote branch.
3. Obtain a strictly isolated development Neon project/branch; run migration, rollback and tenant-authorization tests, then search-extension compatibility tests. Do not run `db:push` or `db:migrate` against unknown databases.
4. Implement authenticated API service methods, enforce workspace tenancy and source claim ownership, server-side review ACL, version invariants, and owner-only send/publish authorization.
5. Continue `trail`, `platform`, `interface`, `discovery`, `mail`, `pipeline`, `agent`, `builder`, `review`, `integration`, `operations` and later `chatgpt` in dependency order.

## Important limits

- Zod contracts and Drizzle checks are not full authorization.
- Pure helper checks are not an operational preview gateway or an AgentMail send gate.
- The migration is generated SQL; there is no proof it runs against Lakebase until applied to isolated test infrastructure.
- No outreach, deployment, public URL change, credentials dump, database modification, or asset publishing occurred.
- This is an implementation checkpoint, not evidence of end-to-end product completion.
