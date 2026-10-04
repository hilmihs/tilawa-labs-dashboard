CREATE TABLE "ringkasan_peserta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"tilawah_user_id" integer NOT NULL,
	"mulai" date NOT NULL,
	"selesai" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ringkasan_peserta_program_user_unique" UNIQUE("program_id","tilawah_user_id")
);
--> statement-breakpoint
CREATE TABLE "ringkasan_setor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"peserta_id" uuid NOT NULL,
	"tanggal" date NOT NULL,
	"dicatat_oleh" uuid,
	"dicatat_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ringkasan_setor_peserta_tanggal_unique" UNIQUE("peserta_id","tanggal")
);
--> statement-breakpoint
ALTER TABLE "ringkasan_peserta" ADD CONSTRAINT "ringkasan_peserta_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ringkasan_setor" ADD CONSTRAINT "ringkasan_setor_peserta_id_ringkasan_peserta_id_fk" FOREIGN KEY ("peserta_id") REFERENCES "public"."ringkasan_peserta"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ringkasan_setor" ADD CONSTRAINT "ringkasan_setor_dicatat_oleh_staff_id_fk" FOREIGN KEY ("dicatat_oleh") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;