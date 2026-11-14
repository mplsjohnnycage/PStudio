"""Bounded executable discovery / enrichment / Gate A / B-DNA / Gate B pilot.

Usage from repository root:
  python3 tools/discovery/run.py --bbox=-93.30,44.94,-93.20,45.00 \
    --category '%plumb%' --limit 30 --audit-limit 3 --output /tmp/prospects.jsonl

External website crawling is opt-in via --audit-limit; no production DB writes,
outreach, or model inference occurs without explicit integration.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from enrich import FirecrawlClient, build_bdna, crawl_business, gate_b
from overture import fetch_places, resolve_exact_locations
from pipeline import gate_a


def initial_signals(record: dict, crawl: dict) -> dict:
    signals = {}
    if record.get("category"):
        signals["category_fit"] = 1.0  # match to selected search category, not purchase intent
    if record.get("confidence") is not None:
        signals["identity_confidence"] = record["confidence"]
    sources = record.get("provenance", {}).get("source_datasets", [])
    if sources:
        signals["evidence_quality"] = min(1.0, len(sources) / 3.0)
    if crawl["status"] == "observed" and crawl.get("brand_name_match"):
        signals["identity_confidence"] = 1.0
    if crawl.get("issues"):
        signals["observed_digital_gap"] = min(
            1.0, sum(.65 if x["severity"] == "medium" else .25
                     for x in crawl["issues"]))
    return signals


def inspect_candidate(record: dict, *, scrape=None, audit: bool = True) -> dict:
    light = crawl_business(record, scrape=scrape, page_limit=1) if audit else {
        "status": "not_attempted", "pages": [], "issues": [],
        "website_verification": record.get("website_verification") or "unknown",
        "reason": "audit_budget_not_allocated",
    }
    a = gate_a(initial_signals(record, light))
    outcome = {"candidate": record, "gate_a": a, "website_check": {
        "status": light["status"], "verification": light["website_verification"],
        "reason": light.get("reason"),
        "evidence_urls": [p["source_url"] for p in light.get("pages", [])]},
        "stage": "candidate", "bdna": None, "gate_b": None,
        "embedding": {"status": "not_indexed", "reason": "not_gate_b_approved"}}
    if a["decision"] != "advance":
        outcome["stage"] = "research_more" if a["decision"] == "research_more" else "deferred_gate_a"
        return outcome
    if light["status"] != "observed":
        outcome["stage"] = "website_identity_or_access_research_needed"
        return outcome
    deep = crawl_business(record, scrape=scrape, page_limit=4,
                          homepage=light["pages"][0])
    bdna = build_bdna(record, deep)
    b = gate_b(record, bdna)
    outcome["bdna"] = bdna
    outcome["gate_b"] = b
    outcome["stage"] = ("qualified_for_review" if b["decision"] == "advance_to_review"
                        else "research_more" if b["decision"] == "research_more" else "deferred_gate_b")
    if b["decision"] == "advance_to_review":
        outcome["embedding"] = {"status": "eligible", "reason": "configure_embeddinggemma2_and_lancedb"}
    return outcome


def execute(*, bbox: tuple[float, float, float, float], category: str, limit: int,
            audit_limit: int, provider: str, release: str | None = None,
            seeds: list[dict] | None = None, scrape=None) -> dict:
    if not 0 <= audit_limit <= 20:
        raise ValueError("Audit budget must be between 0 and 20")
    if provider not in ("direct", "firecrawl", "auto"):
        raise ValueError("Unknown provider")
    records = resolve_exact_locations(
        seeds if seeds is not None else fetch_places(bbox, category=category, limit=limit, release=release))
    if scrape is None and audit_limit and provider in ("auto", "firecrawl") and os.getenv("FIRECRAWL_API_KEY"):
        scrape = FirecrawlClient(os.environ["FIRECRAWL_API_KEY"]).scrape
    if provider == "firecrawl" and audit_limit and scrape is None:
        raise RuntimeError("Firecrawl credentials not configured; no silent provider substitution")
    records.sort(key=lambda row: (row.get("confidence") is None, -(row.get("confidence") or 0), row["identity_key"]))
    enriched = [inspect_candidate(item, scrape=scrape, audit=i < audit_limit)
                for i, item in enumerate(records)]
    counts = {}
    for item in enriched:
        counts[item["stage"]] = counts.get(item["stage"], 0) + 1
    return {"policy_version": "discovery-pilot-v1",
            "limits": {"max_seed_records": limit, "max_web_audits": audit_limit,
                       "category_filter": category, "bbox": bbox},
            "count": len(enriched), "stage_counts": counts, "results": enriched}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", type=str, required=True,
                        help="West,south,east,north; <=0.5 degrees per dimension")
    parser.add_argument("--category", default="%", help="DuckDB ILIKE category filter")
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--audit-limit", type=int, default=0)
    parser.add_argument("--provider", choices=("auto", "direct", "firecrawl"), default="auto")
    parser.add_argument("--release", help="Optional pinned Overture release YYYY-MM-DD.N")
    parser.add_argument("--workspace-id", help="Workspace for explicit private LanceDB indexing")
    parser.add_argument("--index-root", help="Local LanceDB index root; requires --workspace-id")
    parser.add_argument("--dimensions", type=int, choices=(128, 256, 512, 768), default=256)
    parser.add_argument("--output", required=True, help="JSONL output; parent must exist")
    args = parser.parse_args()
    parts = tuple(float(x) for x in args.bbox.split(","))
    if len(parts) != 4:
        parser.error("Bbox requires exactly four numbers")
    result = execute(bbox=parts, category=args.category, limit=args.limit,
                     audit_limit=args.audit_limit, provider=args.provider,
                     release=args.release)
    output = Path(args.output).resolve()
    if not output.parent.is_dir():
        parser.error("Output directory does not exist")
    with output.open("w", encoding="utf-8") as stream:
        for item in result["results"]:
            stream.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")
    summary = {**{k: v for k, v in result.items() if k != "results"},
               "output": str(output)}
    if bool(args.workspace_id) != bool(args.index_root):
        parser.error("--workspace-id and --index-root must be supplied together")
    if args.workspace_id:
        from index import index_outcomes
        summary["index"] = index_outcomes(result["results"], workspace_id=args.workspace_id,
                                          index_root=args.index_root, dimensions=args.dimensions)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
