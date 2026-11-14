import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "discovery"))

from enrich import (FirecrawlClient, build_bdna, crawl_business, gate_b,
                    parse_html_page, safe_public_url, direct_scrape)
from index import documents_for_review, validate_vectors, write_lance
from overture import (place_query, to_candidate, resolve_exact_locations, validate_bbox)
from run import execute, inspect_candidate

RELEASE = "2026-10-21.0"


def source(name="P.Za Plumbing", id="abc1", address="1204 Harmon Pl"):
    return {
        "source_id": id, "name": name, "category": "plumber",
        "addresses": json.dumps([{"freeform": address, "locality": "Minneapolis",
                                  "region": "MN", "postcode": "55403", "country": "US"}]),
        "websites": json.dumps(["https://pzaplumbing.example/"]),
        "sources": json.dumps([{"dataset":"meta", "license":"CDLA-Permissive-2.0"},
                               {"dataset":"Microsoft","license":"CDLA-Permissive-2.0"}]),
        "confidence": 0.85, "latitude":44.97, "longitude":-93.27,
    }


def successful_page(url):
    return parse_html_page(url, """<!doctype html><html><head>
        <title>P.Za Plumbing | Minneapolis</title></head><body>
        <h1>Plumbing and sewer repair</h1>
        <a href="/services">Services</a>
        </body></html>""")


class QueryTests(unittest.TestCase):
    def test_bounded_parameterized_overture_query(self):
        sql, parameters = place_query(RELEASE, (-93.3,44.9,-93.2,45.0), "%plumb%", 20)
        self.assertIn("bbox.xmin BETWEEN ? AND ?", sql)
        self.assertIn("2026-10-21.0", sql)
        self.assertEqual(parameters, [-93.3,-93.2,44.9,45.0,"%plumb%",20])

    def test_reject_large_or_bad_market_or_injection(self):
        for bbox in [(-180,-80,180,80), (-90,45,-91,46), (0,0,0,1)]:
            with self.assertRaises(ValueError):
                validate_bbox(bbox)
        with self.assertRaises(ValueError):
            place_query("2026-10-21.0' DROP TABLE x;", (-93.3,44.9,-93.2,45), "%", 20)
        with self.assertRaises(ValueError):
            place_query(RELEASE,(-93.3,44.9,-93.2,45),"%",50000)

    def test_overture_provenance_and_missing_website(self):
        data = source()
        data["websites"] = "[]"
        r = to_candidate(data, RELEASE)
        self.assertEqual(r["website_verification"], "unknown")
        self.assertIsNone(r["website"])
        self.assertEqual(r["source"], "overture")
        self.assertEqual(len(r["provenance"]["source_record_sha256"]), 64)
        self.assertEqual(r["provenance"]["source_datasets"], ["Microsoft", "meta"])

    def test_dedup_preserves_source_id_aliases(self):
        r1 = to_candidate(source(id="one", name="P.ZA Plumbing"), RELEASE)
        r2 = to_candidate(source(id="two", name="P.Za Plumbing"), RELEASE)
        out = resolve_exact_locations([r1, r2])
        self.assertEqual(len(out),1)
        self.assertEqual(set(out[0]["source_aliases"]), {"overture:one","overture:two"})

    def test_distinct_locations_not_collapsed(self):
        r1 = to_candidate(source(id="one"),RELEASE)
        r2 = to_candidate(source(id="two", address="5 First St"),RELEASE)
        self.assertEqual(len(resolve_exact_locations([r1,r2])),2)


