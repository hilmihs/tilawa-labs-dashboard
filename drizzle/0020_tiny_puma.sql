ALTER TABLE "hkm_participants" ADD COLUMN "status" text DEFAULT 'aktif' NOT NULL;--> statement-breakpoint
ALTER TABLE "hkm_participants" ADD COLUMN "status_note" text;--> statement-breakpoint
ALTER TABLE "hkm_participants" ADD COLUMN "status_changed_at" timestamp with time zone;