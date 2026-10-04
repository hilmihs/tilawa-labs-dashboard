CREATE TABLE "tilawah_sync_cursor" (
	"key" text PRIMARY KEY NOT NULL,
	"high_water_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
