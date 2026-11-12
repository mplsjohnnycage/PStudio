import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Prospect Studio's standalone Lakebase schema (proposed, not deployed).
 * Workspace authorization and immutable evidence/release write rules must
 * be enforced in authenticated service code before any live integration.
 */
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const workspaces = pgTable("workspaces", {
  createdAt: createdAt(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

/** Users are issued by Neon Auth; this table only grants workspace roles. */
export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    createdAt: createdAt(),
    role: text("role").notNull().default("viewer"),
    userId: text("user_id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("membership_user_workspace_idx").on(t.userId, t.workspaceId),
    check(
      "membership_role_ck",
      sql`${t.role} IN ('owner', 'operator', 'viewer')`
    ),
  ]
);

export const prospects = pgTable(
  "prospects",
  {
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phoneStatus: text("phone_status").notNull().default("unknown"),
    phoneValue: text("phone_value"),
    physicalAddress: text("physical_address"),
    stage: text("stage").notNull().default("discovered"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    websiteStatus: text("website_status").notNull().default("unknown"),
    websiteUrl: text("website_url"),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("prospects_workspace_stage_idx").on(t.workspaceId, t.stage),
    unique("prospects_workspace_id_uniq").on(t.workspaceId, t.id),
    check(
      "prospects_website_status_ck",
      sql`(${t.websiteStatus} = 'unknown' AND ${t.websiteUrl} IS NULL) OR (${t.websiteStatus} = 'known' AND ${t.websiteUrl} IS NOT NULL)`
    ),
    check(
      "prospects_phone_status_ck",
      sql`(${t.phoneStatus} = 'unknown' AND ${t.phoneValue} IS NULL) OR (${t.phoneStatus} = 'known' AND ${t.phoneValue} IS NOT NULL)`
    ),
  ]
);

export const prospectExternalIds = pgTable(
  "prospect_external_ids",
  {
    externalId: text("external_id").notNull(),
    prospectId: text("prospect_id").notNull(),
    provider: text("provider").notNull(),
    workspaceId: text("workspace_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.provider, t.externalId] }),
    foreignKey({
      columns: [t.workspaceId, t.prospectId],
      foreignColumns: [prospects.workspaceId, prospects.id],
    }).onDelete("restrict"),
    uniqueIndex("prospect_external_identity_uniq").on(
      t.prospectId,
      t.provider,
      t.externalId
    ),
  ]
);

export const evidence = pgTable(
  "evidence",
  {
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    contentObjectKey: text("content_object_key"),
    createdAt: createdAt(),
    excerpt: text("excerpt").notNull(),
    id: text("id").primaryKey(),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "restrict" }),
    sha256: text("sha256").notNull(),
    sourceUri: text("source_uri").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull(),
  },
  (t) => [
    unique("evidence_prospect_id_uniq").on(t.prospectId, t.id),
    index("evidence_prospect_capture_idx").on(t.prospectId, t.capturedAt),
    check(
      "evidence_sha256_ck",
      sql`length(${t.sha256}) = 64 AND ${t.sha256} ~ '^[a-f0-9]+$'`
    ),
  ]
);

export const claims = pgTable(
  "claims",
  {
    createdAt: createdAt(),
    field: text("field").notNull(),
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "restrict" }),
    unknownReason: text("unknown_reason"),
    value: text("value"),
  },
  (t) => [
    unique("claims_prospect_id_uniq").on(t.prospectId, t.id),
    index("claims_prospect_field_idx").on(t.prospectId, t.field),
    check(
      "claims_kind_ck",
      sql`${t.kind} IN ('observed','reported','inferred','unknown')`
    ),
    check(
      "claims_unknown_consistency_ck",
      sql`(${t.kind} = 'unknown' AND ${t.value} IS NULL AND ${t.unknownReason} IS NOT NULL) OR (${t.kind} <> 'unknown' AND ${t.value} IS NOT NULL AND ${t.unknownReason} IS NULL)`
    ),
  ]
);

