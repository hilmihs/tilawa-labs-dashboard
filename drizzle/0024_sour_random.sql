CREATE TABLE "recap_confirmation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guru_id" integer NOT NULL,
	"guru_name" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"note" text NOT NULL,
	"confirmed_by_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "recap_notes_guru_period_idx" ON "recap_confirmation_notes" USING btree ("guru_id","period_start");