CREATE TABLE "kantor_izin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"petugas_id" uuid NOT NULL,
	"dari" date NOT NULL,
	"sampai" date NOT NULL,
	"alasan" text NOT NULL,
	"catatan" text,
	"status" text DEFAULT 'menunggu' NOT NULL,
	"dibuat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"diputus_at" timestamp with time zone,
	"diputus_oleh" text
);
--> statement-breakpoint
ALTER TABLE "kantor" ADD COLUMN "jam_masuk" text DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "kantor_izin" ADD CONSTRAINT "kantor_izin_petugas_id_kantor_petugas_id_fk" FOREIGN KEY ("petugas_id") REFERENCES "public"."kantor_petugas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kantor_izin_petugas_idx" ON "kantor_izin" USING btree ("petugas_id","dari");