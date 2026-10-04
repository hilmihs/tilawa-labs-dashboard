CREATE TABLE "maahir_rekap" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"route" text NOT NULL,
	"periode" text NOT NULL,
	"params_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maahir_rekap_program_id_route_periode_params_key_unique" UNIQUE("program_id","route","periode","params_key")
);
--> statement-breakpoint
ALTER TABLE "maahir_rekap" ADD CONSTRAINT "maahir_rekap_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maahir_rekap_program_route_periode_idx" ON "maahir_rekap" USING btree ("program_id","route","periode");