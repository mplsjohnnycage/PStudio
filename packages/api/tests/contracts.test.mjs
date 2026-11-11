import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approvalSchema,
  canAccessPreview,
  canReleaseDraft,
  claimSchema,
  commentSchema,
  draftSchema,
  evidenceSchema,
  jobSchema,
  previewSchema,
  prospectSchema,
} from "../src/contracts.ts";

const observedAt = "2026-11-11T21:30:00Z";
const later = "2026-11-12T21:30:00Z";

const prospect = {
  createdAt: observedAt,
  externalIds: [{ provider: "overture", value: "overture-123" }],
  id: "prospect-1",
  name: "Example Business",
  phone: { checkedAt: null, status: "unknown", value: null },
  physicalAddress: null,
  stage: "discovered",
  updatedAt: observedAt,
  website: { checkedAt: null, status: "unknown", value: null },
};

const evidence = {
  capturedAt: observedAt,
  excerpt: "Serving the Twin Cities",
  id: "evidence-1",
  prospectId: "prospect-1",
  sha256: "a".repeat(64),
  title: "About",
  type: "website",
  uri: "https://example.com/about",
};

const sharedPreview = {
  allowedViewerIds: ["reviewer-1"],
  createdAt: observedAt,
  expiresAt: later,
  id: "preview-1",
  prospectId: "prospect-1",
  releaseId: "release-1",
  state: "shared",
  version: 1,
};

test("prospect represents an unknown website without fabricating a URL", () => {
  assert.equal(prospectSchema.parse(prospect).website.status, "unknown");
  assert.equal(
    prospectSchema.safeParse({
      ...prospect,
      website: {
        checkedAt: null,
        status: "unknown",
        value: "https://example.com",
      },
    }).success,
    false
  );
  assert.equal(
    prospectSchema.safeParse({
      ...prospect,
      website: { checkedAt: observedAt, status: "known", value: null },
    }).success,
    false
  );
});

test("evidence retains source URI, capture time and content digest", () => {
  assert.equal(evidenceSchema.parse(evidence).sha256.length, 64);
  assert.equal(
    evidenceSchema.safeParse({ ...evidence, uri: "not a URL" }).success,
    false
  );
  assert.equal(
    evidenceSchema.safeParse({ ...evidence, sha256: "" }).success,
    false
  );
});

test("observed claims require cited evidence, while unknown remains explicit", () => {
  const claim = {
    evidenceIds: ["evidence-1"],
    field: "serviceArea",
    id: "claim-1",
    kind: "observed",
    observedAt,
    prospectId: "prospect-1",
    unknownReason: null,
    value: "Twin Cities",
  };
  assert.equal(claimSchema.parse(claim).kind, "observed");
  assert.equal(
    claimSchema.safeParse({ ...claim, evidenceIds: [] }).success,
    false
  );
  assert.equal(
    claimSchema.parse({
      ...claim,
      evidenceIds: [],
      kind: "unknown",
      unknownReason: "No accessible source",
      value: null,
    }).kind,
    "unknown"
  );
  assert.equal(
    claimSchema.safeParse({ ...claim, kind: "unknown" }).success,
    false
  );
});

test("jobs have bounded attempts and explicit retry state", () => {
  const job = {
    attempt: 0,
    createdAt: observedAt,
    id: "job-1",
    maxAttempts: 3,
    prospectId: "prospect-1",
    state: "queued",
    type: "enrich",
    updatedAt: observedAt,
  };
  assert.equal(jobSchema.parse(job).maxAttempts, 3);
  assert.equal(jobSchema.safeParse({ ...job, attempt: 4 }).success, false);
});

test("approval decisions require actor identity and timestamp", () => {
  const approval = {
    createdAt: observedAt,
    decidedAt: null,
    decidedBy: null,
    id: "approval-1",
    prospectId: "prospect-1",
    state: "pending",
    subjectId: "draft-1",
    subjectType: "outreach",
  };
  assert.equal(approvalSchema.parse(approval).state, "pending");
  assert.equal(
    approvalSchema.safeParse({ ...approval, state: "approved" }).success,
    false
  );
  assert.equal(
    approvalSchema.parse({
      ...approval,
      decidedAt: observedAt,
      decidedBy: "owner-1",
      state: "approved",
    }).state,
    "approved"
  );
});

test("preview access is scoped to prospect, reviewer and unexpired release", () => {
  assert.equal(previewSchema.parse(sharedPreview).state, "shared");
  assert.equal(
    canAccessPreview(sharedPreview, {
      at: observedAt,
      prospectId: "prospect-1",
      viewerId: "reviewer-1",
    }),
    true
  );
  assert.equal(
    canAccessPreview(sharedPreview, {
      at: observedAt,
      prospectId: "prospect-1",
      viewerId: "reviewer-2",
    }),
    false
  );
  assert.equal(
    canAccessPreview(sharedPreview, {
      at: observedAt,
      prospectId: "prospect-2",
      viewerId: "reviewer-1",
    }),
    false
  );
  assert.equal(
    canAccessPreview(sharedPreview, {
      at: later,
      prospectId: "prospect-1",
      viewerId: "reviewer-1",
    }),
    false
  );
  assert.equal(
    canAccessPreview(
      { ...sharedPreview, state: "draft" },
      {
        at: observedAt,
        prospectId: "prospect-1",
        viewerId: "reviewer-1",
      }
    ),
    false
  );
});

test("annotations are associated with a specific preview and release", () => {
  const comment = {
    anchor: { kind: "element", target: "#hero-title" },
    authorId: "reviewer-1",
    body: "Please revise the heading",
    createdAt: observedAt,
    id: "comment-1",
    previewId: "preview-1",
    prospectId: "prospect-1",
    releaseId: "release-1",
  };
  assert.equal(commentSchema.parse(comment).releaseId, "release-1");
  assert.equal(
    commentSchema.safeParse({ ...comment, releaseId: "" }).success,
    false
  );
});

test("an outreach draft cannot be released without matching owner approval", () => {
  const draft = {
    body: "A draft for review.",
    createdAt: observedAt,
    id: "draft-1",
    prospectId: "prospect-1",
    recipient: "customer@example.com",
    state: "draft",
    subject: "Website concept",
  };
  const approval = {
    createdAt: observedAt,
    decidedAt: observedAt,
    decidedBy: "owner-1",
    id: "approval-1",
    prospectId: "prospect-1",
    state: "approved",
    subjectId: "draft-1",
    subjectType: "outreach",
  };
  assert.equal(draftSchema.parse(draft).state, "draft");
  assert.equal(
    canReleaseDraft(draft, {
      ...approval,
      decidedAt: null,
      decidedBy: null,
      state: "pending",
    }),
    false
  );
  assert.equal(
    canReleaseDraft(draft, { ...approval, subjectId: "draft-2" }),
    false
  );
  assert.equal(
    canReleaseDraft(draft, { ...approval, prospectId: "other" }),
    false
  );
  assert.equal(canReleaseDraft(draft, approval), true);
});
