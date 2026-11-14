"""Bounded, provenance-backed business website research.

Firecrawl API adapter is optional. Direct HTTP is a limited non-JS fallback,
not a substitute for a full Playwright/Lighthouse browser inspection.
"""
from __future__ import annotations

import hashlib
import html
import ipaddress
import re
import socket
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests
from pipeline import normalize_domain, normalize_name

MAX_PAGE_BYTES = 600_000
MAX_PAGES = 4
PAGES = ("services", "about", "contact", "locations", "products")


def safe_public_url(url: str, *, resolve_dns: bool = True) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.scheme not in ("http", "https") or parsed.username or parsed.password or not host or len(url) > 2048:
        raise ValueError("Invalid external website URL")
    if host.endswith((".local", ".internal", ".localhost", ".test")) or "." not in host:
        raise ValueError("Non-public website host")
    if parsed.port not in (None, 80, 443):
        raise ValueError("Disallowed website port")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip and not ip.is_global:
        raise ValueError("Non-public IP host")
    if resolve_dns:
        try:
            ips = {item[4][0] for item in socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))}
        except (OSError, socket.gaierror) as exc:
            raise ValueError("DNS resolution failed") from exc
        if not ips or any(not ipaddress.ip_address(a).is_global for a in ips):
            raise ValueError("Non-public resolved address")
    # The network sandbox must also enforce egress restrictions to prevent DNS-rebinding races.
    return url


