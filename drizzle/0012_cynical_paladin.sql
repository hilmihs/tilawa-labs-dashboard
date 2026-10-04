CREATE TABLE "hkm_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"cumulative_pages" numeric,
	"cumulative_juz" numeric,
	"total_khatam" integer,
	"target_pages" numeric,
	"category" text,
	"streak_days" integer,
	"last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hkm_daily_snapshots_program_id_participant_id_snapshot_date_unique" UNIQUE("program_id","participant_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "hkm_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"nama_peserta" text NOT NULL,
	"nama_pengajar" text,
	"nama_halaqah" text,
	"hkm" text,
	"gender" text,
	"username_nafi" text,
	"email_master" text,
	"status_email" text,
	"match_method" text,
	"confidence" numeric,
	"berkah_user_id" integer,
	"is_curated" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hkm_participants_program_id_email_master_unique" UNIQUE("program_id","email_master")
);
--> statement-breakpoint
CREATE TABLE "hkm_reading_history_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"berkah_user_id" integer NOT NULL,
	"berkah_history_id" integer,
	"target_khatam_ke" integer,
	"history_date" date NOT NULL,
	"email" text,
	"from_sura" integer,
	"to_sura" integer,
	"from_ayah" integer,
	"to_ayah" integer,
	"from_juz" numeric,
	"to_juz" numeric,
	"from_page" integer,
	"to_page" integer,
	"total_pages" integer,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hkm_reading_history_sync_program_id_berkah_user_id_history_date_unique" UNIQUE("program_id","berkah_user_id","history_date")
);
--> statement-breakpoint
CREATE TABLE "hkm_targets_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"berkah_target_id" integer NOT NULL,
	"berkah_user_id" integer,
	"target_type" text,
	"target_date" date,
	"target_per_day" numeric,
	"target_total" numeric,
	"target_done" numeric,
	"target_remaining" numeric,
	"status_label" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hkm_targets_sync_program_id_berkah_target_id_unique" UNIQUE("program_id","berkah_target_id")
);
--> statement-breakpoint
CREATE TABLE "hkm_users_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"berkah_user_id" integer NOT NULL,
	"uuid" text,
	"name" text,
	"email" text,
	"phone" text,
	"gender" integer,
	"is_internal" boolean,
	"progress_khatam" numeric,
	"total_khatam" integer,
	"last_read_at" timestamp with time zone,
	"business_unit_id" integer,
	"business_unit" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hkm_users_sync_program_id_berkah_user_id_unique" UNIQUE("program_id","berkah_user_id")
);
--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "berkah_business_unit_id" integer;--> statement-breakpoint
ALTER TABLE "hkm_daily_snapshots" ADD CONSTRAINT "hkm_daily_snapshots_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkm_daily_snapshots" ADD CONSTRAINT "hkm_daily_snapshots_participant_id_hkm_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."hkm_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkm_participants" ADD CONSTRAINT "hkm_participants_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkm_reading_history_sync" ADD CONSTRAINT "hkm_reading_history_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkm_targets_sync" ADD CONSTRAINT "hkm_targets_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkm_users_sync" ADD CONSTRAINT "hkm_users_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hkm_snapshots_program_date_idx" ON "hkm_daily_snapshots" USING btree ("program_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "hkm_participants_berkah_user_idx" ON "hkm_participants" USING btree ("program_id","berkah_user_id");--> statement-breakpoint
CREATE INDEX "hkm_history_user_date_idx" ON "hkm_reading_history_sync" USING btree ("program_id","berkah_user_id","history_date");--> statement-breakpoint
CREATE INDEX "hkm_history_email_idx" ON "hkm_reading_history_sync" USING btree ("program_id","email");