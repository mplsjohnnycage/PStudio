"""Bounded Overture Places → DuckDB → evidence-preserving candidate seeds.

Reads actual Overture GeoParquet using spatial bounding-box predicate pushdown.
No prospect database mutations and no assumption that a missing website means none.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from urllib.request import urlopen

from pipeline import normalize_name, normalize_domain

CATALOG = "https://stac.overturemaps.org/catalog.json"
RELEASE = re.compile(r"^\d{4}-\d{2}-\d{2}\.\d+$")
MAX_RESULTS = 500


def latest_release() -> str:
    with urlopen(CATALOG, timeout=12) as response:
        content = response.read(250_000)
    release = json.loads(content)["latest"]
    if not isinstance(release, str) or not RELEASE.fullmatch(release):
        raise ValueError("Invalid release in Overture catalog")
    return release


def validate_bbox(bbox: tuple[float, float, float, float]) -> None:
    import math
    w, s, e, n = bbox
    if not all(map(math.isfinite, bbox)) or not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise ValueError("Invalid longitude/latitude bounds")
    if e - w > .5 or n - s > .5:
        raise ValueError("Discovery batches must be spatially bounded; tile large markets")


def place_query(release: str, bbox: tuple[float, float, float, float], category: str = "%", limit: int = 100) -> tuple[str, list]:
    if not RELEASE.fullmatch(release):
        raise ValueError("Invalid release identifier")
    validate_bbox(bbox)
    if not 1 <= limit <= MAX_RESULTS:
        raise ValueError("Limit outside bounded batch range")
    if not category or len(category) > 100:
        raise ValueError("Invalid category filter")
    w, s, e, n = bbox
    # Release can only be a restricted Overture version. All user filter values
    # are bound to DuckDB parameters. bbox is on point geometries.
    query = f"""
    SELECT id AS source_id, names.primary AS name, taxonomy.primary AS category,
           CAST(addresses AS JSON) AS addresses, CAST(websites AS JSON) AS websites,
           CAST(sources AS JSON) AS sources, confidence,
           bbox.xmin AS longitude, bbox.ymin AS latitude
    FROM read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*',
                      hive_partitioning=1)
    WHERE bbox.xmin BETWEEN ? AND ? AND bbox.ymin BETWEEN ? AND ?
      AND taxonomy.primary ILIKE ? AND names.primary IS NOT NULL
    LIMIT ?
    """
    return query, [w, e, s, n, category, limit]


def decode_json(value):
    if value is None:
        return None
    return json.loads(value) if isinstance(value, str) else value


def to_candidate(row: dict, release: str) -> dict | None:
    source_id = str(row.get("source_id") or "")
    name = str(row.get("name") or "").strip()
    if not (source_id and name and len(name) <= 160):
        return None
    addresses = decode_json(row.get("addresses")) or []
    websites = decode_json(row.get("websites")) or []
    sources = decode_json(row.get("sources")) or []
    address = addresses[0] if addresses and isinstance(addresses[0], dict) else {}
    street = str(address.get("freeform") or "").strip()
    city = str(address.get("locality") or "").strip()
    region = str(address.get("region") or "").strip()
    zip_code = str(address.get("postcode") or "").strip()
    formatted = ", ".join(x for x in [street, city, " ".join(filter(None, [region, zip_code]))] if x)
    source_websites = [v for v in websites if isinstance(v, str) and normalize_domain(v)]
    domain = normalize_domain(source_websites[0]) if source_websites else None
    distinct_sources = sorted(set(str(src.get("dataset") or "").strip()
                                  for src in sources if isinstance(src, dict) and src.get("dataset")))
    raw_confidence = row.get("confidence")
    confidence = float(raw_confidence) if isinstance(raw_confidence, (int,float)) and not isinstance(raw_confidence,bool) else None
    if confidence is not None and not 0 <= confidence <= 1:
        confidence = None
    observation = {
        "overture_release": release, "source_id": source_id, "name": name, "category": row.get("category"),
        "address": formatted, "city": city, "region": region,
        "latitude": row.get("latitude"), "longitude": row.get("longitude"),
        "website_candidates": source_websites, "source_datasets": distinct_sources,
        "source_attributions": sources, "overture_confidence": confidence,
    }
    fingerprint = hashlib.sha256(json.dumps(observation, sort_keys=True, default=str).encode()).hexdigest()
    # Cross-source candidates only cluster with complete, exact-normalized
    # name + street + city + region. Never merge vague near-neighbors by GPS.
    match_parts = [normalize_name(name), normalize_name(street), normalize_name(city), region.casefold()]
    cluster = ("location:" + hashlib.sha256("|".join(match_parts).encode()).hexdigest()[:24]
               if all(match_parts) else None)
    return {
        "source": "overture", "source_id": source_id,
        "identity_key": f"overture:{source_id}", "provisional_cluster": cluster,
        "name": name, "category": row.get("category"), "address": formatted or None,
        "city": city or None, "region": region or None, "latitude": row.get("latitude"),
        "longitude": row.get("longitude"), "website": domain,
        "website_candidates": source_websites,
        "website_verification": "unverified_candidates" if domain else "unknown",
        "confidence": confidence,
        "provenance": {
            "dataset": "Overture Maps places", "release": release,
            "license_check_required": True,
            "catalog": CATALOG, "observed_at": datetime.now(timezone.utc).isoformat(),
            "source_datasets": distinct_sources,
            "source_record_sha256": fingerprint,
        },
        "source_observation": observation,
    }


def fetch_places(bbox: tuple[float,float,float,float], *, category: str = "%", limit: int = 100,
                 release: str | None = None, connection=None) -> list[dict]:
    import duckdb
    version = release or latest_release()
    query, params = place_query(version, bbox, category, limit)
    own = connection is None
    con = connection or duckdb.connect()
    try:
        con.execute("LOAD httpfs")
        con.execute("SET s3_region='us-west-2'")
        cursor = con.execute(query, params)
        names = [x[0] for x in cursor.description]
        return [c for row in cursor.fetchall()
                if (c := to_candidate(dict(zip(names, row)), version))]
    finally:
        if own:
            con.close()


def resolve_exact_locations(records: list[dict]) -> list[dict]:
    """Group only strict same-name/same-address aliases; preserve all source IDs."""
    groups: dict[str, dict] = {}
    for record in records:
        key = record.get("provisional_cluster") or record["identity_key"]
        if key not in groups:
            groups[key] = {**record, "source_aliases": [record["identity_key"]]}
            continue
        target = groups[key]
        target["source_aliases"].append(record["identity_key"])
        for candidate in record.get("website_candidates", []):
            if candidate not in target["website_candidates"]:
                target["website_candidates"].append(candidate)
        target["confidence"] = max(
            [x for x in [target.get("confidence"),record.get("confidence")] if x is not None],
            default=None,
        )
        target["provenance"]["source_datasets"] = sorted(
            set(target["provenance"]["source_datasets"]) | set(record["provenance"]["source_datasets"]))
        target["website"] = target["website"] or record.get("website")
        target["website_verification"] = (
            "unverified_candidates" if target["website_candidates"] else "unknown")
    return list(groups.values())
