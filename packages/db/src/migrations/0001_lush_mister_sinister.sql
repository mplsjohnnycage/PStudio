CREATE TABLE "workspace_memberships" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "workspace_memberships_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "membership_role_ck" CHECK ("workspace_memberships"."role" IN ('owner', 'operator', 'viewer'))
);
--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_user_workspace_idx" ON "workspace_memberships" USING btree ("user_id","workspace_id");