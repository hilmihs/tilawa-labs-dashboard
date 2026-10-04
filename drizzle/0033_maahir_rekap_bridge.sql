-- Repeat of 0031, written to be safe to run twice.
--
-- The deployed box runs a second migration lineage whose newest entry is stamped
-- 4 Sep 2026 06.27, while 0031 (this table) is stamped 3 Sep 15.01. Drizzle only
-- applies migrations stamped LATER than the last one recorded, so on that box
-- 0031 is skipped — silently, with "migrations applied successfully" and no
-- maahir_rekap. The failure surfaces later, as a 500 the first time anyone opens
-- a Maahir page.
--
-- This entry carries a stamp newer than both lineages, so it runs there. On a
-- database that already took 0031 every statement is a no-op.
CREATE TABLE IF NOT EXISTS "maahir_rekap" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"route" text NOT NULL,
	"periode" text NOT NULL,
	"params_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maahir_rekap_program_id_route_periode_params_key_unique" UNIQUE("program_id","route","periode","params_key")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "maahir_rekap" ADD CONSTRAINT "maahir_rekap_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maahir_rekap_program_route_periode_idx" ON "maahir_rekap" USING btree ("program_id","route","periode");
