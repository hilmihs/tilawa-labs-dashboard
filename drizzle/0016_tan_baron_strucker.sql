DROP INDEX "jce_upstream_uk";--> statement-breakpoint
CREATE UNIQUE INDEX "jce_upstream_uk" ON "jadwal_change_events" USING btree ("program_id","upstream_log_id","field");