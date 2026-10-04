CREATE TABLE "recap_attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guru_id" integer NOT NULL,
	"guru_name" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"verdict" text NOT NULL,
	"meetings_total" integer,
	"meetings_taught" integer,
	"meetings_gap" integer,
	"answered" integer,
	"disputed" integer,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recap_attestations_guru_id_period_start_period_end_unique" UNIQUE("guru_id","period_start","period_end")
);
--> statement-breakpoint
CREATE INDEX "recap_attest_period_idx" ON "recap_attestations" USING btree ("period_start","period_end");