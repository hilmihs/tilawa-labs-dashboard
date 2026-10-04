/**
 * Evaluasi Halaqah (Maahir) untuk satu atau beberapa batch tilawah — pembaca mirror.
 *
 * `maahir_sync` menyimpan baris `evaluasi/*` mentah di bawah program Maahir
 * (satu mirror untuk semua batch). Program dashboard dipilih lewat
 * `evaluasi/halaqah.batch_id`, yang sama dengan slug program di sini
 * (`hits-regular-apr`, `dpq`, …). Aturan hitungnya di maahir-view-model.ts.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  susunEvaluasi,
  type EvalHalaqah,
  type EvalHasil,
  type EvalNilai,
  type EvalPengajar,
  type EvalPeserta,
  type EvalRapot,
  type EvalSesi,
  type JenisSesi,
  type OpsiPeriode,
} from "./maahir-view-model";

export * from "./maahir-view-model";

export type EvaluasiMaahirData = EvalHasil & {
  /** Sinkron Maahir terakhir yang menulis baris evaluasi. Null = belum pernah tertarik. */
  syncedAt: Date | null;
  /** tilawah_user_id → kode peserta di dashboard (students_sync). */
  kodePeserta: Record<number, string>;
};

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function rows(entity: string, where: ReturnType<typeof sql>): Promise<{ raw: Raw; synced_at: Date | string }[]> {
  const res = await getDb().execute(sql`
    select s.raw, s.synced_at
      from maahir_sync s
      join programs p on p.id = s.program_id and p.data_source_type = 'maahir_api'
     where s.entity = ${entity} and ${where}
  `);
  return res.rows as { raw: Raw; synced_at: Date | string }[];
}

