ALTER TABLE "halaqah_sync" ADD COLUMN "guru_id" integer;--> statement-breakpoint
ALTER TABLE "halaqah_sync" ADD COLUMN "pengajar" text;--> statement-breakpoint
ALTER TABLE "jadwal_sync" ADD COLUMN "guru_id" integer;--> statement-breakpoint
ALTER TABLE "students_sync" ADD COLUMN "gender" integer;--> statement-breakpoint
ALTER TABLE "students_sync" ADD COLUMN "enrollment_status" text;