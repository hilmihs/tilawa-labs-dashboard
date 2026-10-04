CREATE TABLE "kartu_nfc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orang_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dicabut_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kerja_anggota" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kantor_id" uuid NOT NULL,
	"orang_id" uuid NOT NULL,
	"bagian" text DEFAULT 'Pengurus Pendidikan' NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kerja_hadir" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kantor_id" uuid NOT NULL,
	"orang_id" uuid NOT NULL,
	"tanggal" date NOT NULL,
	"sesi" text NOT NULL,
	"waktu" timestamp with time zone NOT NULL,
	"sumber" text NOT NULL,
	"tap_id" uuid,
	"catatan" text,
	"dicatat_oleh" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tap_arti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tap_id" uuid NOT NULL,
	"jenis" text NOT NULL,
	"status" text NOT NULL,
	"sesi" text,
	"acara_id" uuid,
	"halaqah_sync_id" uuid,
	"jadwal_id" integer,
	"label" text NOT NULL,
	"alasan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tap_kartu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"klien_id" uuid NOT NULL,
	"kantor_id" uuid NOT NULL,
	"orang_id" uuid,
	"dibaca" text NOT NULL,
	"metode" text NOT NULL,
	"waktu" timestamp with time zone NOT NULL,
	"diterima_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hasil" text NOT NULL,
	"sesi" text,
	"dicatat_oleh" text
);
--> statement-breakpoint
ALTER TABLE "kantor" ADD COLUMN "sesi_pagi_mulai" text DEFAULT '05:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "kantor" ADD COLUMN "sesi_siang_mulai" text DEFAULT '11:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "kantor" ADD COLUMN "sesi_sore_mulai" text DEFAULT '15:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "kantor" ADD COLUMN "sesi_selesai" text DEFAULT '22:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "kartu_nfc" ADD CONSTRAINT "kartu_nfc_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kerja_anggota" ADD CONSTRAINT "kerja_anggota_kantor_id_kantor_id_fk" FOREIGN KEY ("kantor_id") REFERENCES "public"."kantor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kerja_anggota" ADD CONSTRAINT "kerja_anggota_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kerja_hadir" ADD CONSTRAINT "kerja_hadir_kantor_id_kantor_id_fk" FOREIGN KEY ("kantor_id") REFERENCES "public"."kantor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kerja_hadir" ADD CONSTRAINT "kerja_hadir_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kerja_hadir" ADD CONSTRAINT "kerja_hadir_tap_id_tap_kartu_id_fk" FOREIGN KEY ("tap_id") REFERENCES "public"."tap_kartu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tap_arti" ADD CONSTRAINT "tap_arti_tap_id_tap_kartu_id_fk" FOREIGN KEY ("tap_id") REFERENCES "public"."tap_kartu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tap_arti" ADD CONSTRAINT "tap_arti_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tap_kartu" ADD CONSTRAINT "tap_kartu_kantor_id_kantor_id_fk" FOREIGN KEY ("kantor_id") REFERENCES "public"."kantor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tap_kartu" ADD CONSTRAINT "tap_kartu_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kartu_nfc_uid_aktif_unik" ON "kartu_nfc" USING btree ("uid") WHERE "kartu_nfc"."aktif";--> statement-breakpoint
CREATE UNIQUE INDEX "kerja_anggota_orang_unik" ON "kerja_anggota" USING btree ("kantor_id","orang_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kerja_hadir_unik" ON "kerja_hadir" USING btree ("kantor_id","orang_id","tanggal","sesi");--> statement-breakpoint
CREATE INDEX "kerja_hadir_tanggal_idx" ON "kerja_hadir" USING btree ("kantor_id","tanggal");--> statement-breakpoint
CREATE INDEX "tap_arti_tap_idx" ON "tap_arti" USING btree ("tap_id");--> statement-breakpoint
CREATE INDEX "tap_arti_jenis_idx" ON "tap_arti" USING btree ("jenis","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tap_kartu_klien_unik" ON "tap_kartu" USING btree ("klien_id");--> statement-breakpoint
CREATE INDEX "tap_kartu_waktu_idx" ON "tap_kartu" USING btree ("waktu");