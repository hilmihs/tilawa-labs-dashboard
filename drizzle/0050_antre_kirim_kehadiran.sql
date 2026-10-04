ALTER TABLE "tap_arti" ADD COLUMN "sasaran" text;--> statement-breakpoint
ALTER TABLE "tap_arti" ADD COLUMN "ref" jsonb;--> statement-breakpoint
ALTER TABLE "tap_arti" ADD COLUMN "kirim_setelah" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tap_arti" ADD COLUMN "percobaan" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tap_arti" ADD COLUMN "terkirim_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tap_arti" ADD COLUMN "pesan_kirim" text;--> statement-breakpoint
CREATE INDEX "tap_arti_antre_idx" ON "tap_arti" USING btree ("sasaran","status","kirim_setelah");--> statement-breakpoint
-- Baris dari versi pertama scan terpadu (sebelum antrean kirim ada) tidak punya sasaran: jangan tampil menunggu selamanya.
UPDATE "tap_arti" SET "status" = 'tercatat' WHERE "status" = 'menunggu_sinkron' AND "sasaran" IS NULL;
