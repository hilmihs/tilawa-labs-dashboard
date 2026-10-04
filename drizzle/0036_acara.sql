CREATE TABLE "acara" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nama" text NOT NULL,
	"judul" text,
	"pemateri" text,
	"penyelenggara" text DEFAULT 'Majelis Pendidikan' NOT NULL,
	"tanggal" date NOT NULL,
	"lokasi" text,
	"alamat" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"acara_sebelumnya_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acara_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "acara_barang" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"divisi_id" uuid NOT NULL,
	"nama" text NOT NULL,
	"jumlah" numeric(10, 2),
	"satuan" text,
	"harga_satuan" numeric(12, 2),
	"kriteria" text,
	"sumber" text,
	"peruntukan" text DEFAULT 'divisi' NOT NULL,
	"status_approval" text DEFAULT 'diajukan' NOT NULL,
	"approval_oleh_staff_id" uuid,
	"approval_at" timestamp with time zone,
	"alasan_tolak" text,
	"status_ketersediaan" text DEFAULT 'belum' NOT NULL,
	"waktu_ambil" timestamp with time zone,
	"waktu_kembali" timestamp with time zone,
	"sudah_kembali" boolean DEFAULT false NOT NULL,
	"pertanyaan" text,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acara_divisi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"kode" text NOT NULL,
	"nama" text NOT NULL,
	"sisi" text NOT NULL,
	"pasangan_divisi_id" uuid,
	"urutan" integer DEFAULT 0 NOT NULL,
	"warna" text,
	"token_versi" integer DEFAULT 1 NOT NULL,
	"wa_grup" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acara_divisi_kode_uk" UNIQUE("acara_id","kode","sisi")
);
--> statement-breakpoint
CREATE TABLE "acara_dokumen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"divisi_id" uuid,
	"jenis" text NOT NULL,
	"judul" text NOT NULL,
	"versi" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"penyetuju" text,
	"disetujui_at" timestamp with time zone,
	"tautan" text,
	"isi" text,
	"berlaku_untuk" text,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acara_evaluasi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"divisi_id" uuid,
	"divisi_teks" text,
	"jenis" text NOT NULL,
	"issue" text NOT NULL,
	"poin_pengembangan" text,
	"solusi" text,
	"ditindaklanjuti_di" uuid,
	"tindak_lanjut_tugas_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acara_jobdesk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"divisi_id" uuid NOT NULL,
	"urutan" integer NOT NULL,
	"isi" text NOT NULL,
	"berlaku_untuk" text DEFAULT 'divisi' NOT NULL,
	"dari_acara_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acara_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"divisi_id" uuid,
	"staff_id" uuid,
	"aksi" text NOT NULL,
	"objek_tabel" text,
	"objek_id" uuid,
	"dari" jsonb,
	"ke" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acara_notulen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"judul" text NOT NULL,
	"waktu" timestamp with time zone NOT NULL,
	"tempat" text,
	"sisi" text,
	"isi" text NOT NULL,
	"hadir" text,
	"dibuat_oleh_panitia_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acara_panitia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"divisi_id" uuid,
	"staff_id" uuid,
	"nama" text NOT NULL,
	"gelar" text,
	"gender" text NOT NULL,
	"wa" text,
	"peran" text DEFAULT 'anggota' NOT NULL,
	"kode_pos" text,
	"status" text DEFAULT 'calon' NOT NULL,
	"bisa_tm" boolean,
	"bisa_gladi" boolean,
	"punya_powerbank" boolean,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acara_pengajuan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"jenis" text NOT NULL,
	"judul" text NOT NULL,
	"kepada" text NOT NULL,
	"nilai" numeric(14, 2),
	"status" text DEFAULT 'disiapkan' NOT NULL,
	"diajukan_at" timestamp with time zone,
	"diputus_at" timestamp with time zone,
	"tenggat" date,
	"dokumen_id" uuid,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acara_peserta_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"ditarik_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"galat_terakhir" text,
	"galat_at" timestamp with time zone,
	CONSTRAINT "acara_peserta_cache_acara_id_unique" UNIQUE("acara_id")
);
--> statement-breakpoint
CREATE TABLE "acara_reminder_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"kunci" text NOT NULL,
	"target" text NOT NULL,
	"penerima_wa" text,
	"jenis" text NOT NULL,
	"dikirim_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acara_reminder_kunci_uk" UNIQUE("acara_id","kunci")
);
--> statement-breakpoint
CREATE TABLE "acara_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"nomor" integer NOT NULL,
	"judul" text NOT NULL,
	"pelaksana" text,
	"divisi_id" uuid,
	"tanggal_mulai" date NOT NULL,
	"tanggal_akhir" date NOT NULL,
	"persentase" integer DEFAULT 0 NOT NULL,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acara_tugas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acara_id" uuid NOT NULL,
	"divisi_id" uuid,
	"fase" integer DEFAULT 1 NOT NULL,
	"judul" text NOT NULL,
	"deskripsi" text,
	"prioritas" text DEFAULT 'sedang' NOT NULL,
	"status" text DEFAULT 'belum_mulai' NOT NULL,
	"ditugaskan_ke" text,
	"panitia_id" uuid,
	"tenggat" date,
	"selesai_at" timestamp with time zone,
	"dari_jobdesk_id" uuid,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acara" ADD CONSTRAINT "acara_acara_sebelumnya_id_acara_id_fk" FOREIGN KEY ("acara_sebelumnya_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_barang" ADD CONSTRAINT "acara_barang_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_barang" ADD CONSTRAINT "acara_barang_divisi_id_acara_divisi_id_fk" FOREIGN KEY ("divisi_id") REFERENCES "public"."acara_divisi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_barang" ADD CONSTRAINT "acara_barang_approval_oleh_staff_id_staff_id_fk" FOREIGN KEY ("approval_oleh_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_divisi" ADD CONSTRAINT "acara_divisi_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_divisi" ADD CONSTRAINT "acara_divisi_pasangan_divisi_id_acara_divisi_id_fk" FOREIGN KEY ("pasangan_divisi_id") REFERENCES "public"."acara_divisi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_dokumen" ADD CONSTRAINT "acara_dokumen_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_dokumen" ADD CONSTRAINT "acara_dokumen_divisi_id_acara_divisi_id_fk" FOREIGN KEY ("divisi_id") REFERENCES "public"."acara_divisi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_evaluasi" ADD CONSTRAINT "acara_evaluasi_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_evaluasi" ADD CONSTRAINT "acara_evaluasi_divisi_id_acara_divisi_id_fk" FOREIGN KEY ("divisi_id") REFERENCES "public"."acara_divisi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_evaluasi" ADD CONSTRAINT "acara_evaluasi_ditindaklanjuti_di_acara_id_fk" FOREIGN KEY ("ditindaklanjuti_di") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_evaluasi" ADD CONSTRAINT "acara_evaluasi_tindak_lanjut_tugas_id_acara_tugas_id_fk" FOREIGN KEY ("tindak_lanjut_tugas_id") REFERENCES "public"."acara_tugas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_jobdesk" ADD CONSTRAINT "acara_jobdesk_divisi_id_acara_divisi_id_fk" FOREIGN KEY ("divisi_id") REFERENCES "public"."acara_divisi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_jobdesk" ADD CONSTRAINT "acara_jobdesk_dari_acara_id_acara_id_fk" FOREIGN KEY ("dari_acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_log" ADD CONSTRAINT "acara_log_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_log" ADD CONSTRAINT "acara_log_divisi_id_acara_divisi_id_fk" FOREIGN KEY ("divisi_id") REFERENCES "public"."acara_divisi"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_log" ADD CONSTRAINT "acara_log_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_notulen" ADD CONSTRAINT "acara_notulen_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_notulen" ADD CONSTRAINT "acara_notulen_dibuat_oleh_panitia_id_acara_panitia_id_fk" FOREIGN KEY ("dibuat_oleh_panitia_id") REFERENCES "public"."acara_panitia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_panitia" ADD CONSTRAINT "acara_panitia_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_panitia" ADD CONSTRAINT "acara_panitia_divisi_id_acara_divisi_id_fk" FOREIGN KEY ("divisi_id") REFERENCES "public"."acara_divisi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_panitia" ADD CONSTRAINT "acara_panitia_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_pengajuan" ADD CONSTRAINT "acara_pengajuan_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_pengajuan" ADD CONSTRAINT "acara_pengajuan_dokumen_id_acara_dokumen_id_fk" FOREIGN KEY ("dokumen_id") REFERENCES "public"."acara_dokumen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_peserta_cache" ADD CONSTRAINT "acara_peserta_cache_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_reminder_log" ADD CONSTRAINT "acara_reminder_log_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_timeline" ADD CONSTRAINT "acara_timeline_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_timeline" ADD CONSTRAINT "acara_timeline_divisi_id_acara_divisi_id_fk" FOREIGN KEY ("divisi_id") REFERENCES "public"."acara_divisi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_tugas" ADD CONSTRAINT "acara_tugas_acara_id_acara_id_fk" FOREIGN KEY ("acara_id") REFERENCES "public"."acara"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_tugas" ADD CONSTRAINT "acara_tugas_divisi_id_acara_divisi_id_fk" FOREIGN KEY ("divisi_id") REFERENCES "public"."acara_divisi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_tugas" ADD CONSTRAINT "acara_tugas_panitia_id_acara_panitia_id_fk" FOREIGN KEY ("panitia_id") REFERENCES "public"."acara_panitia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acara_tugas" ADD CONSTRAINT "acara_tugas_dari_jobdesk_id_acara_jobdesk_id_fk" FOREIGN KEY ("dari_jobdesk_id") REFERENCES "public"."acara_jobdesk"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acara_barang_divisi_idx" ON "acara_barang" USING btree ("acara_id","divisi_id");--> statement-breakpoint
CREATE INDEX "acara_barang_approval_idx" ON "acara_barang" USING btree ("acara_id","status_approval");--> statement-breakpoint
CREATE INDEX "acara_barang_kembali_idx" ON "acara_barang" USING btree ("acara_id","kriteria","sudah_kembali");--> statement-breakpoint
CREATE INDEX "acara_jobdesk_divisi_idx" ON "acara_jobdesk" USING btree ("divisi_id");--> statement-breakpoint
CREATE INDEX "acara_log_acara_idx" ON "acara_log" USING btree ("acara_id","created_at");--> statement-breakpoint
CREATE INDEX "acara_log_objek_idx" ON "acara_log" USING btree ("objek_tabel","objek_id");--> statement-breakpoint
CREATE INDEX "acara_panitia_divisi_idx" ON "acara_panitia" USING btree ("acara_id","divisi_id");--> statement-breakpoint
CREATE INDEX "acara_tugas_divisi_status_idx" ON "acara_tugas" USING btree ("acara_id","divisi_id","status");--> statement-breakpoint
CREATE INDEX "acara_tugas_tenggat_idx" ON "acara_tugas" USING btree ("acara_id","tenggat");