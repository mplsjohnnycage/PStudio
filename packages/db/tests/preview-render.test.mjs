import assert from "node:assert/strict";
import { test } from "node:test";
import { renderProspectPreview } from "../src/preview-render.ts";

const PUBLIC_PROVENANCE = {
  evidenceId: /evidence_abc123/,
  external: /External source report/i,
  historical: /Historical registry report/i,
  operator: /Operator-reported information/,
  safeSource: /https:\/\/example\.gov\/license\?id=1&amp;doc=2/,
  timestamp: /2026-11-12T18:00:00.000Z/,
  unsupportedLicense: /Active license|Currently licensed|verified contractor/i,
};

const PATTERNS = {
  p0: /Operator &lt;script&gt;/,
  p1: /<script>/,
  p2: /We are the best|Award-winning|5-star/i,
  p3: /Draft preview/,
  p4: /href="null"/,
  p5: /123 Example St/,
  p6: /https:\/\/example\.com\/\?a=1&amp;b=2/,
  p7: /Operator-reported/,
  p8: /http-equiv="refresh"/,
};

const FULL_SITE_PATTERNS = {
  approval: /Not approved for publication or outreach/,
  business: /Craft a distinct digital presence/,
  contact: /Get in touch/,
  escapeImage: /&lt;img src=x onerror=alert\(1\)&gt;/,
  escapeScript: /&lt;script&gt;alert\(1\)&lt;\/script&gt;/,
  html: /DOCTYPE html/i,
  proof: /Work &amp; proof/,
  rawImage: /<img src=x/,
  rawScript: /<script>/,
  services: /Services/,
};
test("pilot preview preserves reported details without inventing claims", () => {
  const html = renderProspectPreview({
    name: "Operator <script>alert(1)</script>",
    physicalAddress: null,
    websiteUrl: null,
  });
  assert.match(html, PATTERNS.p0);
  assert.doesNotMatch(html, PATTERNS.p1);
  assert.doesNotMatch(html, PATTERNS.p2);
  assert.match(html, PATTERNS.p3);
  assert.doesNotMatch(html, PATTERNS.p4);
});

test("pilot preview shows explicit reported source and sanitized website", () => {
  const html = renderProspectPreview({
    name: "Example Shop",
    physicalAddress: "123 Example St",
    websiteUrl: "https://example.com?a=1&b=2",
  });
  assert.match(html, PATTERNS.p5);
  assert.match(html, PATTERNS.p6);
  assert.match(html, PATTERNS.p7);
  assert.doesNotMatch(html, PATTERNS.p8);
});

test("external-source preview labels historical claims and preserves cited evidence without promoting licensure", () => {
  const html = renderProspectPreview({
    name: "Historical Painting Shop",
    physicalAddress: "Minneapolis, MN",
    provenance: {
      capturedAt: new Date("2026-11-12T18:00:00.000Z"),
      evidenceId: "evidence_abc123",
      kind: "external_source",
      sourceUri: "https://example.gov/license?id=1&doc=2",
      title:
        "City of Minneapolis residential specialty trade license record (legacy)",
    },
    websiteUrl: null,
  });
  assert.match(html, PUBLIC_PROVENANCE.historical);
  assert.match(html, PUBLIC_PROVENANCE.timestamp);
  assert.match(html, PUBLIC_PROVENANCE.evidenceId);
  assert.match(html, PUBLIC_PROVENANCE.safeSource);
  assert.doesNotMatch(html, PUBLIC_PROVENANCE.unsupportedLicense);
  assert.doesNotMatch(html, PUBLIC_PROVENANCE.operator);
});

test("general external-source preview is not mislabeled historical", () => {
  const html = renderProspectPreview({
    name: "Current Public Source LLC",
    physicalAddress: null,
    provenance: {
      capturedAt: new Date("2026-11-12T19:00:00.000Z"),
      evidenceId: "evidence_current",
      kind: "external_source",
      sourceUri: "https://example.gov/public-record",
      title: "Contemporary business directory",
    },
    websiteUrl: null,
  });
  assert.match(html, PUBLIC_PROVENANCE.external);
  assert.doesNotMatch(html, PUBLIC_PROVENANCE.historical);
});

test("three independently rendered design directions create exportable full-page HTML", () => {
  const base = {
    headline: "Craft a distinct digital presence",
    introduction: "Operator-directed draft; service details await approval.",
    name: "Northern Workshop",
    physicalAddress: "St Paul, MN",
    websiteUrl: null,
  };
  const a = renderProspectPreview({ ...base, design: "editorial" });
  const b = renderProspectPreview({ ...base, design: "atelier" });
  const c = renderProspectPreview({ ...base, design: "modern" });
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  for (const html of [a, b, c]) {
    assert.match(html, FULL_SITE_PATTERNS.business);
    assert.match(html, FULL_SITE_PATTERNS.services);
    assert.match(html, FULL_SITE_PATTERNS.proof);
    assert.match(html, FULL_SITE_PATTERNS.contact);
    assert.match(html, FULL_SITE_PATTERNS.html);
    assert.match(html, FULL_SITE_PATTERNS.approval);
  }
});

test("operator-authored headline and introduction are escaped, never executable", () => {
  const html = renderProspectPreview({
    headline: "<img src=x onerror=alert(1)>",
    introduction: "<script>alert(1)</script>",
    name: "Example",
    physicalAddress: null,
    websiteUrl: null,
  });
  assert.match(html, FULL_SITE_PATTERNS.escapeImage);
  assert.match(html, FULL_SITE_PATTERNS.escapeScript);
  assert.doesNotMatch(html, FULL_SITE_PATTERNS.rawImage);
  assert.doesNotMatch(html, FULL_SITE_PATTERNS.rawScript);
});