class PageReader(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = []
        self.title = ""
        self.headings = []
        self.links = []
        self.meta_description = ""
        self.has_form = False
        self.has_viewport = False
        self.text = []
        self.anchor = None

    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if tag in ("script", "style", "noscript", "svg"):
            self.active.append(tag)
        if tag == "a":
            self.anchor = {"href": props.get("href", ""), "text": ""}
        if tag == "form":
            self.has_form = True
        if tag == "meta" and props.get("name", "").lower() == "description":
            self.meta_description = props.get("content", "")[:500]
        if tag == "meta" and props.get("name", "").lower() == "viewport":
            self.has_viewport = True
        if tag in ("title", "h1", "h2", "h3"):
            self.active.append(tag)

    def handle_endtag(self, tag):
        if tag == "a" and self.anchor is not None:
            if self.anchor["href"]:
                self.links.append(self.anchor)
            self.anchor = None
        if tag in self.active:
            index = len(self.active) - 1 - self.active[::-1].index(tag)
            self.active.pop(index)

    def handle_data(self, data):
        value = " ".join(html.unescape(data).split())
        if not value:
            return
        if any(x in self.active for x in ("script", "style", "noscript", "svg")):
            return
        if "title" in self.active:
            self.title += (" " if self.title else "") + value
        if any(x in self.active for x in ("h1", "h2", "h3")) and len(self.headings) < 30:
            self.headings.append(value[:200])
        if self.anchor is not None:
            self.anchor["text"] += (" " if self.anchor["text"] else "") + value
        if len(self.text) < 400:
            self.text.append(value)


def name_agrees(name: str, page_title: str) -> bool:
    stop = {"llc", "inc", "ltd", "the", "co", "company"}
    a = set(normalize_name(name).split()) - stop
    b = set(normalize_name(page_title).split()) - stop
    return bool(a) and len(a & b) / len(a) >= .75


def parse_html_page(url: str, body: str, *, provider: str = "direct_html") -> dict:
    page = PageReader()
    page.feed(body[:MAX_PAGE_BYTES])
    links = page.links[:150]
    visible = " ".join(page.text)[:5000]
    return {
        "source_url": url, "provider": provider,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "content_sha256": hashlib.sha256(body.encode()).hexdigest(),
        "title": page.title[:250], "description": page.meta_description,
        "headings": list(dict.fromkeys(page.headings))[:30],
        "visible_excerpt": visible[:1800],
        "has_contact_action": any(
            l["href"].lower().startswith(("tel:", "mailto:")) or
            "contact" in l["text"].lower() or "get a quote" in l["text"].lower()
            for l in links),
        "has_form": page.has_form, "has_viewport": page.has_viewport,
        "links": [{"href": l["href"][:1500], "text": l["text"][:120]} for l in links],
    }


def direct_scrape(url: str, *, fetcher=None) -> dict:
    """Limited non-JavaScript HTML fetch; bounded redirects, content size and timeout."""
    safe_public_url(url)
    req = fetcher or requests.get
    origin = normalize_domain(url)
    current = url
    for _ in range(4):
        response = req(current, timeout=(4, 10), allow_redirects=False, stream=True,
                       headers={"User-Agent": "ProspectStudioResearch/0.1 (public-business-audit)",
                                "Accept": "text/html"})
        try:
            if response.status_code in (301, 302, 303, 307, 308):
                target = urljoin(current, response.headers.get("Location", ""))
                safe_public_url(target)
                if normalize_domain(target) != origin:
                    return {"source_url": current, "provider": "direct_redirect",
                            "captured_at": datetime.now(timezone.utc).isoformat(),
                            "content_sha256": hashlib.sha256(target.encode()).hexdigest(),
                            "redirect_target": target, "title": "", "links": []}
                current = target
                continue
            response.raise_for_status()
            if "text/html" not in response.headers.get("Content-Type", "").lower():
                raise ValueError("Non-HTML website response")
            raw = bytearray()
            for chunk in response.iter_content(chunk_size=8192):
                raw.extend(chunk)
                if len(raw) > MAX_PAGE_BYTES:
                    raise ValueError("Oversized website response")
            return parse_html_page(current, raw.decode(response.encoding or "utf-8", errors="replace"))
        finally:
            response.close()
    raise ValueError("Excessive website redirects")


class FirecrawlClient:
    """Documented Firecrawl v2 scrape endpoint; user/provider key required."""

    def __init__(self, api_key: str, *, post=None):
        if not api_key:
            raise ValueError("Firecrawl API key required")
        self.api_key = api_key
        self.post = post or requests.post

    def scrape(self, url: str) -> dict:
        safe_public_url(url)
        response = self.post(
            "https://api.firecrawl.dev/v2/scrape",
            json={"url": url, "formats": ["markdown"], "onlyMainContent": True},
            headers={"Authorization": "Bearer " + self.api_key},
            timeout=30,
        )
        response.raise_for_status()
        body = response.json()
        if not body.get("success") or not isinstance(body.get("data"), dict):
            raise ValueError("Firecrawl scrape unsuccessful")
        data = body["data"]
        meta = data.get("metadata") or {}
        content = str(data.get("markdown") or "")[:24_000]
        final_url = meta.get("url") or meta.get("sourceURL") or url
        safe_public_url(final_url)
        if normalize_domain(final_url) != normalize_domain(url):
            return {"source_url": url, "provider": "firecrawl_redirect",
                    "captured_at": datetime.now(timezone.utc).isoformat(),
                    "content_sha256": hashlib.sha256(str(final_url).encode()).hexdigest(),
                    "redirect_target": final_url, "title": "", "links": []}
        return {
            "source_url": final_url, "provider": "firecrawl",
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "content_sha256": hashlib.sha256(content.encode()).hexdigest(),
            "title": str(meta.get("title") or "")[:250],
            "description": str(meta.get("description") or "")[:500],
            "headings": re.findall(r"(?m)^#{1,3}\s+(.+)$", content)[:30],
            "visible_excerpt": content[:1800],
            "has_contact_action": bool(re.search(r"\b(contact|quote|call us|email us)\b", content, re.I)),
            "has_form": None, "has_viewport": None, "links": [],
        }


def chosen_links(page: dict) -> list[str]:
    base = normalize_domain(page["source_url"])
    found = []
    for link in page.get("links", []):
        href = link.get("href") or ""
        full = urljoin(page["source_url"], href).split("#")[0]
        if normalize_domain(full) != base or full in found:
            continue
        if not any(f"/{section}" in urlparse(full).path.lower() for section in PAGES):
            continue
        try:
            safe_public_url(full, resolve_dns=False)
        except ValueError:
            continue
        found.append(full)
        if len(found) >= MAX_PAGES - 1:
            break
    return found


def crawl_business(record: dict, *, scrape=None, page_limit: int = MAX_PAGES,
                   homepage: dict | None = None) -> dict:
    if not 1 <= page_limit <= MAX_PAGES:
        raise ValueError("Invalid page budget")
    domain = record.get("website")
    if not domain:
        return {"status": "no_candidate", "pages": [], "issues": [],
                "website_verification": "unknown", "reason": "no_source_website_field"}
    scraper = scrape or direct_scrape
    url = "https://" + domain + "/"
    try:
        home = homepage if homepage is not None else scraper(url)
    except Exception:
        return {"status": "unavailable_or_blocked", "pages": [], "issues": [],
                "website_verification": "unknown", "reason": "network_or_rendering_unavailable"}
    if home.get("redirect_target"):
        return {"status": "external_redirect_unverified", "pages": [home], "issues": [],
                "website_verification": "unverified_candidates",
                "reason": "redirected_to_different_domain_requires_identity_research"}
    agree = name_agrees(record["name"], home.get("title") or "")
    pages = [home]
    for link in chosen_links(home)[:page_limit - 1]:
        try:
            pages.append(scraper(link))
        except Exception:
            pass
    issues = []
    if home["provider"] == "direct_html":
        if not home.get("has_viewport"):
            issues.append({"code": "mobile_viewport_missing", "severity": "medium", "source_url": home["source_url"]})
        if not home.get("has_contact_action") and not home.get("has_form"):
            issues.append({"code": "homepage_contact_action_not_detected", "severity": "low", "source_url": home["source_url"]})
    if not home.get("description"):
        issues.append({"code": "homepage_meta_description_missing", "severity": "low", "source_url": home["source_url"]})
    return {
        "status": "observed", "pages": pages, "issues": issues,
        "website_verification": "probable_official" if agree else "unverified_candidates",
        "brand_name_match": agree,
        "reason": None if agree else "brand_identity_requires_corroboration",
    }


def build_bdna(record: dict, crawl: dict) -> dict:
    """Conservative B-DNA; no inferred revenue, intent, owner or site conversion metrics."""
    pages = crawl.get("pages", [])
    return {
        "schema_version": "bdna-observations-v1",
        "entity": {"identity_key": record["identity_key"], "name": record["name"],
                   "category": record.get("category"), "location": record.get("address")},
        "digital_presence": {
            "website_candidate": record.get("website"),
            "verification": crawl.get("website_verification"),
            "crawl_status": crawl["status"],
            "observed_titles": [p.get("title") for p in pages if p.get("title")],
            "observed_headings": list(dict.fromkeys(h for p in pages for h in p.get("headings", [])))[:40],
            "observed_issues": crawl.get("issues", []),
        },
        "evidence": [{key: p[key] for key in ("source_url", "provider", "captured_at", "content_sha256") if key in p}
                     for p in pages],
        "unknowns": ["revenue", "buyer_intent", "website_conversion_rate", "competitor_performance",
                     "business_owner_identity", *([] if pages else ["website_content"])],
        "claims_kind": "observed_or_reported_only",
    }


def gate_b(record: dict, bdna: dict, *, threshold: int = 65) -> dict:
    """Second gate evaluates *observed* website opportunities, not buyer intent."""
    digital = bdna["digital_presence"]
    evidence = bdna["evidence"]
    issues = digital["observed_issues"]
    if digital["verification"] != "probable_official" or not evidence:
        return {"decision": "research_more", "score": None, "reason": "insufficient_corroborated_audit",
                "policy_version": "gate-b-v1"}
    weights = {"identity": 25, "source_quality": 25, "observed_gap": 35, "solution_feasibility": 15}
    issue_score = min(1., sum(.65 if x["severity"] == "medium" else .25 for x in issues))
    signals = {"identity": 1., "source_quality": min(1., len(evidence) / 2),
               "observed_gap": issue_score, "solution_feasibility": 1. if issues else 0.}
    score = round(sum(weights[k] * signals[k] for k in weights), 2)
    decision = "advance_to_review" if score >= threshold and issue_score >= .5 else "defer"
    return {"decision": decision, "score": score, "signals": signals,
            "reason": "measured_website_opportunity" if decision == "advance_to_review" else "insufficient_observed_opportunity",
            "policy_version": "gate-b-v1"}
