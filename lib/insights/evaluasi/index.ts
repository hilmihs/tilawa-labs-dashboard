/**
 * Evaluasi — hasil ujian peserta, dibaca dari data yang sudah tersinkron.
 *
 * Tidak ada endpoint nilai di CMS tilawah (manifest Vite-nya tidak punya satu
 * pun halaman Nilai/Ujian/Evaluasi, dan `/api/nilai`, `/api/ujian`,
 * `/api/penilaian`, `/api/reports/*` sejenisnya semuanya 404). Ujian di HITS
 * adalah *pertemuan* biasa yang ditandai `type_pertemuan = "ujian"`, dan
 * nilainya menumpang pada baris presensi pertemuan itu:
 *
 *   `lahn_jaliy`  — jumlah kesalahan jaliy (fatal) yang dicatat guru
 *   `lahn_khofiy` — jumlah kesalahan khofiy (halus)
 *   `status`      — kehadiran, yang juga dipakai upstream sebagai verdict lulus
 *
 * Ketiganya sudah ada di `attendance_sync` sejak sync pertama, dan
 * `type_pertemuan` sudah ikut tersimpan di `jadwal_sync.raw`. Modul ini hanya
 * membaca — tidak ada tabel baru, tidak ada sync tambahan.
 *
 * Rute ini hanya masuk akal untuk program ber-sumber tilawah: `type_pertemuan`
 * milik CMS itu. Lihat {@link programPunyaEvaluasi}.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getProgram, type Program } from "@/lib/programs/resolve";
import {
  ringkasEvaluasi,
  ringkasUjian,
  type EvaluasiRingkas,
  type HasilBaris,
  type UjianRingkas,
} from "./view-model";

export * from "./view-model";

/** Hanya program tilawah yang punya penanda `type_pertemuan` di pertemuannya. */
export function programPunyaEvaluasi(program: Program): boolean {
  return program.dataSourceType === "tilawah_api";
}

export type EvaluasiData = {
  hasil: HasilBaris[];
  ujian: UjianRingkas[];
  ringkas: EvaluasiRingkas;
  /** Sinkron terakhir yang menyentuh pertemuan ujian program ini. */
  syncedAt: Date | null;
};

type Row = {
  jadwal_id: number;
  halaqah_id: number;
  ujian: string | null;
  schedule_date: string | Date | null;
  halaqah: string | null;
  pengajar: string | null;
  level: string | null;
  presensi_id: number | null;
  halaqah_user_id: number | null;
  status: string | null;
  lahn_jaliy: string | null;
  lahn_khofiy: string | null;
  notes: string | null;
  peserta: string | null;
  user_code: string | null;
  synced_at: Date | string | null;
};

/** `schedule_date` bisa datang sebagai Date (driver) atau string — samakan ke YYYY-MM-DD. */
function toIsoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

/** Kolom `attendance_sync` bertipe text; "" berarti kosong, bukan nol. */
function toNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Semua hasil ujian satu program. `null` bila slug-nya tidak ada.
 *
 * Pertemuan ujian yang belum punya satu pun presensi tetap ikut terbawa (lewat
 * `left join`) sebagai satu baris ber-`presensiId: null`, supaya rekap per-ujian
 * di bawah tahu ujian itu ada. Baris seperti itu tidak pernah dihitung sebagai
 * peserta — lihat `ringkasUjian`.
 */
export async function loadEvaluasi(slug: string): Promise<EvaluasiData | null> {
  const program = await getProgram(slug);
  if (!program) return null;

  const db = getDb();
  const res = await db.execute(sql`
    select
      j.tilawah_jadwal_id  as jadwal_id,
      j.tilawah_halaqah_id as halaqah_id,
      j.name               as ujian,
      j.schedule_date      as schedule_date,
      h.name               as halaqah,
      h.pengajar           as pengajar,
      h.level              as level,
      a.tilawah_presensi_id as presensi_id,
      a.halaqah_user_id    as halaqah_user_id,
      a.status             as status,
      a.lahn_jaliy         as lahn_jaliy,
      a.lahn_khofiy        as lahn_khofiy,
      a.notes              as notes,
      ss.name              as peserta,
      ss.user_code         as user_code,
      greatest(j.synced_at, coalesce(a.synced_at, j.synced_at)) as synced_at
    from jadwal_sync j
    left join halaqah_sync h
      on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    left join attendance_sync a
      on a.program_id = j.program_id and a.halaqah_jadwal_id = j.tilawah_jadwal_id
    left join students_sync ss
      on ss.program_id = j.program_id and ss.halaqah_user_id = a.halaqah_user_id
    where j.program_id = ${program.id}
      and j.raw->>'type_pertemuan' = 'ujian'
    order by j.schedule_date desc nulls last, h.name asc, ss.name asc
  `);

  let synced: Date | null = null;
  const hasil: HasilBaris[] = (res.rows as unknown as Row[]).map((r) => {
    const at = r.synced_at == null ? null : new Date(r.synced_at);
    if (at && (!synced || at > synced)) synced = at;
    return {
      presensiId: r.presensi_id == null ? null : Number(r.presensi_id),
      jadwalId: Number(r.jadwal_id),
      halaqahId: Number(r.halaqah_id),
      halaqahUserId: r.halaqah_user_id == null ? null : Number(r.halaqah_user_id),
      halaqah: r.halaqah,
      pengajar: r.pengajar,
      level: r.level,
      ujian: r.ujian,
      tanggal: toIsoDate(r.schedule_date),
      peserta: r.peserta,
      userCode: r.user_code,
      status: toNumber(r.status),
      lahnJaliy: toNumber(r.lahn_jaliy),
      lahnKhofiy: toNumber(r.lahn_khofiy),
      catatan: r.notes && r.notes !== "" ? r.notes : null,
    };
  });

  const ujian = ringkasUjian(hasil);
  return { hasil, ujian, ringkas: ringkasEvaluasi(hasil, ujian), syncedAt: synced };
}
