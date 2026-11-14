"""EmbeddingGemma 2 → LanceDB retrieval projection for Gate B-approved B-DNA.

This is explicitly a *derivative* index, not the Neon source of truth.
No vectors are fabricated. Model downloading/inference is opt-in.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

MODEL_ID = "google/embeddinggemma-2"
VALID_DIMS = {128, 256, 512, 768}
WORKSPACE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")


def documents_for_review(outcome: dict, workspace_id: str) -> list[dict]:
    if not WORKSPACE_ID.fullmatch(workspace_id):
        raise ValueError("Invalid workspace ID")
    if (outcome.get("gate_b") or {}).get("decision") != "advance_to_review":
        return []
    bdna = outcome["bdna"]
    identity = outcome["candidate"]["identity_key"]
    original_hash = outcome["candidate"]["provenance"]["source_record_sha256"]
    digital = bdna["digital_presence"]
    common = {
        "workspace_id": workspace_id,
        "source_id": identity,
        "source_hash": original_hash,
        "bdna_version": bdna["schema_version"],
        "evidence_refs": json.dumps(bdna["evidence"], sort_keys=True),
    }
    payloads = [
        ("profile", "Business: {name}\nCategory: {category}\nAddress: {location}".format(**bdna["entity"])),
        ("observed_website", "\n".join([
            "Domain candidate: " + str(digital["website_candidate"]),
            "Website status: " + str(digital["verification"]),
            "Observed page titles: " + "; ".join(digital["observed_titles"]),
            "Observed headings: " + "; ".join(digital["observed_headings"]),
        ])),
        ("observed_issues", "\n".join(
            f'{x["code"]} severity={x["severity"]} source={x["source_url"]}'
            for x in digital["observed_issues"])),
    ]
    records = []
    for kind, content in payloads:
        if not content.strip():
            continue
        key = hashlib.sha256((workspace_id + "|" + identity + "|" + kind).encode()).hexdigest()
        records.append({
            **common, "id": key, "kind": kind, "text": content[:4000],
            "content_hash": hashlib.sha256(content.encode()).hexdigest(),
        })
    return records


def validate_vectors(vectors: list, *, count: int, dimensions: int) -> list[list[float]]:
    if dimensions not in VALID_DIMS:
        raise ValueError("Unsupported EmbeddingGemma dimension")
    if len(vectors) != count:
        raise ValueError("Embedding count mismatch")
    normalized = []
    for vector in vectors:
        nums = [float(x) for x in vector]
        if len(nums) != dimensions or not all(map(math.isfinite, nums)):
            raise ValueError("Invalid vector dimension or non-finite vector")
        norm = math.sqrt(sum(x * x for x in nums))
        if norm <= 0 or not .95 < norm < 1.05:
            raise ValueError("EmbeddingGemma vectors must be L2-normalized")
        normalized.append(nums)
    return normalized


class EmbeddingGemma2:
    """Load the real upstream model only when explicitly requested."""

    model_id = MODEL_ID

    def __init__(self, *, dimensions: int = 256, model=None):
        if dimensions not in VALID_DIMS:
            raise ValueError("Unsupported EmbeddingGemma dimension")
        self.dimensions = dimensions
        if model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:
                raise RuntimeError("Install sentence-transformers>=6.1.0 to run EmbeddingGemma 2") from exc
            model = SentenceTransformer(MODEL_ID)
        self.model = model

    def encode_documents(self, texts: list[str]) -> list[list[float]]:
        vectors = self.model.encode_document(
            texts, truncate_dim=self.dimensions, normalize_embeddings=True)
        return validate_vectors(list(vectors), count=len(texts), dimensions=self.dimensions)


def write_lance(rows: list[dict], vectors: list[list[float]], *, path: str,
                dimensions: int, model_id: str = MODEL_ID, connection=None) -> int:
    """Insert or update by stable document ID. Caller owns workspace isolation."""
    if not rows:
        return 0
    if len(rows) != len(vectors) or len({r["workspace_id"] for r in rows}) != 1:
        raise ValueError("Vector / workspace mismatch")
    validate_vectors(vectors, count=len(rows), dimensions=dimensions)
    if connection is None:
        try:
            import lancedb
        except ImportError as exc:
            raise RuntimeError("Install lancedb to enable semantic indexing") from exc
        connection = lancedb.connect(path)
    if not model_id or len(model_id) > 150:
        raise ValueError("Embedding model identity required")
    now = datetime.now(timezone.utc).isoformat()
    data = [{**r, "model": model_id, "dimensions": dimensions, "vector": v,
             "indexed_at": now} for r, v in zip(rows, vectors)]
    model_tag = re.sub(r"[^a-z0-9]+", "_", model_id.lower()).strip("_")[:40]
    table_name = f"prospect_bdna_{model_tag}_{dimensions}d"
    names = connection.table_names()
    if table_name not in names:
        connection.create_table(table_name, data=data)
    else:
        table = connection.open_table(table_name)
        table.merge_insert("id").when_matched_update_all().when_not_matched_insert_all().execute(data)
    return len(rows)


def index_outcomes(outcomes: list[dict], *, workspace_id: str,
                   index_root: str, dimensions: int = 256, encoder=None) -> dict:
    """Explicit invocation only. Isolate local indexes by validated workspace."""
    if not WORKSPACE_ID.fullmatch(workspace_id):
        raise ValueError("Invalid workspace ID")
    docs = [doc for result in outcomes for doc in documents_for_review(result, workspace_id)]
    if not docs:
        return {"indexed": 0, "status": "no_gate_b_approved_documents"}
    model = encoder or EmbeddingGemma2(dimensions=dimensions)
    model_id = getattr(model, "model_id", None)
    if not isinstance(model_id, str) or not model_id:
        raise ValueError("Encoder must declare model_id; no fake vectors labeled as EmbeddingGemma")
    vectors = model.encode_documents([x["text"] for x in docs])
    destination = Path(index_root).resolve() / workspace_id
    destination.mkdir(parents=True, exist_ok=True)
    count = write_lance(docs, vectors, path=str(destination), dimensions=dimensions,
                        model_id=model_id)
    return {"indexed": count, "status": "indexed", "model": model_id,
            "dimensions": dimensions, "workspace_id": workspace_id}
