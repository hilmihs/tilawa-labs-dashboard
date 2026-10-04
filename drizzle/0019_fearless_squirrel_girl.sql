CREATE TABLE "mabni_nilai_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"mabni_nilai_id" integer NOT NULL,
	"siswa_id" integer,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mabni_nilai_sync_program_id_mabni_nilai_id_unique" UNIQUE("program_id","mabni_nilai_id")
);
--> statement-breakpoint
ALTER TABLE "mabni_nilai_sync" ADD CONSTRAINT "mabni_nilai_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mabni_nilai_program_siswa_idx" ON "mabni_nilai_sync" USING btree ("program_id","siswa_id");