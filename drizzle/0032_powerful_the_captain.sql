CREATE TABLE "directives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"pic" text NOT NULL,
	"stakeholders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_at" date NOT NULL,
	"checkpoint" text,
	"checkpoint_updated_at" timestamp with time zone,
	"status" text DEFAULT 'aktif' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "directives_status_requested_idx" ON "directives" USING btree ("status","requested_at");