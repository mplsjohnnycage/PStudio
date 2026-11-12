CREATE TABLE "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_session_id_ck" CHECK (length(id) BETWEEN 8 AND 160)
);
--> statement-breakpoint
CREATE TABLE "agent_ui_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"type" text NOT NULL,
	"view" text,
	"prospect_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_ui_events_type_ck" CHECK (type IN ('navigate','select_prospect')),
	CONSTRAINT "agent_ui_events_shape_ck" CHECK ((type = 'navigate' AND view IN ('map','inbox','calendar','studio') AND prospect_id IS NULL) OR (type = 'select_prospect' AND prospect_id IS NOT NULL AND view IS NULL))
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_ui_events" ADD CONSTRAINT "agent_ui_events_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_ui_events" ADD CONSTRAINT "agent_ui_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_sessions_workspace_user_idx" ON "agent_sessions" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "agent_ui_events_workspace_time_idx" ON "agent_ui_events" USING btree ("workspace_id","created_at");