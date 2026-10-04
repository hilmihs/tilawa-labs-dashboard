ALTER TABLE "kantor_izin" ALTER COLUMN "status" SET DEFAULT 'dikabarkan';--> statement-breakpoint
ALTER TABLE "kantor" ADD COLUMN "masul_nama" text;--> statement-breakpoint
ALTER TABLE "kantor" ADD COLUMN "masul_wa" text;--> statement-breakpoint
ALTER TABLE "kantor_absen" ADD COLUMN "dicatat_oleh" text;--> statement-breakpoint
ALTER TABLE "kantor_petugas" ADD COLUMN "jam_masuk" text DEFAULT '08:00' NOT NULL;--> statement-breakpoint
UPDATE "kantor_petugas" p SET "jam_masuk" = k."jam_masuk" FROM "kantor" k WHERE k."id" = p."kantor_id";--> statement-breakpoint
UPDATE "kantor_izin" SET "status" = 'dikabarkan' WHERE "status" IN ('menunggu', 'disetujui');
