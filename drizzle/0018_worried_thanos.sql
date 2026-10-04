CREATE TABLE "mabni_hafalan_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"mabni_hafalan_id" integer NOT NULL,
	"siswa_id" integer,
	"sesi_id" integer,
	"sesi_tanggal" date,
	"metrik_id" integer,
	"metrik" text,
	"surat" text,
	"status" text,
	"keterangan" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mabni_hafalan_sync_program_id_mabni_hafalan_id_unique" UNIQUE("program_id","mabni_hafalan_id")
);
--> statement-breakpoint
ALTER TABLE "mabni_hafalan_sync" ADD CONSTRAINT "mabni_hafalan_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mabni_hafalan_program_siswa_idx" ON "mabni_hafalan_sync" USING btree ("program_id","siswa_id");--> statement-breakpoint
CREATE INDEX "mabni_hafalan_program_tanggal_idx" ON "mabni_hafalan_sync" USING btree ("program_id","sesi_tanggal");