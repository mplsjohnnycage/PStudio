CREATE TABLE "job_attempts" (
	"attempt" integer NOT NULL,
	"error_code" text,
	"evidence_id" text,
	"finished_at" timestamp with time zone,
	"job_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "job_attempts_pk" PRIMARY KEY("job_id","attempt"),
	CONSTRAINT "job_attempts_state_ck" CHECK (state IN ('running','completed','retrying','failed')),
	CONSTRAINT "job_attempts_attempt_ck" CHECK (attempt BETWEEN 1 AND 20),
	CONSTRAINT "job_attempts_error_code_ck" CHECK (error_code IS NULL OR (length(error_code) BETWEEN 1 AND 80))
);
--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attempts" ADD CONSTRAINT "job_attempts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_attempts_state_started_idx" ON "job_attempts" USING btree ("state","started_at");