const teksArr = (xs: readonly string[]) => sql`array[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;

/**
 * `slugs` = batch evaluasi (= slug program dashboard); lebih dari satu untuk mode
 * Gabungan laporan bulanan. `programIds` hanya dipakai mencari kode peserta.
 */
export async function loadEvaluasiMaahir(
  slugs: readonly string[],
  programIds: readonly string[],
  opsi: OpsiPeriode = {},
): Promise<EvaluasiMaahirData> {
  const halaqahRows = slugs.length ? await rows("evaluasi/halaqah", sql`s.raw->>'batch_id' = any(${teksArr(slugs)})`) : [];
  const halaqah: EvalHalaqah[] = halaqahRows.map(({ raw: r }) => ({
    id: String(r.id),
    nama: str(r.nama),
    gender: str(r.gender),
    pengajarId: str(r.pengajar_id),
    ambangUjian: num(r.ambang_ujian),
  }));
  let synced: Date | null = null;
  const catat = (list: { synced_at: Date | string }[]) => {
    for (const x of list) {
      const d = new Date(x.synced_at);
      if (!synced || d > synced) synced = d;
    }
  };
  catat(halaqahRows);

  if (halaqah.length === 0) {
    return { ...susunEvaluasi({ halaqah, pengajar: [], peserta: [], sesi: [], nilai: [], rapot: [] }, opsi), syncedAt: synced, kodePeserta: {} };
  }
  const ids = halaqah.map((h) => h.id);
  const idArr = sql`array[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::text[]`;

  const [pengajarRows, pesertaRows, sesiRows, rapotRows] = await Promise.all([
    rows("evaluasi/pengajar", sql`true`),
    rows("evaluasi/peserta", sql`s.raw->>'halaqah_id' = any(${idArr})`),
    rows("evaluasi/sesi", sql`s.raw->>'halaqah_id' = any(${idArr})`),
    rows("evaluasi/rapot", sql`s.raw->>'halaqah_id' = any(${idArr})`),
  ]);
  catat(pesertaRows);
  catat(sesiRows);
  catat(rapotRows);

  const sesi: EvalSesi[] = sesiRows.map(({ raw: r }) => ({
    id: String(r.id),
    halaqahId: String(r.halaqah_id),
    jenis: String(r.jenis) as JenisSesi,
    nomor: num(r.nomor_sesi),
    tglJadwal: str(r.tgl_jadwal)?.slice(0, 10) ?? null,
    surat: str(r.surat),
    status: r.status === "terkirim" ? "terkirim" : "draft",
    dihapus: r.dihapus === true,
    updatedAt: str(r.updated_at),
    createdAt: str(r.created_at),
  }));

  // Nilai dipilih lewat sesi program ini — satu sesi hanya milik satu halaqah.
  const sesiIds = sesi.map((s) => s.id);
  const nilaiRows = sesiIds.length
    ? await rows("evaluasi/nilai", sql`s.raw->>'sesi_id' = any(array[${sql.join(sesiIds.map((i) => sql`${i}`), sql`, `)}]::text[])`)
    : [];
  catat(nilaiRows);

  const nilai: EvalNilai[] = nilaiRows.map(({ raw: r }) => ({
    id: String(r.id),
    sesiId: String(r.sesi_id),
    pesertaId: String(r.peserta_id),
    hadir: r.hadir === true,
    skor: num(r.skor),
    updatedAt: str(r.updated_at),
  }));
  const peserta: EvalPeserta[] = pesertaRows.map(({ raw: r }) => ({
    id: String(r.id),
    nama: str(r.nama),
    gender: str(r.gender),
    halaqahId: str(r.halaqah_id),
    aktif: r.aktif !== false,
  }));
  const pengajar: EvalPengajar[] = pengajarRows.map(({ raw: r }) => ({ id: String(r.id), nama: str(r.nama) }));
  const rapot: EvalRapot[] = rapotRows.map(({ raw: r }) => ({
    id: String(r.id),
    halaqahId: str(r.halaqah_id),
    pesertaId: String(r.peserta_id),
    jenis: String(r.jenis_rapot ?? ""),
    nilaiAkhir: num(r.nilai_akhir),
    lulus: typeof r.lulus === "boolean" ? r.lulus : null,
    ambang: num(r.ambang),
    status: String(r.status ?? ""),
    diterbitkanAt: str(r.diterbitkan_at),
  }));

  const hasil = susunEvaluasi({ halaqah, pengajar, peserta, sesi, nilai, rapot }, opsi);

  const tilawahIds = hasil.peserta.map((p) => p.tilawahUserId).filter((v): v is number => v != null);
  const kodePeserta: Record<number, string> = {};
  if (tilawahIds.length && programIds.length) {
    const res = await getDb().execute(sql`
      select distinct on (tilawah_user_id) tilawah_user_id, user_code
        from students_sync
       where program_id = any(array[${sql.join(programIds.map((i) => sql`${i}`), sql`, `)}]::uuid[])
         and tilawah_user_id = any(array[${sql.join(tilawahIds.map((i) => sql`${i}`), sql`, `)}]::int[])
         and user_code is not null
    `);
    for (const r of res.rows as { tilawah_user_id: number; user_code: string }[]) kodePeserta[Number(r.tilawah_user_id)] = r.user_code;
  }

  return { ...hasil, syncedAt: synced, kodePeserta };
}

/**
 * Program punya NILAI untuk tab Hasil Ujian: ada skor pada sesi (tak dihapus) atau
 * rapot aktif di halaqah batch ini di Evaluasi Halaqah Maahir, atau ada pertemuan
 * bertanda ujian di CMS tilawah. Halaqah tanpa nilai TIDAK cukup — RBI punya 11
 * halaqah di modul itu tapi nol nilai, dan tab kosong hanya membuat orang mencari.
 *
 * Dipanggil layout di setiap navigasi; jawabannya hanya berubah saat sinkron, jadi
 * disimpan 10 menit per program di memori proses (~30 ms per query tanpa cache).
 */
const CACHE_HASIL_UJIAN_MS = 10 * 60_000;
const cacheHasilUjian = new Map<string, { ada: boolean; at: number }>();

export async function punyaHasilUjian(slug: string, programId: string): Promise<boolean> {
  const hit = cacheHasilUjian.get(programId);
  if (hit && Date.now() - hit.at < CACHE_HASIL_UJIAN_MS) return hit.ada;
  const res = await getDb().execute(sql`
    select exists (
      select 1 from maahir_sync h
        join maahir_sync s on s.program_id = h.program_id and s.entity = 'evaluasi/sesi'
         and s.raw->>'halaqah_id' = h.raw->>'id' and coalesce((s.raw->>'dihapus')::boolean, false) = false
        join maahir_sync n on n.program_id = h.program_id and n.entity = 'evaluasi/nilai'
         and n.raw->>'sesi_id' = s.raw->>'id' and n.raw->>'skor' is not null
       where h.entity = 'evaluasi/halaqah' and h.raw->>'batch_id' = ${slug}
    ) or exists (
      select 1 from maahir_sync h
        join maahir_sync r on r.program_id = h.program_id and r.entity = 'evaluasi/rapot'
         and r.raw->>'halaqah_id' = h.raw->>'id' and r.raw->>'status' = 'aktif'
       where h.entity = 'evaluasi/halaqah' and h.raw->>'batch_id' = ${slug}
    ) or exists (
      select 1 from jadwal_sync j where j.program_id = ${programId} and j.raw->>'type_pertemuan' = 'ujian'
    ) as ada
  `);
  const ada = Boolean((res.rows[0] as { ada?: boolean } | undefined)?.ada);
  cacheHasilUjian.set(programId, { ada, at: Date.now() });
  return ada;
}
