CREATE TABLE "guru_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"tilawah_halaqah_id" integer NOT NULL,
	"tilawah_jadwal_id" integer NOT NULL,
	"request_type" text NOT NULL,
	"requested_by_guru_id" integer,
	"requested_by_name" text,
	"requested_by_phone" text,
	"new_schedule_date" date,
	"new_start_at" text,
	"new_end_at" text,
	"new_guru_id" integer,
	"new_guru_name" text,
	"reason_text" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"coordinator_phone" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"applied_result" jsonb,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guru_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"tilawah_batch_id" integer,
	"tilawah_guru_id" integer NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guru_sync_program_id_tilawah_guru_id_unique" UNIQUE("program_id","tilawah_guru_id")
);
--> statement-breakpoint
ALTER TABLE "guru_change_requests" ADD CONSTRAINT "guru_change_requests_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_sync" ADD CONSTRAINT "guru_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gcr_status_idx" ON "guru_change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gcr_jadwal_idx" ON "guru_change_requests" USING btree ("program_id","tilawah_jadwal_id");--> statement-breakpoint
CREATE INDEX "guru_sync_program_name_idx" ON "guru_sync" USING btree ("program_id","name");