# Prospect Studio — bounded discovery intelligence pilot

Status: **working isolated pilot, NOT connected to production Neon/Rivet or the customer-facing UI.** This does not claim the autonomous customer-acquisition workflow is complete.

## Run against real Overture Places

Use Python 3.13, DuckDB, requests and the DuckDB httpfs extension. All Overture reads are spatially bounded and source versions are recorded.

    python -m pip install -r tools/discovery/requirements.txt
    python -c "import duckdb; d=duckdb.connect(); d.execute('INSTALL httpfs')"
    python tools/discovery/run.py --bbox=-93.35,44.93,-93.20,45.04 \
      --category '%plumb%' --limit 60 --audit-limit 2 --provider direct \
      --output /tmp/pstudio-plumbers.jsonl

Read-only seed mode uses --audit-limit 0 (no websites touched). Limit at most 500 Overture records and 0.5 degree bounding-box spans. The latest Overture release comes from STAC, or pin using --release=YYYY-MM-DD.N. DuckDB queries actual GeoParquet. Every record retains Overture ID, dataset attribution, release, observation timestamp and hash. Strict same-name/same-address aliases preserve source IDs without merging ambiguous near-neighbors.

## Staged logic

1. Overture Places → DuckDB → normalized provenance-bearing candidate.
2. Exact location alias grouping; no field does not mean no website.
3. Website check using Firecrawl if worker credentialed, otherwise explicitly limited HTML; cross-domain redirects and title/brand mismatch are not accepted as proof.
4. Explainable Gate A with dimensional scores, coverage, uncertainty bounds and missing evidence.
5. B-DNA deep stage if Gate A advances and site is accessible: bounded page titles, headings, content, contact actions and immutable content hashes (not a complete visual audit).
6. Gate B returns advance_to_review, research_more or defer; it does not infer buyer intent.
7. Only Gate B-qualified B-DNA is eligible for EmbeddingGemma 2 → LanceDB indexing. Real model inference and vector storage require explicit operator configuration.

Firecrawl API key is read from FIRECRAWL_API_KEY, never hardcoded. Mode firecrawl fails if not configured rather than silently pretending Firecrawl succeeded. Mode direct uses non-JavaScript HTTP.

## Optional local embedding/indexing

    python -m pip install lancedb 'sentence-transformers>=6.1.0'
    python tools/discovery/run.py --bbox=-93.35,44.93,-93.20,45.04 \
      --category '%plumb%' --limit 60 --audit-limit 5 \
      --workspace-id demo-workspace --index-root /private/indices \
      --output /tmp/pstudio-plumbers.jsonl

The official model is google/embeddinggemma-2, using SentenceTransformers encode_document and L2-normalized 128/256/512/768-dimensional vectors. Model inference is not yet provisioned/validated on the Sprite. LanceDB is a rebuildable retrieval index, not a replacement for Neon authority or workspace authorization. Test vectors are labeled with their actual test encoder model ID rather than incorrectly attributed to EmbeddingGemma.

## Verification and production boundaries

    python -m unittest discover -s tests/discovery -v

Offline tests cover bounded/parameterized SQL, identity resolution, provenance, unknown website, redirect identity mismatch, Gate A/B scoring, B-DNA, vector dimensions and normalization, and an end-to-end fixture. The isolated Sprite also queried live Minneapolis Overture Places on release 2026-10-21.0 and evaluated a small set of real public business websites without touching production Neon.

Security: private/reserved destinations, exotic ports, credentials-in-URL and cross-domain redirects are blocked or flagged. Automated production crawling still needs an enforced network egress policy against DNS rebinding, robots/terms compliance, rate limits, and durable artifact storage. Current shallow HTTP parsing cannot certify browser behavior, Lighthouse performance, reviews, demand, site absence or buying intent.

## Outstanding before production activation

- Authenticated market selection, Rivet batch actor, Neon transactional admission/outbox and source-ID re-verification.
- Independent official-domain search/verification for missing fields and redirects.
- Actual Playwright/browser and Lighthouse audits; expanded B-DNA grounded in multiple sources.
- Configure worker Firecrawl credentials (a ChatGPT connector is not automatically a worker API key).
- Install and benchmark real EmbeddingGemma 2 inference; configure secured production LanceDB and index reconciliation.
- Feed validated opportunities into existing website production, QA, human approvals and outreach flow.
- No unapproved public outreach, website publishing or user data cross-tenant exposure.

References: https://docs.overturemaps.org/getting-data/duckdb/ ; https://docs.overturemaps.org/gers/registry/ ; https://huggingface.co/docs/transformers/model_doc/embedding_gemma2 ; https://docs.firecrawl.dev/
