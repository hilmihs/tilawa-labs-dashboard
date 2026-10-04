CREATE TABLE "program_teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"category_raw" text NOT NULL,
	"category_key" text NOT NULL,
	"level" text NOT NULL,
	"gender" integer NOT NULL,
	"jenis_pertemuan" text,
	"group_ordinal" integer DEFAULT 1 NOT NULL,
	"source_row" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_teacher_assignments_program_id_category_key_group_ordinal_teacher_id_unique" UNIQUE("program_id","category_key","group_ordinal","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "program_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"name_key" text NOT NULL,
	"tilawah_guru_id" integer,
	"joined_at" date,
	"status" text,
	"source_ordinal" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_teachers_program_id_name_key_unique" UNIQUE("program_id","name_key")
);
--> statement-breakpoint
CREATE TABLE "student_guardian_children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"child_name" text NOT NULL,
	"child_key" text NOT NULL,
	"student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardian_children_guardian_id_ordinal_unique" UNIQUE("guardian_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"father_name" text,
	"mother_name" text,
	"father_key" text DEFAULT '' NOT NULL,
	"mother_key" text DEFAULT '' NOT NULL,
	"child_count" integer,
	"source_no" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_program_id_father_key_mother_key_unique" UNIQUE("program_id","father_key","mother_key")
);
--> statement-breakpoint
ALTER TABLE "program_teacher_assignments" ADD CONSTRAINT "program_teacher_assignments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_teacher_assignments" ADD CONSTRAINT "program_teacher_assignments_teacher_id_program_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."program_teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_teachers" ADD CONSTRAINT "program_teachers_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian_children" ADD CONSTRAINT "student_guardian_children_guardian_id_student_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."student_guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian_children" ADD CONSTRAINT "student_guardian_children_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian_children" ADD CONSTRAINT "student_guardian_children_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_teacher_assignments_teacher_idx" ON "program_teacher_assignments" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "program_teacher_assignments_cat_idx" ON "program_teacher_assignments" USING btree ("program_id","category_key");--> statement-breakpoint
CREATE INDEX "program_teachers_guru_idx" ON "program_teachers" USING btree ("program_id","tilawah_guru_id");--> statement-breakpoint
CREATE INDEX "student_guardian_children_student_idx" ON "student_guardian_children" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_guardian_children_key_idx" ON "student_guardian_children" USING btree ("program_id","child_key");--> statement-breakpoint
CREATE INDEX "student_guardians_program_idx" ON "student_guardians" USING btree ("program_id");