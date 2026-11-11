# Connector inventory

| Integration | Location and connection | Status |
| --- | --- | --- |
| Neon Lakebase | External PostgreSQL over TLS; database URL is a server secret | Planned |
| Neon-managed Better Auth | External authentication service; application integration and authorization required | Planned |
| Cloudflare R2 | External S3-compatible object storage; endpoint and bucket-scoped credentials | Planned; Rivet compatibility unverified |
| Overture Places | Public remote GeoParquet; filtered by embedded DuckDB on Sprite | Planned; preserve attribution and data freshness |
| AgentMail | External API and verified inbound webhooks | Planned; sending requires owner approval |
| Model and embeddings providers | External APIs or explicitly authorized subscription flow | Planned; credentials stay server-side |
| Map tiles | External licensed style and tile provider for MapLibre | Planned; public keys are not secrets |
| Rivet, agentOS and Dynamic Apps | Intended Sprite-local runtime; private service access | Planned; no running integration asserted |
| Booking and payments | External services; optional | Planned; do not create payment or booking actions automatically |

These are application integrations, not assertions about a native Sprite connector registry. Verify actual SDK environment names, access scope, webhook signatures and network requirements before configuring providers.
