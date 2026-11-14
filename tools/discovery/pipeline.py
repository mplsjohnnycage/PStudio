"""Prospect Studio discovery primitives. No network calls or production writes."""
from __future__ import annotations
import hashlib, json, re
from dataclasses import dataclass, asdict
from urllib.parse import urlparse


def normalize_domain(url: str | None) -> str | None:
    if not url: return None
    value = url.strip().lower()
    if not value: return None
    if '://' not in value: value = 'https://' + value
    parsed = urlparse(value)
    host = (parsed.hostname or '').removeprefix('www.')
    if not host or '.' not in host or any(c.isspace() for c in host): return None
    return host


def normalize_name(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', ' ', name.casefold()).strip()


def identity_key(record: dict) -> str:
    """Deterministic candidate key; never assert that collisions prove identity."""
    source = str(record.get('source') or 'unknown')
    source_id = record.get('source_id')
    if source_id: return f'{source}:{source_id}'
    parts = [normalize_name(str(record.get('name') or '')), str(record.get('address') or '').strip().casefold(), str(record.get('city') or '').strip().casefold()]
    return 'candidate:' + hashlib.sha256('|'.join(parts).encode()).hexdigest()[:24]


def website_status(source_website: str | None, independent_domains: list[str] | None = None, confirmed_official: str | None = None) -> dict:
    """No site requires corroboration; absence of a field is UNKNOWN."""
    candidates = sorted(set(filter(None, [normalize_domain(source_website), *(normalize_domain(x) for x in (independent_domains or []))])))
    verified = normalize_domain(confirmed_official)
    if verified and verified in candidates:
        return {'status':'verified_site', 'domain':verified, 'candidates':candidates}
    return {'status':'unverified_candidates' if candidates else 'unknown', 'domain':None, 'candidates':candidates}

WEIGHTS = {'category_fit':25, 'observed_digital_gap':25, 'viability':15, 'identity_confidence':15, 'evidence_quality':10, 'research_value':10}

def gate_a(signals: dict, *, min_evidence: int = 2, threshold: float = 65) -> dict:
    """Scores normalized 0..1 signals; unknowns remain unknown, not zero."""
    bad = {k:v for k,v in signals.items() if k in WEIGHTS and (not isinstance(v,(int,float)) or isinstance(v,bool) or not 0 <= v <= 1)}
    if bad: raise ValueError(f'Invalid normalized signals: {list(bad)}')
    observed = {k:float(signals[k]) for k in WEIGHTS if k in signals and signals[k] is not None}
    coverage = sum(WEIGHTS[k] for k in observed) / 100
    weighted = sum(WEIGHTS[k]*v for k,v in observed.items())
    missing_weight = 100 - sum(WEIGHTS[k] for k in observed)
    # Unknown data is never scored as observed zero or optimistic one.
    # Report conservative uncertainty bounds and a transparent neutral midpoint.
    score = round(weighted + .5 * missing_weight, 2) if coverage else None
    decision = 'research_more' if len(observed) < min_evidence or coverage < .5 else ('advance' if score >= threshold else 'defer')
    return {'score':score,'score_bounds':[round(weighted,2),round(weighted+missing_weight,2)],
            'decision':decision,'coverage':round(coverage,2),'observed':observed,
            'missing':[k for k in WEIGHTS if k not in observed], 'policy_version':'gate-a-v2'}


def normalize_place(record: dict) -> dict:
    return {'identity_key':identity_key(record), 'name':str(record.get('name') or '').strip(), 'category':record.get('category'), 'address':record.get('address'), 'city':record.get('city'), 'source':record.get('source','overture'), 'source_id':record.get('source_id'), 'website':normalize_domain(record.get('website')), 'website_verification':'unknown', 'provenance':record.get('provenance',{})}


def duckdb_seed_query(parquet_glob: str, *, category_pattern: str, limit: int = 1000) -> tuple[str,list]:
    """Parameterized query for a normalized local Parquet staging schema.
    Overture source fields must first be mapped to name/category/address/city/website/source_id.
    """
    if not 1 <= limit <= 100000: raise ValueError('limit out of bounds')
    if not parquet_glob.startswith('/') or "'" in parquet_glob: raise ValueError('absolute safe parquet path required')
    sql = f"SELECT name, category, address, city, website, source_id FROM read_parquet('{parquet_glob}') WHERE lower(category) LIKE lower(?) AND name IS NOT NULL LIMIT ?"
    return sql,[category_pattern,limit]


def export_jsonl(records: list[dict]) -> str:
    return ''.join(json.dumps(normalize_place(r),sort_keys=True)+'\n' for r in records)
