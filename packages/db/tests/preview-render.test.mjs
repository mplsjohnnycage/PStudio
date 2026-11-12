import assert from "node:assert/strict";
import { test } from "node:test";
import { renderProspectPreview } from "../src/preview-render.ts";

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
