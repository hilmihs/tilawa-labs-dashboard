CREATE TABLE "hkm_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"letter_type" text NOT NULL,
	"level" integer,
	"recipient_count" integer DEFAULT 1 NOT NULL,
	"recipient_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_path" text NOT NULL,
	"letter_date" date NOT NULL,
	"signer_name" text NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hkm_letters" ADD CONSTRAINT "hkm_letters_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkm_letters" ADD CONSTRAINT "hkm_letters_generated_by_staff_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hkm_letters_program_generated_idx" ON "hkm_letters" USING btree ("program_id","generated_at");