class ScrapeTests(unittest.TestCase):
    def test_block_ssrf_urls(self):
        for url in ["http://127.0.0.1/", "http://169.254.169.254/latest",
                    "http://10.0.0.2/", "http://localhost/",
                    "http://private.internal/", "file:///etc/passwd",
                    "https://user:pass@example.com/path",
                    "https://example.com:8080/path"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                safe_public_url(url, resolve_dns=False)

    def test_missing_url_never_no_website(self):
        rec = to_candidate({**source(), "websites":"[]"}, RELEASE)
        audit = crawl_business(rec)
        self.assertEqual(audit["status"], "no_candidate")
        self.assertEqual(audit["website_verification"], "unknown")
        self.assertNotIn("no_website",json.dumps(audit))

    def test_firecrawl_external_redirect_flagged(self):
        class Response:
            def raise_for_status(self): pass
            def json(self):
                return {"success": True,"data":{"markdown":"Welcome",
                    "metadata":{"sourceURL":"https://pzaplumbing.example/",
                                "url":"https://unrelated.example/",
                                "title":"Unrelated Brand"}}}
        with patch("enrich.safe_public_url",lambda u: u):
            page = FirecrawlClient("test",post=lambda *a,**kw:Response()).scrape("https://pzaplumbing.example/")
        self.assertEqual(page["provider"],"firecrawl_redirect")
        self.assertEqual(page["redirect_target"],"https://unrelated.example/")
        rec=to_candidate(source(),RELEASE)
        audit = crawl_business(rec,scrape=lambda _:page)
        self.assertEqual(audit["status"],"external_redirect_unverified")
        self.assertNotEqual(audit["website_verification"],"probable_official")

    def test_identity_brand_mismatch_not_qualified(self):
        rec=to_candidate(source(),RELEASE)
        page=parse_html_page("https://pzaplumbing.example/","<title>Unrelated Hotel</title>")
        audit=crawl_business(rec,scrape=lambda _:page)
        self.assertEqual(audit["website_verification"],"unverified_candidates")
        bdna=build_bdna(rec,audit)
        self.assertEqual(gate_b(rec,bdna)["decision"],"research_more")

    def test_homepage_findings_are_observations_only(self):
        rec=to_candidate(source(),RELEASE)
        audit=crawl_business(rec,scrape=successful_page)
        bdna=build_bdna(rec,audit)
        self.assertEqual(bdna["schema_version"],"bdna-observations-v1")
        self.assertTrue(bdna["digital_presence"]["observed_issues"])
        self.assertIn("buyer_intent",bdna["unknowns"])
        self.assertTrue(all(e["content_sha256"] for e in bdna["evidence"]))


class GateAndIndexTests(unittest.TestCase):
    def test_initial_scoring_reports_uncertainty(self):
        rec=to_candidate(source(),RELEASE)
        outcome=inspect_candidate(rec,scrape=successful_page)
        a=outcome["gate_a"]
        self.assertLess(a["score"],100)
        self.assertEqual(a["policy_version"],"gate-a-v2")
        self.assertLessEqual(a["score_bounds"][0],a["score"])
        self.assertGreaterEqual(a["score_bounds"][1],a["score"])

    def test_research_gate_and_qualified_review(self):
        rec=to_candidate(source(),RELEASE)
        outcome=inspect_candidate(rec,scrape=successful_page)
        self.assertEqual(outcome["stage"],"qualified_for_review")
        self.assertEqual(outcome["gate_b"]["decision"],"advance_to_review")
        self.assertEqual(outcome["embedding"]["status"],"eligible")
        docs=documents_for_review(outcome,"workspace_1")
        self.assertEqual(len(docs),3)
        self.assertEqual(len(set(d["id"] for d in docs)),3)
        self.assertTrue(all(d["evidence_refs"] for d in docs))

    def test_does_not_index_unqualified(self):
        rec=to_candidate(source(),RELEASE)
        outcome=inspect_candidate(rec,scrape=lambda url:parse_html_page(
            url,"<html><head><title>P.Za Plumbing</title>"
            '<meta name="description" content="Reliable services">'
            '<meta name="viewport" content="width=device-width"></head><body>'
            '<a href="tel:555">Call us</a></body></html>'))
        self.assertNotEqual(outcome["gate_b"]["decision"],"advance_to_review")
        self.assertEqual(documents_for_review(outcome,"workspace_1"),[])

    def test_vector_contract(self):
        self.assertEqual(validate_vectors([[1.]+[0.]*255],count=1,dimensions=256)[0][:2],[1.,0.])
        with self.assertRaises(ValueError):
            validate_vectors([[.5]*256],count=1,dimensions=256)
        with self.assertRaises(ValueError):
            validate_vectors([[float("nan")]*256],count=1,dimensions=256)
        with self.assertRaises(ValueError):
            validate_vectors([[1.]*256],count=1,dimensions=64)

    def test_end_to_end_fixture_no_external_calls(self):
        rec=to_candidate(source(),RELEASE)
        result=execute(bbox=(-93.3,44.9,-93.2,45.),category="%plumb%",
                       limit=1,audit_limit=1,provider="direct",
                       seeds=[rec],scrape=successful_page)
        self.assertEqual(result["count"],1)
        self.assertEqual(result["stage_counts"],{"qualified_for_review":1})
        self.assertEqual(result["results"][0]["bdna"]["entity"]["name"],rec["name"])


if __name__ == "__main__":
    unittest.main()
