CREATE TABLE "jadwal_change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"tilawah_halaqah_id" integer,
	"tilawah_jadwal_id" integer NOT NULL,
	"meeting_order" integer,
	"meeting_name" text,
	"schedule_date" date,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"old_label" text,
	"new_label" text,
	"affected_guru_id" integer,
	"affected_guru_name" text,
	"changed_at" timestamp with time zone NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"upstream_log_id" integer,
	"actor_user_id" integer,
	"actor_name" text,
	"guru_request_id" uuid,
	"dedupe_key" text NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jadwal_change_events" ADD CONSTRAINT "jadwal_change_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jadwal_change_events" ADD CONSTRAINT "jadwal_change_events_guru_request_id_guru_change_requests_id_fk" FOREIGN KEY ("guru_request_id") REFERENCES "public"."guru_change_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jce_dedupe_uk" ON "jadwal_change_events" USING btree ("program_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "jce_upstream_uk" ON "jadwal_change_events" USING btree ("program_id","upstream_log_id");--> statement-breakpoint
CREATE INDEX "jce_schedule_idx" ON "jadwal_change_events" USING btree ("program_id","schedule_date");--> statement-breakpoint
CREATE INDEX "jce_changed_idx" ON "jadwal_change_events" USING btree ("program_id","changed_at");--> statement-breakpoint
CREATE INDEX "jce_jadwal_idx" ON "jadwal_change_events" USING btree ("program_id","tilawah_jadwal_id");