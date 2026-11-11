# Prospect Studio domain contracts (v1)

## What is implemented

- `packages/api/src/contracts.ts` declares Zod schemas for prospects, sourced evidence, attributed claims, jobs, decisions, scoped preview releases, release-specific comments and outreach drafts.
- Unknown website/phone values are explicit nulls with `status: unknown`; they cannot silently become fabricated values.
- Captured evidence identifies its prospect, source URI, capture timestamp and SHA-256 content fingerprint.
- Every non-unknown claim must identify supporting evidence. Unknown claims must retain an explicit reason and null value.
- Jobs have bounded attempts, and approvals must retain actor identity and decision time.
- `canAccessPreview` and `canReleaseDraft` are deny-by-default **pure model policy checks**; tests verify cross-prospect, reviewer and expiry denial, and unmatched/pending approval denial.
- The tests run with Node's built-in test runner from `npm run test` and are part of the CI matrix.

## Critical boundaries still to implement

These TypeScript objects are wire contracts, **not** tenant authorization or proof that a website claim is true. Before enabling production writes, a Hono/oRPC service must bind tenant identity to a verified authenticated principal; resolve each evidence ID against the same prospect; verify approval signer role and current revocation status; prevent release version mutation; and enforce the preview and mail checks at service boundaries. Persist audit and transition history transactionally in the selected authoritative database.

No Neon instance was provisioned, no Drizzle migrations executed, no Rivet/agentOS or R2 services started, no source pages fetched, no generated website preview was published, and no outbound mail was sent. The fixture tests do not certify those external integrations.

## Contract ownership

- `prospect.id`: stable internal ID; `externalIds` retains provider identities (Overture et al.).
- `evidence.id`: a captured source record, with content hash, source URI and capture time. Its contents are immutable after capture.
- `claim.evidenceIds`: refer to immutable evidence records; unknown claims have a reason instead.
- `approval.subjectId`: exact preview, publish release or outreach draft under decision; never reuse approval across subjects.
- `preview.releaseId` and `comment.releaseId`: reference one immutable build release so annotations do not drift across versions.
- All timestamps are offset-aware ISO 8601. Source freshness is evaluated using the original capture time, not ingestion time.

Contract version: `1`. Database constraints, API enforcement, feature-complete validation of additional provider-specific fields and release-version migration must be designed and tested before live use.
