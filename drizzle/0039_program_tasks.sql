CREATE TABLE "program_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"program" text NOT NULL,
	"task" text NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "program_tasks_week_program_uq" ON "program_tasks" USING btree ("week_start","program");--> statement-breakpoint
-- Isi awal: papan tulis rapat Pekan ke-3 (14–20 September 2026).
INSERT INTO "program_tasks" ("week_start", "program", "task", "urutan") VALUES
	('2026-09-14', 'Maahir', 'Pengajuan konsep guru & pengurus tetap', 0),
	('2026-09-14', 'HITS', 'Proses ACC konsep penerimaan peserta', 1),
	('2026-09-14', 'ALS', 'Selesai kitab ABY → kitab Nahwu', 2),
	('2026-09-14', 'DPQ', 'Persiapan DPQ LAZ & Al-Kautsar', 3),
	('2026-09-14', 'Tashil', 'Proses ACC kriteria kelas dasar', 4),
	('2026-09-14', 'Sakan', 'Proses perumusan setelah survei pondok', 5),
	('2026-09-14', 'Disabilitas', 'Monitoring kehadiran Nurim', 6),
	('2026-09-14', 'MLP', 'Monitoring kehadiran peserta', 7),
	('2026-09-14', 'SGA', 'Pengajuan konsep & pengumpulan talent', 8)
ON CONFLICT ("week_start", "program") DO NOTHING;
