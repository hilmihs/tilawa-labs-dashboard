CREATE TABLE "orang_tautan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orang_id" uuid NOT NULL,
	"sumber" text NOT NULL,
	"peran" text NOT NULL,
	"id_upstream" text NOT NULL,
	"program_slug" text DEFAULT '' NOT NULL,
	"nama_upstream" text,
	"aktif" boolean DEFAULT true NOT NULL,
	"metode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orang_tautan" ADD CONSTRAINT "orang_tautan_orang_id_orang_id_fk" FOREIGN KEY ("orang_id") REFERENCES "public"."orang"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orang_tautan_unik" ON "orang_tautan" USING btree ("sumber","peran","id_upstream","program_slug");--> statement-breakpoint
CREATE INDEX "orang_tautan_orang_idx" ON "orang_tautan" USING btree ("orang_id");