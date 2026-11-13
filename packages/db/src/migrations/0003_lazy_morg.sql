CREATE TABLE "release_artifacts" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"html" text NOT NULL,
	"prospect_id" text NOT NULL,
	"release_id" text PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	CONSTRAINT "release_artifacts_sha256_ck" CHECK (length("release_artifacts"."sha256") = 64 AND "release_artifacts"."sha256" ~ '^[a-f0-9]+$')
);
--> statement-breakpoint
ALTER TABLE "release_artifacts" ADD CONSTRAINT "release_artifacts_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artifacts" ADD CONSTRAINT "release_artifacts_prospect_id_release_id_releases_prospect_id_id_fk" FOREIGN KEY ("prospect_id","release_id") REFERENCES "public"."releases"("prospect_id","id") ON DELETE restrict ON UPDATE no action;