/**
 * The Maahir entities the dashboard mirrors, and HOW each is pulled. Scopes
 * `maahir`, `hits`, `penilaian`, `evaluasi` + the 4 person-reference entities
 * (readable by any valid key). `shakwa` is intentionally excluded for v1.
 *
 * `strategy` decides the request shape each sync run (docs §5):
 *   - "full"  — small/reference table; full pull, ETag/304 makes an unchanged
 *               one near-free. Params don't vary run to run.
 *   - "sejak" — has `updated_at`; send `sejak=<high-water>` to fetch only changed
 *               rows. Dedup by id on our side.
 *   - "date"  — dated table without `updated_at`; pull a rolling window
 *               [tanggal_dari, tanggal_sampai]. First run pulls from FIRST_DATE.
 *
 * `idKey` is the upstream field that uniquely identifies a row — `id` for all but
 * `indikator-standar`, which is keyed by `kode`.
 */
export type MaahirStrategy = "full" | "sejak" | "date";

export type MaahirEntity = {
  /** stored `entity` value + API path segment (e.g. "hits/pengajar") */
  path: string;
  scope: "maahir" | "hits" | "penilaian" | "evaluasi" | "ref";
  strategy: MaahirStrategy;
  idKey?: string; // default "id"
};

/** First-run lower bound for date-window pulls. */
export const FIRST_DATE = "2024-01-01";

export const MAAHIR_ENTITIES: MaahirEntity[] = [
  // ── scope: maahir (13) ─────────────────────────────────────────────────
  { path: "program-kelas", scope: "maahir", strategy: "full" },
  { path: "anggota", scope: "maahir", strategy: "full" },
  { path: "pertemuan", scope: "maahir", strategy: "date" },
  { path: "kehadiran", scope: "maahir", strategy: "sejak" },
  { path: "libur", scope: "maahir", strategy: "date" },
  { path: "pemutihan", scope: "maahir", strategy: "full" },
  { path: "laporan-note", scope: "maahir", strategy: "full" },
  { path: "peserta", scope: "maahir", strategy: "full" },
  { path: "kelas", scope: "maahir", strategy: "full" },
  { path: "setoran", scope: "maahir", strategy: "date" },
  { path: "rekaman", scope: "maahir", strategy: "full" },
  { path: "setoran-musyrif", scope: "maahir", strategy: "date" },
  { path: "rekaman-musyrif", scope: "maahir", strategy: "full" },

  // ── scope: hits (14) ───────────────────────────────────────────────────
  { path: "hits/batch", scope: "hits", strategy: "full" },
  { path: "hits/halaqah", scope: "hits", strategy: "full" },
  { path: "hits/halaqah-peserta", scope: "hits", strategy: "full" },
  { path: "hits/kaldik-hari", scope: "hits", strategy: "date" },
  { path: "hits/kaldik-pertemuan", scope: "hits", strategy: "full" },
  { path: "hits/keterangan-harian", scope: "hits", strategy: "date" },
  { path: "hits/pelanggaran", scope: "hits", strategy: "full" },
  { path: "hits/hutang-bayar", scope: "hits", strategy: "date" },
  { path: "hits/teguran", scope: "hits", strategy: "full" },
  { path: "hits/tabayyun", scope: "hits", strategy: "full" },
  { path: "hits/kajian-presensi", scope: "hits", strategy: "date" },
  { path: "hits/kajian-libur", scope: "hits", strategy: "date" },
  { path: "hits/pengajar", scope: "hits", strategy: "full" },
  { path: "hits/kelompok-pengajar", scope: "hits", strategy: "full" },

  // ── scope: penilaian (5) ───────────────────────────────────────────────
  { path: "penilaian-peserta", scope: "penilaian", strategy: "sejak" },
  { path: "penilaian-masyaikh", scope: "penilaian", strategy: "sejak" },
  { path: "penilaian-pedagogis", scope: "penilaian", strategy: "sejak" },
  { path: "matrix-rekap", scope: "penilaian", strategy: "sejak" },
  { path: "indikator-standar", scope: "penilaian", strategy: "full", idKey: "kode" },

  // ── scope: evaluasi (7) — Evaluasi Halaqah: nilai per sesi & rapot PESERTA ──
  // Ids are `<program slug>:<tilawah id>` (or `manual:…`), so they join straight
  // onto the tilawah programs; lib/insights/evaluasi/maahir.ts reads them.
  // `rapot` stays "full": its `sejak` filters on diterbitkan_at, so a rapot
  // that is later dicabut/digantikan would never be re-pulled incrementally.
  { path: "evaluasi/batch", scope: "evaluasi", strategy: "full" },
  { path: "evaluasi/pengajar", scope: "evaluasi", strategy: "full" },
  { path: "evaluasi/halaqah", scope: "evaluasi", strategy: "full" },
  { path: "evaluasi/peserta", scope: "evaluasi", strategy: "full" },
  { path: "evaluasi/sesi", scope: "evaluasi", strategy: "sejak" },
  { path: "evaluasi/nilai", scope: "evaluasi", strategy: "sejak" },
  { path: "evaluasi/rapot", scope: "evaluasi", strategy: "full" },

  // ── person references (4 — any valid key) ──────────────────────────────
  { path: "musyrif", scope: "ref", strategy: "full" },
  { path: "koordinator", scope: "ref", strategy: "full" },
  { path: "syaikh", scope: "ref", strategy: "full" },
  { path: "koordinator-ketua-kelas", scope: "ref", strategy: "full" },
];
