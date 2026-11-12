CREATE TABLE "job_outbox" (
	"claim_token" text,
	"claimed_until" timestamp with time zone,
	"command" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"job_id" text NOT NULL,
	"max_deliveries" integer DEFAULT 10 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_outbox_job_key_uniq" UNIQUE("job_id","idempotency_key"),
	CONSTRAINT "job_outbox_state_ck" CHECK ("job_outbox"."state" IN ('pending', 'claimed', 'delivered', 'dead')),
	CONSTRAINT "job_outbox_command_ck" CHECK (jsonb_typeof("job_outbox"."command") = 'object'),
	CONSTRAINT "job_outbox_attempts_ck" CHECK ("job_outbox"."delivery_attempts" >= 0 AND "job_outbox"."max_deliveries" BETWEEN 1 AND 20 AND "job_outbox"."delivery_attempts" <= "job_outbox"."max_deliveries"),
	CONSTRAINT "job_outbox_claim_ck" CHECK (("job_outbox"."state" = 'claimed' AND "job_outbox"."claim_token" IS NOT NULL AND "job_outbox"."claimed_until" IS NOT NULL) OR ("job_outbox"."state" <> 'claimed' AND "job_outbox"."claim_token" IS NULL AND "job_outbox"."claimed_until" IS NULL)),
	CONSTRAINT "job_outbox_delivery_ck" CHECK (("job_outbox"."state" = 'delivered' AND "job_outbox"."delivered_at" IS NOT NULL) OR ("job_outbox"."state" <> 'delivered' AND "job_outbox"."delivered_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "job_outbox" ADD CONSTRAINT "job_outbox_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_outbox_due_idx" ON "job_outbox" USING btree ("state","next_attempt_at","created_at");