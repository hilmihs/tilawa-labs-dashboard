/**
 * Gabungkan baris export setoran the partner system yang jatuh di hari yang sama untuk satu
 * peserta menjadi SATU baris harian.
 *
 * Kenapa perlu: export `/api/users/report` mengeluarkan satu baris per *target
 * khatam*, bukan per hari. Satu hari bisa punya beberapa baris, dan bentuknya
 * ada tiga:
 *
 *   A. lanjutan asli — peserta menamatkan khatam lalu langsung memulai khatam
 *      berikutnya di hari yang sama (h604 → h1 → h5), atau menyetor dua sesi
 *      berurutan. Halamannya NYATA dan harus dijumlahkan.
 *   B. duplikat persis — rentang halaman sama diulang dengan nomor khatam naik.
 *      Kalau dijumlahkan jadi dobel.
 *   C. baris kumulatif — rentangnya mundur jauh ke awal khatam (h23 → h259)
 *      alias rekap progres, bukan bacaan hari itu. Kalau dijumlahkan jadi
 *      membengkak ratusan halaman.
 *
 * Perilaku lama (dedup keep-first, warisan app_hkm.py) membuang B dan C dengan
 * benar, tapi ikut membuang A. Diukur atas export 31 Mar–28 Agu 2026: 317 baris
 * / 4.165 halaman kategori A hilang, terkonsentrasi pada peserta yang khatam
 * lalu lanjut di hari yang sama — persis kasus "sudah khatam tapi di aplikasi
 * tercatat belum capai target".
 *
 * Aturan terima: baris ke-2+ diterima kalau rentang halamannya BELUM pernah
 * muncul hari itu DAN mulai di titik peserta berhenti terakhir (`fromPage >=
 * prevToPage`) atau membalik dari akhir mushaf ke awal (wrap 604 → 1).
 * Selain itu ditolak.
 *
 * `toPage` hasil gabung memakai NILAI TERTINGGI hari itu, bukan yang terakhir,
 * supaya khatam yang tuntas di tengah hari (mencapai h604 lalu mulai lagi dari
 * h1) tetap terbaca oleh detektor khatam di lib/insights/hkm/cumulative.ts.
 */

/** Bentuk minimum yang dibutuhkan penggabung; `BerkahExportRow` memenuhinya. */
export type DailyMergeRow = {
  userId?: number | null;
  email?: string | null;
  tanggal?: string | null;
  fromPage?: number | null;
  toPage?: number | null;
  totalPages?: number | null;
};

/** Ambang wrap: berhenti di ujung mushaf lalu mulai lagi dari halaman awal. */
const WRAP_FROM_PAGE = 570;
const WRAP_TO_PAGE = 5;

const n = (v: number | null | undefined) => Number(v) || 0;

/** Apakah `row` bacaan lanjutan yang nyata, bukan duplikat/rekap kumulatif? */
function isContinuation(row: DailyMergeRow, prevToPage: number, seenRanges: Set<string>): boolean {
  const from = n(row.fromPage);
  const to = n(row.toPage);
  if (seenRanges.has(`${from}-${to}`)) return false; // B: duplikat persis
  if (prevToPage >= WRAP_FROM_PAGE && from <= WRAP_TO_PAGE) return true; // A: wrap khatam
  return from >= prevToPage; // A kalau maju, C kalau mundur
}

export type MergedDaily<T extends DailyMergeRow> = {
  /** Baris pertama hari itu — dipakai sebagai basis (identitas, surah awal). */
  first: T;
  /** Baris terakhir yang DITERIMA — surah/ayat/juz akhir hari itu. */
  last: T;
  /** Jumlah halaman semua baris yang diterima. */
  totalPages: number;
  /** Halaman tertinggi yang dicapai hari itu (lihat catatan khatam di atas). */
  toPage: number;
  /** Berapa baris tambahan yang ikut dihitung (0 = hari biasa satu baris). */
  extraRowsMerged: number;
  /** Berapa baris ditolak sebagai duplikat/kumulatif. */
  rowsRejected: number;
};

/**
 * Gabung satu grup baris yang SUDAH pasti milik (peserta, tanggal) yang sama.
 * Urutan input dianggap urutan export (menaik menurut nomor target khatam).
 */
export function mergeDailyGroup<T extends DailyMergeRow>(rows: T[]): MergedDaily<T> {
  const first = rows[0];
  let totalPages = n(first.totalPages);
  let maxToPage = n(first.toPage);
  let prevToPage = n(first.toPage);
  let last = first;
  let extraRowsMerged = 0;
  let rowsRejected = 0;
  const seenRanges = new Set<string>([`${n(first.fromPage)}-${n(first.toPage)}`]);

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isContinuation(row, prevToPage, seenRanges)) {
      rowsRejected += 1;
      continue;
    }
    totalPages += n(row.totalPages);
    maxToPage = Math.max(maxToPage, n(row.toPage));
    prevToPage = n(row.toPage);
    seenRanges.add(`${n(row.fromPage)}-${n(row.toPage)}`);
    last = row;
    extraRowsMerged += 1;
  }

  return { first, last, totalPages, toPage: maxToPage, extraRowsMerged, rowsRejected };
}

/**
 * Kelompokkan seluruh export menurut (peserta, tanggal) lalu gabung tiap grup.
 * Kunci peserta = `userId` kalau ada, kalau tidak `email` — sama seperti kunci
 * dedup lama, supaya perilaku baris yang tak punya userId tak berubah.
 * Baris tanpa tanggal dibuang (tak bisa ditempatkan di kalender mana pun).
 * Urutan keluaran mengikuti kemunculan pertama tiap grup di export.
 */
export function mergeDailyReadings<T extends DailyMergeRow>(rows: T[]): MergedDaily<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.tanggal) continue;
    const who = row.userId != null ? String(row.userId) : (row.email ?? "?");
    const key = `${who}|${row.tanggal}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].map(mergeDailyGroup);
}
