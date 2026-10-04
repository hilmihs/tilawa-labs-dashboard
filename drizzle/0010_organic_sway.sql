CREATE TABLE "teacher_meeting_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"tilawah_halaqah_id" integer NOT NULL,
	"tilawah_jadwal_id" integer NOT NULL,
	"guru_id" integer,
	"meeting_order" integer,
	"schedule_date" date,
	"status" text NOT NULL,
	"reason_code" text,
	"reason_text" text,
	"confirmed_by_phone" text,
	"source" text DEFAULT 'wa_magiclink' NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_meeting_confirmations_program_id_tilawah_jadwal_id_unique" UNIQUE("program_id","tilawah_jadwal_id")
);
--> statement-breakpoint
ALTER TABLE "teacher_meeting_confirmations" ADD CONSTRAINT "teacher_meeting_confirmations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tmc_program_schedule_idx" ON "teacher_meeting_confirmations" USING btree ("program_id","schedule_date");