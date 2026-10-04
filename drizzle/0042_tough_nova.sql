CREATE TABLE "hadir_lepas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tanggal" date NOT NULL,
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
ALTER TABLE "hadir_lepas" ADD CONSTRAINT "hadir_lepas_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hadir_lepas" ADD CONSTRAINT "hadir_lepas_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hadir_lepas_orang_unik" ON "hadir_lepas" USING btree ("tanggal","orang_id");--> statement-breakpoint
CREATE INDEX "hadir_lepas_tanggal_idx" ON "hadir_lepas" USING btree ("tanggal");