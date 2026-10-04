CREATE TABLE "scorecard_kpis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"perspective" text NOT NULL,
	"subdivision" text NOT NULL,
	"cat_code" text,
	"oyp_code" text,
	"cat_name" text,
	"name" text NOT NULL,
	"uom" text,
	"target" numeric,
	"weight" numeric,
	"target_period" numeric,
	"ach_seed" numeric,
	"outlook_seed" numeric,
	"problem" text,
	"corrective" text,
	"pic" text,
	"counts_toward_cat" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecard_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'quarter' NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecard_periods_kind_year_seq_unique" UNIQUE("kind","year","seq")
);
--> statement-breakpoint
CREATE TABLE "scorecard_workbook_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kpi_id" uuid NOT NULL,
	"deskripsi" text,
	"detail" text,
	"kuantitas" numeric,
	"pembagi" numeric,
	"hours" numeric,
	"status" text DEFAULT 'achieved' NOT NULL,
	"sumber" text,
	"origin" text DEFAULT 'manual' NOT NULL,
	"metric_kind" text,
	"metric_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_value" numeric,
	"auto_pembagi" numeric,
	"locked" boolean DEFAULT false NOT NULL,
	"refreshed_at" timestamp with time zone,
	"refresh_error" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scorecard_kpis" ADD CONSTRAINT "scorecard_kpis_period_id_scorecard_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."scorecard_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_workbook_items" ADD CONSTRAINT "scorecard_workbook_items_kpi_id_scorecard_kpis_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."scorecard_kpis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scorecard_kpis_period_sub_idx" ON "scorecard_kpis" USING btree ("period_id","subdivision");--> statement-breakpoint
CREATE INDEX "scorecard_kpis_period_cat_idx" ON "scorecard_kpis" USING btree ("period_id","cat_code");--> statement-breakpoint
CREATE INDEX "scorecard_workbook_kpi_idx" ON "scorecard_workbook_items" USING btree ("kpi_id");--> statement-breakpoint
--- Hand-written: drizzle-kit cannot express a partial unique index. At most one
--- period may be flagged active — the /scorecard page opens on it.
CREATE UNIQUE INDEX "scorecard_periods_one_active" ON "scorecard_periods" ("active") WHERE "active";