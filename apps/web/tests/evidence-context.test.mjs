import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evidenceScope,
  selectScopedEvidence,
  sourceConfidence,
} from "../src/lib/evidence-context.ts";

test("source label distinguishes Overture, historical license, and unidentified external evidence", () => {
  assert.equal(
    sourceConfidence(true, ["overture_places"]).label,
    "Overture Maps Places"
  );
  assert.equal(
    sourceConfidence(true, ["minneapolis_residential_specialty"]).label,
    "Historical public registry"
  );
  assert.equal(sourceConfidence(true, undefined).label, "External source");
  assert.equal(sourceConfidence(false, []).label, "Operator-reported");
});

test("previous prospect, workspace and owner evidence never renders under another selection", () => {
  const scope = evidenceScope("owner", "workspace-a", "prospect-a");
  const stored = { feed: { claims: [], evidence: [] }, scope, status: "ready" };
  assert.equal(selectScopedEvidence(stored, scope), stored);
  assert.equal(
    selectScopedEvidence(
      stored,
      evidenceScope("owner", "workspace-a", "prospect-b")
    ),
    null
  );
  assert.equal(
    selectScopedEvidence(
      stored,
      evidenceScope("owner", "workspace-b", "prospect-a")
    ),
    null
  );
  assert.equal(
    selectScopedEvidence(
      stored,
      evidenceScope("other-owner", "workspace-a", "prospect-a")
    ),
    null
  );
  assert.equal(selectScopedEvidence(stored, null), null);
});
