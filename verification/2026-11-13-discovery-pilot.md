# Discovery intelligence pilot — verified evidence

Date: 2026-11-13 US / 2026-11-14 UTC
Repository: mplsjohnnycage/PStudio
Worktree: /home/sprite/pstudio-discovery-real
Scope: isolated, read-only live discovery and bounded HTTP website audits. No production Neon write, outreach, publication or customer-impacting action.

## Live external checks

1. Connected DuckDB 2.0.0 to Overture Maps Places S3 GeoParquet. HTTPFS and spatial DuckDB extensions successfully installed in isolated Sprite environment.
2. Overture STAC catalog returned release 2026-10-21.0 at time of run.
3. Executed:
   python3 tools/discovery/run.py --bbox=-93.35,44.93,-93.20,45.04 --category '%plumb%' --limit 60 --audit-limit 2 --provider direct --output /tmp/pstudio-overture-plumb-v2.jsonl
4. Result: 26 candidate records matching the Overture plumbing category filter; 20 had website candidate fields and 6 had none. No website was asserted absent merely because a field was missing. Two bounded website audits ran, both reached pages with titles matching source business identities. Gate A returned midpoint score 75 with uncertainty range 50–100 for each audited candidate. Gate B deferred both at score 50 because the shallow inspection found no substantive actionable deficiencies. Remaining 24 were not fully audited; 20 required more website identity/access research and 4 deferred at Gate A. These outcomes are **not** actual market conversion predictions.
5. Independently exercised the connected Firecrawl scrape tool against Overture candidate p.zakitchen.com. It returned an off-domain destination branded Virtual Dining Concepts; consequently cross-domain redirect detection was added, and the site is not automatically assigned to the source business. The Firecrawl chat connector cannot be assumed to supply worker API credentials.
6. Ran 22 Python offline regression tests: all passed. Includes DuckDB SQL parameterization and bbox cap, provenance, exact alias grouping, missing-website uncertainty, public-target validation/SSRF restrictions, off-domain Firecrawl redirects, brand mismatch, B-DNA evidence, both scoring gates, and normalized embedding validation.
7. Installed LanceDB 0.41.0 in an isolated Sprite virtual environment and exercised a fixture-only index with 256-dimensional vectors, writing same three documents twice. Result: exactly 3 rows; duplicate upsert did not expand count. Those were synthetic unit vectors, **not EmbeddingGemma output**, and must never be labeled as real model embeddings.

## Operational boundaries

- This pilot does not yet persist any sourced discovery prospects into Neon or dispatch a Rivet market-discovery actor.
- It does not yet have independent domain search, verified no-website determination, review counts, mobile browser runs, Lighthouse scores, complete B-DNA, live EmbeddingGemma 2 inference or production LanceDB authorization/reconciliation.
- No customer website was published and no prospect was contacted.
- The current production API/web/worker release is unchanged.

## Reproduce

    python3 -m unittest discover -s tests/discovery -v
    python3 tools/discovery/run.py --bbox=-93.35,44.93,-93.20,45.04 --category '%plumb%' --limit 60 --audit-limit 2 --provider direct --output /tmp/pstudio-overture-plumb-v2.jsonl

Grounding:
- https://docs.overturemaps.org/getting-data/duckdb/
- https://docs.overturemaps.org/getting-data/cloud-sources/
- https://docs.overturemaps.org/gers/registry/
- https://huggingface.co/docs/transformers/model_doc/embedding_gemma2
