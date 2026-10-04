CREATE TABLE "catatan_orang" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orang_id" uuid NOT NULL,
	"acara_id" uuid,
	"jenis" text NOT NULL,
	"aspek" text[] DEFAULT '{}'::text[] NOT NULL,
	"isi" text NOT NULL,
	"oleh_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_rubrik" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kode" text NOT NULL,
	"nama" text NOT NULL,
	"jenis" text NOT NULL,
	"berlaku_untuk" text DEFAULT 'panitia' NOT NULL,
	"deskripsi" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"otomatis" boolean DEFAULT false NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"versi" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "penilaian" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orang_id" uuid NOT NULL,
	"acara_id" uuid,
	"panitia_id" uuid,
	"kpi_id" uuid NOT NULL,
	"kpi_versi" integer DEFAULT 1 NOT NULL,
	"nilai" text NOT NULL,
	"nilai_angka" numeric NOT NULL,
	"sumber" text NOT NULL,
	"penilai_staff_id" uuid,
	"penilai_panitia_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acara_panitia" ADD COLUMN "orang_id" uuid;--> statement-breakpoint
ALTER TABLE "catatan_orang" ADD CONSTRAINT "catatan_orang_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catatan_orang" ADD CONSTRAINT "catatan_orang_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catatan_orang" ADD CONSTRAINT "catatan_orang_oleh_staff_id_staff_id_fk" FOREIGN KEY ("oleh_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penilaian" ADD CONSTRAINT "penilaian_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penilaian" ADD CONSTRAINT "penilaian_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penilaian" ADD CONSTRAINT "penilaian_panitia_id_acara_panitia_id_fk" FOREIGN KEY ("panitia_id") REFERENCES "public"."acara_panitia"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penilaian" ADD CONSTRAINT "penilaian_kpi_id_kpi_rubrik_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_rubrik"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penilaian" ADD CONSTRAINT "penilaian_penilai_staff_id_staff_id_fk" FOREIGN KEY ("penilai_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penilaian" ADD CONSTRAINT "penilaian_penilai_panitia_id_acara_panitia_id_fk" FOREIGN KEY ("penilai_panitia_id") REFERENCES "public"."acara_panitia"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catatan_orang_orang_idx" ON "catatan_orang" USING btree ("orang_id","acara_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_rubrik_kode_unik" ON "kpi_rubrik" USING btree ("kode","berlaku_untuk");--> statement-breakpoint
CREATE UNIQUE INDEX "penilaian_unik" ON "penilaian" USING btree ("orang_id","acara_id","kpi_id","sumber");--> statement-breakpoint
CREATE INDEX "penilaian_orang_idx" ON "penilaian" USING btree ("orang_id");--> statement-breakpoint
ALTER TABLE "acara_panitia" ADD CONSTRAINT "acara_panitia_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "kpi_rubrik" ("kode", "nama", "jenis", "berlaku_untuk", "deskripsi", "otomatis", "urutan") VALUES
  ('tepat_waktu', 'Ketepatan waktu', 'umum', 'panitia', '{"B":"Selalu datang sebelum jam mulai","C":"Terlambat sedikit, masih dalam toleransi","D":"Terlambat melewati toleransi","E":"Tidak datang tanpa kabar","catatan":"Definisi sementara — menunggu rubrik tim kaderisasi"}'::jsonb, true, 1),
  ('disiplin', 'Kedisiplinan', 'umum', 'panitia', '{"catatan":"Menjalankan SOP & jobdesk divisi. Definisi B/C/D/E menunggu tim kaderisasi"}'::jsonb, false, 2),
  ('pegang_peserta', 'Memegang peserta', 'spesifik', 'panitia', '{"catatan":"Sejauh mana mengarahkan & melayani peserta. Definisi B/C/D/E menunggu tim kaderisasi"}'::jsonb, false, 3),
  ('inisiatif', 'Inisiatif', 'spesifik', 'panitia', '{"catatan":"Mengambil tindakan tanpa diminta. Definisi B/C/D/E menunggu tim kaderisasi"}'::jsonb, false, 4)
ON CONFLICT DO NOTHING;
