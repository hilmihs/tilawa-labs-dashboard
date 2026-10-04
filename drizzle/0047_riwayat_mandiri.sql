CREATE TABLE "riwayat_mandiri" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orang_id" uuid NOT NULL,
	"tahun" integer NOT NULL,
	"kegiatan" text NOT NULL,
	"peran" text DEFAULT 'peserta' NOT NULL,
	"keterangan" text,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"diverifikasi_oleh" uuid,
	"diverifikasi_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "riwayat_mandiri" ADD CONSTRAINT "riwayat_mandiri_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riwayat_mandiri" ADD CONSTRAINT "riwayat_mandiri_diverifikasi_oleh_staff_id_fk" FOREIGN KEY ("diverifikasi_oleh") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "riwayat_mandiri_unik" ON "riwayat_mandiri" USING btree ("orang_id","tahun","kegiatan","peran");--> statement-breakpoint
CREATE INDEX "riwayat_mandiri_status_idx" ON "riwayat_mandiri" USING btree ("status");