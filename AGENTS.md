# Prospect Studio agent guidance

Inspect before changing files and respect existing edits. Back up existing configuration before modifying it. Work in small, verifiable changes; run relevant checks and report output and limitations.

The supplied HTML is the design reference for the workspace. Keep researched facts linked to their actual sources; unknown data remains unknown. Never fabricate evidence or present sample data as verified.

The standalone app is primary. The intended stack is Next.js, Hono, oRPC, Node/npm, Turborepo, Drizzle, Neon-managed Better Auth, Rivet, Overture/DuckDB and R2. Distinguish implemented code from future plans. Do not assume providers, integrations or generated applications work without evidence.

Keep credentials outside Git, logs and browser bundles. Use isolated test resources and least privilege. Outreach requires explicit owner approval; production deployment requires owner approval. Do not expose agent secrets or unrestricted shell access through public endpoints.

Use `.trail/learnings/` only as supported by Trail Code; verify generated instructions and exclude secrets. AgentOS permissions require runtime enforcement. Document decisions and relevant tests in docs.
