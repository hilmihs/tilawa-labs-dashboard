CREATE TABLE "kantor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"radius_m" integer DEFAULT 100 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "kantor_absen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"petugas_id" uuid NOT NULL,
	"jenis" text NOT NULL,
	"tanggal" date NOT NULL,
	"waktu" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"akurasi_m" double precision NOT NULL,
	"jarak_m" double precision NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "kantor_petugas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kantor_id" uuid NOT NULL,
	"nama_arab" text NOT NULL,
	"nama_latin" text NOT NULL,
	"wa" text,
	"token" text NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kantor_absen" ADD CONSTRAINT "kantor_absen_petugas_id_kantor_petugas_id_fk" FOREIGN KEY ("petugas_id") REFERENCES "public"."kantor_petugas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kantor_petugas" ADD CONSTRAINT "kantor_petugas_kantor_id_kantor_id_fk" FOREIGN KEY ("kantor_id") REFERENCES "public"."kantor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kantor_absen_unik" ON "kantor_absen" USING btree ("petugas_id","tanggal","jenis");--> statement-breakpoint
CREATE INDEX "kantor_absen_tanggal_idx" ON "kantor_absen" USING btree ("tanggal");--> statement-breakpoint
CREATE UNIQUE INDEX "kantor_petugas_token_unik" ON "kantor_petugas" USING btree ("token");