Overture → Neon → Rivet integration slice

Status: opt-in private worker batch; NOT production-enabled autonomous discovery.

Architecture: bounded Overture GeoParquet query via DuckDB/Python child process → source-reported evidence + preliminary Gate A/B/B-DNA observations → tenant-checked Neon admission → transactional Neon job/outbox → existing dispatcher → Rivet jobGate → source-snapshot hash/identity verification → Neon atomic enrichment completion and private draft.

Private execution requires DATABASE_URL, OVERTURE_DISCOVERY_ENABLED=1, DISCOVERY_WORKSPACE_ID, DISCOVERY_OPERATOR_TOKEN_FILE, DISCOVERY_BBOX, DISCOVERY_CATEGORY, DISCOVERY_LIMIT, and optional DISCOVERY_PYTHON. The CLI now resolves the operator subject from a signed, unexpired, issuer/audience-verified Neon Auth JWT in an owner-only private token file; an arbitrary DISCOVERY_OPERATOR_USER_ID override is rejected. The verified subject must have an existing operator/owner workspace membership. CLI execution is staging-only and requires the scoped staging worker role. No real user token was available to exercise this path end-to-end yet. Run npm run discover:overture --workspace @prospect-studio/worker from a private Sprite. Never expose this command as a public endpoint.

Limitations: no fresh Overture re-fetch at Rivet execution, no independent website discovery, no rendered browser/Lighthouse, no normalized B-DNA tables, no actual EmbeddingGemma inference or LanceDB indexing, no autonomous scheduler or authenticated operator UI. Website and scoring observations are not proven buyer intent.

Release gate: do not enable production until staging worker+dispatcher are running updated code, a bounded staging batch completes through Rivet, resulting Neon evidence and private draft are inspected, and CI passes. No staging or production job has been run through this new path yet.

Tests: worker unit tests, TypeScript typecheck, Biome check; live read-only Node/Python Overture query succeeded with 2 Minneapolis plumbing records.
