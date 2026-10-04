CREATE TABLE "page_passwords" (
	"slug" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"label" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
