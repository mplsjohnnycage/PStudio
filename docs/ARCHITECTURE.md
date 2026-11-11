# Architecture

Current state: generated Next.js web, Hono/oRPC server, TypeScript workspace, Drizzle database package and shared UI. A scaffold is not an authenticated or production-ready application.

Target flow: Overture Places -> embedded DuckDB geographic and category filtering -> preliminary scoring -> enrichment and source-linked brand DNA -> Neon PostgreSQL product records and hybrid retrieval -> map-first workspace and Rivet agent -> generated site preview -> prospect source inspection and comments. Re-score after enrichment. Missing Overture website information means unknown, not absent.

The user's HTML defines the map, ranked prospect list, inbox, business profile, pipeline, calendar and Design Studio. New prospect-facing features add scoped demo links, sources, annotations and booking/payment entry points. The future ChatGPT integration uses the same backend and follows the standalone product.

Rivet Actors, Pi Durable and workflows are planned runtime components. Their durable state is distinct from Neon application records. agentOS is the intended isolated worker within the main Sprite, subject to compatibility and security verification. R2 is the intended object-store provider; its compatibility with the selected Rivet version must be tested. Dynamic Apps is the planned generated-app runtime. External providers and full-browser sandbox needs require implementation and validation.
