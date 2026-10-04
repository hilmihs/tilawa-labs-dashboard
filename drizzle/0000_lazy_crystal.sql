CREATE TABLE "attendance_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"tilawah_presensi_id" integer NOT NULL,
	"halaqah_user_id" integer,
	"halaqah_jadwal_id" integer,
	"status" text,
	"notes" text,
	"lahn_jaliy" text,
	"lahn_khofiy" text,
	"task_submission_date" date,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_sync_program_id_tilawah_presensi_id_unique" UNIQUE("program_id","tilawah_presensi_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"period_type" text NOT NULL,
	"pct_70" numeric DEFAULT '70' NOT NULL,
	"pct_30" numeric DEFAULT '30' NOT NULL,
	"pct_15" numeric DEFAULT '15' NOT NULL,
	"hbe_source" text,
	"notes" text,
	CONSTRAINT "attendance_thresholds_program_id_period_type_unique" UNIQUE("program_id","period_type")
);
--> statement-breakpoint
CREATE TABLE "halaqah_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"tilawah_halaqah_id" integer NOT NULL,
	"tilawah_batch_id" integer,
	"name" text,
	"type" text,
	"day" text,
	"session" text,
	"level" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "halaqah_sync_program_id_tilawah_halaqah_id_unique" UNIQUE("program_id","tilawah_halaqah_id")
);
--> statement-breakpoint
CREATE TABLE "jadwal_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"tilawah_halaqah_id" integer NOT NULL,
	"tilawah_jadwal_id" integer NOT NULL,
	"name" text,
	"order" integer,
	"schedule_date" date,
	"status" integer,
	"status_label" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jadwal_sync_program_id_tilawah_jadwal_id_unique" UNIQUE("program_id","tilawah_jadwal_id")
);
--> statement-breakpoint
CREATE TABLE "late_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"occurred_at" date NOT NULL,
	"day_name" text,
	"marhalah" text NOT NULL,
	"arrival_time" time,
	"perizinan" text NOT NULL,
	"alasan" text,
	"keterangan" text,
	"sp_required" boolean DEFAULT false NOT NULL,
	"sp_generated_at" timestamp with time zone,
	"reported_by_role" text DEFAULT 'guru_piket' NOT NULL,
	"reported_by_user_id" uuid,
	"tilawah_presensi_synced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text DEFAULT 'kirimi_wa' NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kirimi_message_id" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"data_source_type" text NOT NULL,
	"tilawah_program_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"father_name" text,
	"mother_name" text,
	"birth_date" date,
	"marhalah" text,
	"tilawah_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"tilawah_user_id" integer NOT NULL,
	"halaqah_user_id" integer,
	"name" text,
	"user_code" text,
	"phone" text,
	"halaqah_id" integer,
	"pengajar" text,
	"pertemuan" text,
	"kehadiran_percentage" numeric,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_sync_program_id_tilawah_user_id_unique" UNIQUE("program_id","tilawah_user_id")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid,
	"run_type" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warning_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"late_incident_id" uuid,
	"student_id" uuid NOT NULL,
	"pdf_path" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_sync" ADD CONSTRAINT "attendance_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_thresholds" ADD CONSTRAINT "attendance_thresholds_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "halaqah_sync" ADD CONSTRAINT "halaqah_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jadwal_sync" ADD CONSTRAINT "jadwal_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_incidents" ADD CONSTRAINT "late_incidents_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_incidents" ADD CONSTRAINT "late_incidents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students_sync" ADD CONSTRAINT "students_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_late_incident_id_late_incidents_id_fk" FOREIGN KEY ("late_incident_id") REFERENCES "public"."late_incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warning_letters" ADD CONSTRAINT "warning_letters_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jadwal_sync_halaqah_date_idx" ON "jadwal_sync" USING btree ("tilawah_halaqah_id","schedule_date");--> statement-breakpoint
CREATE INDEX "late_incidents_student_id_idx" ON "late_incidents" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "late_incidents_occurred_at_idx" ON "late_incidents" USING btree ("occurred_at");