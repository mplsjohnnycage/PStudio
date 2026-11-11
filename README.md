# Prospect Studio

Production-oriented foundation for a map-first prospect workspace. This is a fresh Better-T-Stack scaffold, not a completed product or production release.

The intended experience follows the supplied HTML: ranked prospects and inbox on the left, map in the center, business profile on the right, with pipeline, calendar and Design Studio. Future additions include source-linked brand research, shared previews and annotations.

## Workspace

- `apps/web`: Next.js interface.
- `apps/server`: Hono and oRPC backend.
- `packages/db`: PostgreSQL and Drizzle.
- `packages/api`: shared API contracts.
- `packages/ui` and `packages/config`: shared UI and configuration.

Node 24 and npm workspaces are used. Run `npm ci`, `npm run test`, `npm run check-types`, `npm run check` and `npm run build` from the repository root. Runtime configuration is described in [environment](docs/ENVIRONMENT.md); see [architecture](docs/ARCHITECTURE.md) and [connectors](docs/CONNECTORS.md). Some checks or credentials may still be unresolved; consult the current handoff before relying on the scaffold.

## Status and release

Neon-managed authentication, Rivet, Overture, AgentMail, R2, Dynamic Apps, source provenance and customer preview workflows are planned integrations, not established by scaffolding. Never expose this unauthenticated scaffold publicly. Production release requires verified authentication, permissions, recovery, monitoring and an explicit owner deployment decision.

## Contracts

`packages/api/src/contracts.ts` defines versioned source-aware data contracts for prospects, captured evidence, claims, jobs, approvals, scoped previews, comments, and outreach drafts. `npm run test` verifies validation and model-level access/approval prerequisites. These are NOT an authentication service, a persisted database schema, or permission enforcement in Hono. See [contracts notes](docs/CONTRACTS.md).
