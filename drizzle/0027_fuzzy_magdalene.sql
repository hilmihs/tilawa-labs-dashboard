ALTER TABLE "recap_attestations" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recap_attestations" ADD COLUMN "resolved_by" text;