export const claimEvidence = pgTable(
  "claim_evidence",
  {
    claimId: text("claim_id").notNull(),
    evidenceId: text("evidence_id").notNull(),
    prospectId: text("prospect_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.claimId, t.evidenceId] }),
    foreignKey({
      columns: [t.prospectId, t.claimId],
      foreignColumns: [claims.prospectId, claims.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.prospectId, t.evidenceId],
      foreignColumns: [evidence.prospectId, evidence.id],
    }).onDelete("restrict"),
  ]
);

export const jobs = pgTable(
  "jobs",
  {
    attempt: integer("attempt").notNull().default(0),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    maxAttempts: integer("max_attempts").notNull().default(3),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    state: text("state").notNull().default("queued"),
    type: text("type").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("jobs_prospect_state_idx").on(t.prospectId, t.state),
    check(
      "jobs_attempts_ck",
      sql`${t.attempt} >= 0 AND ${t.maxAttempts} BETWEEN 1 AND 20 AND ${t.attempt} <= ${t.maxAttempts}`
    ),
  ]
);

/** Persisted execution attempts and safe failure codes; no credentials or raw error traces. */
export const jobAttempts = pgTable(
  "job_attempts",
  {
    attempt: integer("attempt").notNull(),
    errorCode: text("error_code"),
    evidenceId: text("evidence_id").references(() => evidence.id, {
      onDelete: "restrict",
    }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    state: text("state").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.attempt], name: "job_attempts_pk" }),
    index("job_attempts_state_started_idx").on(t.state, t.startedAt),
    check(
      "job_attempts_state_ck",
      sql.raw("state IN ('running','completed','retrying','failed')")
    ),
    check("job_attempts_attempt_ck", sql.raw("attempt BETWEEN 1 AND 20")),
    check(
      "job_attempts_error_code_ck",
      sql.raw("error_code IS NULL OR (length(error_code) BETWEEN 1 AND 80)")
    ),
  ]
);

/** Transactional delivery queue; only authenticated server code may enqueue. */
export const jobOutbox = pgTable(
  "job_outbox",
  {
    claimedUntil: timestamp("claimed_until", { withTimezone: true }),
    claimToken: text("claim_token"),
    command: jsonb("command").notNull(),
    createdAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveryAttempts: integer("delivery_attempts").notNull().default(0),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    maxDeliveries: integer("max_deliveries").notNull().default(10),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    state: text("state").notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("job_outbox_job_key_uniq").on(t.jobId, t.idempotencyKey),
    index("job_outbox_due_idx").on(t.state, t.nextAttemptAt, t.createdAt),
    check(
      "job_outbox_state_ck",
      sql`${t.state} IN ('pending', 'claimed', 'delivered', 'dead')`
    ),
    check("job_outbox_command_ck", sql`jsonb_typeof(${t.command}) = 'object'`),
    check(
      "job_outbox_attempts_ck",
      sql`${t.deliveryAttempts} >= 0 AND ${t.maxDeliveries} BETWEEN 1 AND 20 AND ${t.deliveryAttempts} <= ${t.maxDeliveries}`
    ),
    check(
      "job_outbox_claim_ck",
      sql`(${t.state} = 'claimed' AND ${t.claimToken} IS NOT NULL AND ${t.claimedUntil} IS NOT NULL) OR (${t.state} <> 'claimed' AND ${t.claimToken} IS NULL AND ${t.claimedUntil} IS NULL)`
    ),
    check(
      "job_outbox_delivery_ck",
      sql`(${t.state} = 'delivered' AND ${t.deliveredAt} IS NOT NULL) OR (${t.state} <> 'delivered' AND ${t.deliveredAt} IS NULL)`
    ),
  ]
);

export const releases = pgTable(
  "releases",
  {
    artifactObjectKey: text("artifact_object_key"),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("building"),
    version: integer("version").notNull(),
  },
  (t) => [
    uniqueIndex("releases_prospect_version_uniq").on(t.prospectId, t.version),
    unique("releases_prospect_id_uniq").on(t.prospectId, t.id),
    check("release_version_positive_ck", sql`${t.version} > 0`),
  ]
);

