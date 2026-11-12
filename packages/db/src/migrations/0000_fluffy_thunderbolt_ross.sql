CREATE TABLE "approvals" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"subject_id" text NOT NULL,
	"subject_type" text NOT NULL,
	CONSTRAINT "approvals_subject_type_ck" CHECK ("approvals"."subject_type" IN ('preview','outreach','publish')),
	CONSTRAINT "approvals_state_ck" CHECK ("approvals"."state" IN ('pending','approved','rejected')),
	CONSTRAINT "approvals_decision_ck" CHECK (("approvals"."state" = 'pending' AND "approvals"."decided_by" IS NULL AND "approvals"."decided_at" IS NULL) OR ("approvals"."state" <> 'pending' AND "approvals"."decided_by" IS NOT NULL AND "approvals"."decided_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "claim_evidence" (
	"claim_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	CONSTRAINT "claim_evidence_claim_id_evidence_id_pk" PRIMARY KEY("claim_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"field" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"prospect_id" text NOT NULL,
	"unknown_reason" text,
	"value" text,
	CONSTRAINT "claims_prospect_id_uniq" UNIQUE("prospect_id","id"),
	CONSTRAINT "claims_kind_ck" CHECK ("claims"."kind" IN ('observed','reported','inferred','unknown')),
	CONSTRAINT "claims_unknown_consistency_ck" CHECK (("claims"."kind" = 'unknown' AND "claims"."value" IS NULL AND "claims"."unknown_reason" IS NOT NULL) OR ("claims"."kind" <> 'unknown' AND "claims"."value" IS NOT NULL AND "claims"."unknown_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"anchor_target" text,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"preview_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"release_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"captured_at" timestamp with time zone NOT NULL,
	"content_object_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"excerpt" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"sha256" text NOT NULL,
	"source_uri" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "evidence_prospect_id_uniq" UNIQUE("prospect_id","id"),
	CONSTRAINT "evidence_sha256_ck" CHECK (length("evidence"."sha256") = 64 AND "evidence"."sha256" ~ '^[a-f0-9]+$')
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"attempt" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"prospect_id" text NOT NULL,
	"started_at" timestamp with time zone,
	"state" text DEFAULT 'queued' NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_attempts_ck" CHECK ("jobs"."attempt" >= 0 AND "jobs"."max_attempts" BETWEEN 1 AND 20 AND "jobs"."attempt" <= "jobs"."max_attempts")
);
--> statement-breakpoint
CREATE TABLE "outreach_drafts" (
	"approval_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"recipient" text NOT NULL,
	"sent_at" timestamp with time zone,
	"state" text DEFAULT 'draft' NOT NULL,
	"subject" text NOT NULL,
	CONSTRAINT "outreach_drafts_state_ck" CHECK ("outreach_drafts"."state" IN ('draft','ready','sent'))
);
--> statement-breakpoint
CREATE TABLE "preview_viewers" (
	"preview_id" text NOT NULL,
	"viewer_id" text NOT NULL,
	CONSTRAINT "preview_viewers_preview_id_viewer_id_pk" PRIMARY KEY("preview_id","viewer_id")
);
--> statement-breakpoint
CREATE TABLE "previews" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"release_id" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	CONSTRAINT "previews_prospect_preview_release_uniq" UNIQUE("prospect_id","id","release_id")
);
--> statement-breakpoint
CREATE TABLE "prospect_external_ids" (
	"external_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"provider" text NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "prospect_external_ids_workspace_id_provider_external_id_pk" PRIMARY KEY("workspace_id","provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone_status" text DEFAULT 'unknown' NOT NULL,
	"phone_value" text,
	"physical_address" text,
	"stage" text DEFAULT 'discovered' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"website_status" text DEFAULT 'unknown' NOT NULL,
	"website_url" text,
	"workspace_id" text NOT NULL,
	CONSTRAINT "prospects_workspace_id_uniq" UNIQUE("workspace_id","id"),
	CONSTRAINT "prospects_website_status_ck" CHECK (("prospects"."website_status" = 'unknown' AND "prospects"."website_url" IS NULL) OR ("prospects"."website_status" = 'known' AND "prospects"."website_url" IS NOT NULL)),
	CONSTRAINT "prospects_phone_status_ck" CHECK (("prospects"."phone_status" = 'unknown' AND "prospects"."phone_value" IS NULL) OR ("prospects"."phone_status" = 'known' AND "prospects"."phone_value" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"artifact_object_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"prospect_id" text NOT NULL,
	"status" text DEFAULT 'building' NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "releases_prospect_id_uniq" UNIQUE("prospect_id","id"),
	CONSTRAINT "release_version_positive_ck" CHECK ("releases"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_prospect_id_claim_id_claims_prospect_id_id_fk" FOREIGN KEY ("prospect_id","claim_id") REFERENCES "public"."claims"("prospect_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_prospect_id_evidence_id_evidence_prospect_id_id_fk" FOREIGN KEY ("prospect_id","evidence_id") REFERENCES "public"."evidence"("prospect_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_prospect_id_preview_id_release_id_previews_prospect_id_id_release_id_fk" FOREIGN KEY ("prospect_id","preview_id","release_id") REFERENCES "public"."previews"("prospect_id","id","release_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_prospect_id_release_id_releases_prospect_id_id_fk" FOREIGN KEY ("prospect_id","release_id") REFERENCES "public"."releases"("prospect_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_viewers" ADD CONSTRAINT "preview_viewers_preview_id_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."previews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "previews" ADD CONSTRAINT "previews_prospect_id_release_id_releases_prospect_id_id_fk" FOREIGN KEY ("prospect_id","release_id") REFERENCES "public"."releases"("prospect_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_external_ids" ADD CONSTRAINT "prospect_external_ids_workspace_id_prospect_id_prospects_workspace_id_id_fk" FOREIGN KEY ("workspace_id","prospect_id") REFERENCES "public"."prospects"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_prospect_subject_idx" ON "approvals" USING btree ("prospect_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "claims_prospect_field_idx" ON "claims" USING btree ("prospect_id","field");--> statement-breakpoint
CREATE INDEX "comments_preview_created_idx" ON "comments" USING btree ("preview_id","created_at");--> statement-breakpoint
CREATE INDEX "evidence_prospect_capture_idx" ON "evidence" USING btree ("prospect_id","captured_at");--> statement-breakpoint
CREATE INDEX "jobs_prospect_state_idx" ON "jobs" USING btree ("prospect_id","state");--> statement-breakpoint
CREATE INDEX "outreach_drafts_prospect_state_idx" ON "outreach_drafts" USING btree ("prospect_id","state");--> statement-breakpoint
CREATE INDEX "previews_prospect_expiry_idx" ON "previews" USING btree ("prospect_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_external_identity_uniq" ON "prospect_external_ids" USING btree ("prospect_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "prospects_workspace_stage_idx" ON "prospects" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_prospect_version_uniq" ON "releases" USING btree ("prospect_id","version");