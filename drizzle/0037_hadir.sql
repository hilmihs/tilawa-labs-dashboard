CREATE TABLE "acara_hadir" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"orang_id" uuid NOT NULL,
	"waktu" timestamp with time zone NOT NULL,
	"diterima_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metode" text DEFAULT 'qr' NOT NULL,
	"perangkat_id" text,
	"staff_id" uuid,
	"klien_id" text,
	"catatan" text
);
--> statement-breakpoint
CREATE TABLE "acara_pendaftaran" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"orang_id" uuid NOT NULL,
	"konfirmasi" text,
	"alasan" text,
	"sumber" text DEFAULT 'dashboard' NOT NULL,
	"dijawab_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orang" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"nama_kunci" text NOT NULL,
	"gender" text NOT NULL,
	"wa" text,
	"email" text,
	"program_teks" text,
	"kategori" text DEFAULT 'pengajar' NOT NULL,
	"kode_qr" text NOT NULL,
	"sumber" text DEFAULT 'dashboard' NOT NULL,
	"perlu_review" boolean DEFAULT false NOT NULL,
	"gabung_ke_id" uuid,
	"status" text DEFAULT 'aktif' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acara" ADD COLUMN "jam_mulai" time;--> statement-breakpoint
ALTER TABLE "acara" ADD COLUMN "toleransi_menit" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "acara" ADD COLUMN "scan_buka_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "acara" ADD COLUMN "scan_tutup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "acara" ADD COLUMN "terima_pendaftaran" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "acara_hadir" ADD CONSTRAINT "acara_hadir_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_hadir" ADD CONSTRAINT "acara_hadir_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_hadir" ADD CONSTRAINT "acara_hadir_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_pendaftaran" ADD CONSTRAINT "acara_pendaftaran_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_pendaftaran" ADD CONSTRAINT "acara_pendaftaran_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orang" ADD CONSTRAINT "orang_gabung_ke_id_orang_id_fk" FOREIGN KEY ("gabung_ke_id") REFERENCES "public"."orang"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acara_hadir_orang_unik" ON "acara_hadir" USING btree ("acara_id","orang_id");--> statement-breakpoint
CREATE INDEX "acara_hadir_waktu_idx" ON "acara_hadir" USING btree ("acara_id","waktu");--> statement-breakpoint
CREATE UNIQUE INDEX "acara_pendaftaran_orang_unik" ON "acara_pendaftaran" USING btree ("acara_id","orang_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orang_kode_qr_unik" ON "orang" USING btree ("kode_qr");--> statement-breakpoint
CREATE UNIQUE INDEX "orang_wa_unik" ON "orang" USING btree ("wa") WHERE "orang"."wa" is not null;--> statement-breakpoint
CREATE INDEX "orang_nama_kunci_idx" ON "orang" USING btree ("nama_kunci");