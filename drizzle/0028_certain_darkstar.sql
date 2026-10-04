CREATE TABLE "guru_attendance_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"mabni_absensi_guru_id" integer NOT NULL,
	"guru_id" integer,
	"tanggal" date,
	"status" text,
	"jam_masuk" text,
	"sudah_izin" boolean,
	"keterangan" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guru_attendance_sync_program_id_mabni_absensi_guru_id_unique" UNIQUE("program_id","mabni_absensi_guru_id")
);
--> statement-breakpoint
ALTER TABLE "guru_attendance_sync" ADD CONSTRAINT "guru_attendance_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guru_attendance_program_guru_tgl_idx" ON "guru_attendance_sync" USING btree ("program_id","guru_id","tanggal");