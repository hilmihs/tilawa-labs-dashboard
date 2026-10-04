CREATE TABLE "news_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division" text NOT NULL,
	"week_start" date NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"program_slug" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"submitted_by" uuid,
	"submitted_by_name" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_by_name" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"division" text NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_divisions_staff_id_division_unique" UNIQUE("staff_id","division")
);
--> statement-breakpoint
CREATE TABLE "tv_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"arabic" text,
	"source" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_submitted_by_staff_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_divisions" ADD CONSTRAINT "staff_divisions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_quotes" ADD CONSTRAINT "tv_quotes_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_items_week_status_idx" ON "news_items" USING btree ("week_start","status");--> statement-breakpoint
CREATE INDEX "news_items_division_week_idx" ON "news_items" USING btree ("division","week_start");--> statement-breakpoint
CREATE INDEX "tv_quotes_active_idx" ON "tv_quotes" USING btree ("active","sort_order");--> statement-breakpoint
CREATE INDEX "attendance_sync_program_jadwal_idx" ON "attendance_sync" USING btree ("program_id","halaqah_jadwal_id");--> statement-breakpoint
CREATE INDEX "attendance_sync_program_user_idx" ON "attendance_sync" USING btree ("program_id","halaqah_user_id");--> statement-breakpoint
CREATE INDEX "jadwal_sync_program_date_idx" ON "jadwal_sync" USING btree ("program_id","schedule_date");--> statement-breakpoint
CREATE INDEX "students_sync_program_halaqah_idx" ON "students_sync" USING btree ("program_id","halaqah_id");