/** Immutable private HTML snapshots; object storage may replace the bytes later. */
export const releaseArtifacts = pgTable(
  "release_artifacts",
  {
    createdAt: createdAt(),
    html: text("html").notNull(),
    prospectId: text("prospect_id").notNull(),
    releaseId: text("release_id")
      .primaryKey()
      .references(() => releases.id, { onDelete: "restrict" }),
    sha256: text("sha256").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.prospectId, t.releaseId],
      foreignColumns: [releases.prospectId, releases.id],
    }).onDelete("restrict"),
    check(
      "release_artifacts_sha256_ck",
      sql`length(${t.sha256}) = 64 AND ${t.sha256} ~ '^[a-f0-9]+$'`
    ),
  ]
);

export const previews = pgTable(
  "previews",
  {
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    prospectId: text("prospect_id").notNull(),
    releaseId: text("release_id").notNull(),
    state: text("state").notNull().default("draft"),
  },
  (t) => [
    foreignKey({
      columns: [t.prospectId, t.releaseId],
      foreignColumns: [releases.prospectId, releases.id],
    }).onDelete("restrict"),
    unique("previews_prospect_preview_release_uniq").on(
      t.prospectId,
      t.id,
      t.releaseId
    ),
    index("previews_prospect_expiry_idx").on(t.prospectId, t.expiresAt),
  ]
);

export const previewViewers = pgTable(
  "preview_viewers",
  {
    previewId: text("preview_id")
      .notNull()
      .references(() => previews.id, { onDelete: "restrict" }),
    viewerId: text("viewer_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.previewId, t.viewerId] })]
);

export const comments = pgTable(
  "comments",
  {
    anchorTarget: text("anchor_target"),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    previewId: text("preview_id").notNull(),
    prospectId: text("prospect_id").notNull(),
    releaseId: text("release_id").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.prospectId, t.previewId, t.releaseId],
      foreignColumns: [previews.prospectId, previews.id, previews.releaseId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.prospectId, t.releaseId],
      foreignColumns: [releases.prospectId, releases.id],
    }).onDelete("restrict"),
    index("comments_preview_created_idx").on(t.previewId, t.createdAt),
  ]
);

export const approvals = pgTable(
  "approvals",
  {
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    id: text("id").primaryKey(),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "restrict" }),
    state: text("state").notNull().default("pending"),
    subjectId: text("subject_id").notNull(),
    subjectType: text("subject_type").notNull(),
  },
  (t) => [
    index("approvals_prospect_subject_idx").on(
      t.prospectId,
      t.subjectType,
      t.subjectId
    ),
    check(
      "approvals_subject_type_ck",
      sql`${t.subjectType} IN ('preview','outreach','publish')`
    ),
    check(
      "approvals_state_ck",
      sql`${t.state} IN ('pending','approved','rejected')`
    ),
    check(
      "approvals_decision_ck",
      sql`(${t.state} = 'pending' AND ${t.decidedBy} IS NULL AND ${t.decidedAt} IS NULL) OR (${t.state} <> 'pending' AND ${t.decidedBy} IS NOT NULL AND ${t.decidedAt} IS NOT NULL)`
    ),
  ]
);

export const outreachDrafts = pgTable(
  "outreach_drafts",
  {
    approvalId: text("approval_id").references(() => approvals.id, {
      onDelete: "restrict",
    }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    prospectId: text("prospect_id")
      .notNull()
      .references(() => prospects.id, { onDelete: "restrict" }),
    recipient: text("recipient").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    state: text("state").notNull().default("draft"),
    subject: text("subject").notNull(),
  },
  (t) => [
    index("outreach_drafts_prospect_state_idx").on(t.prospectId, t.state),
    check(
      "outreach_drafts_state_ck",
      sql`${t.state} IN ('draft','ready','sent')`
    ),
  ]
);
