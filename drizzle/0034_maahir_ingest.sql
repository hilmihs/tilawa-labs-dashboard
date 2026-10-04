-- The Maahir ingest tables, which no database built by `drizzle-kit migrate`
-- has ever had.
--
-- 0029_maahir_ingest.sql was written but never registered in _journal.json, and
-- the journal's idx 29 went to an unrelated migration. An unregistered file is
-- invisible to migrate, so these two tables only exist where `db:push` was run
-- against schema.ts — the development machine. Anywhere else the Maahir
-- dashboard answers 500 with `relation "maahir_sync_state" does not exist`.
--
-- Same shape as the orphan, written to be safe to run twice so the machine that
-- was pushed rather than migrated stays valid.
CREATE TABLE IF NOT EXISTS "maahir_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"maahir_id" text NOT NULL,
	"updated_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maahir_sync_program_id_entity_maahir_id_unique" UNIQUE("program_id","entity","maahir_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maahir_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"etag" text,
	"high_water_updated_at" timestamp with time zone,
	"forbidden" boolean DEFAULT false NOT NULL,
	"last_full_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maahir_sync_state_program_id_entity_unique" UNIQUE("program_id","entity")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "maahir_sync" ADD CONSTRAINT "maahir_sync_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "maahir_sync_state" ADD CONSTRAINT "maahir_sync_state_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maahir_sync_program_entity_idx" ON "maahir_sync" USING btree ("program_id","entity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maahir_sync_program_entity_updated_idx" ON "maahir_sync" USING btree ("program_id","entity","updated_at");
