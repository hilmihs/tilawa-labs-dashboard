CREATE TABLE "staff_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	CONSTRAINT "staff_programs_staff_id_program_id_unique" UNIQUE("staff_id","program_id")
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "role" text DEFAULT 'coordinator' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_programs" ADD CONSTRAINT "staff_programs_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_programs" ADD CONSTRAINT "staff_programs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;