CREATE TABLE "acara_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"klasifikasi_id" uuid NOT NULL,
	"sifat" text DEFAULT 'wajib' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "klasifikasi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nama" text NOT NULL,
	"keterangan" text,
	"urutan" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orang_klasifikasi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orang_id" uuid NOT NULL,
	"klasifikasi_id" uuid NOT NULL,
	"sumber" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acara" ADD COLUMN "tema" text;--> statement-breakpoint
ALTER TABLE "acara" ADD COLUMN "seri" text;--> statement-breakpoint
ALTER TABLE "orang" ADD COLUMN "qism" text;--> statement-breakpoint
ALTER TABLE "orang" ADD COLUMN "qism_taksiran" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orang" ADD COLUMN "mustawa" text;--> statement-breakpoint
ALTER TABLE "orang" ADD COLUMN "fatroh" text;--> statement-breakpoint
ALTER TABLE "orang" ADD COLUMN "asal_sekolah" text;--> statement-breakpoint
ALTER TABLE "orang" ADD COLUMN "program_mp" text;--> statement-breakpoint
ALTER TABLE "acara_target" ADD CONSTRAINT "acara_target_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_target" ADD CONSTRAINT "acara_target_klasifikasi_id_klasifikasi_id_fk" FOREIGN KEY ("klasifikasi_id") REFERENCES "public"."klasifikasi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orang_klasifikasi" ADD CONSTRAINT "orang_klasifikasi_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orang_klasifikasi" ADD CONSTRAINT "orang_klasifikasi_klasifikasi_id_klasifikasi_id_fk" FOREIGN KEY ("klasifikasi_id") REFERENCES "public"."klasifikasi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acara_target_unik" ON "acara_target" USING btree ("acara_id","klasifikasi_id");--> statement-breakpoint
CREATE UNIQUE INDEX "klasifikasi_slug_unik" ON "klasifikasi" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "orang_klasifikasi_unik" ON "orang_klasifikasi" USING btree ("orang_id","klasifikasi_id");--> statement-breakpoint
CREATE INDEX "orang_klasifikasi_kls_idx" ON "orang_klasifikasi" USING btree ("klasifikasi_id");