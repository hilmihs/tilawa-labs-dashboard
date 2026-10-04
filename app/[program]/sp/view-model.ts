/**
 * Pemetaan payload `rekap/sp` → baris siap render. Fungsi murni; diuji dengan
 * fixture asli `lib/maahir/__fixtures__/sp.json`.
 *
 * Yang paling gampang salah di layar ini ada tiga:
 *
 * 1. **`sp` ≠ `spKotor`.** `spKotor` adalah level SP sebelum pemutihan, `sp`
 *    sesudahnya. Di tangkapan asli lima orang berbeda antara keduanya, tiga di
 *    antaranya turun sampai `sp: 0` — masih terdaftar, tapi SP-nya sudah putih.
 *    Menampilkan satu kolom saja membuat pembaca menagih orang yang sudah bersih
 *    (atau sebaliknya, mengira riwayatnya tidak pernah ada).
 * 2. **Kumulatif, bukan bulanan.** `perBulan: false`, dihitung sejak `mulai`
 *    (awal program) sampai `cutoff`. Blok SP di `/[program]/dashboard` berasal
 *    dari `rekap/laporan-maahir` dan `perBulan: true` — hanya jendela 28→27
 *    bulan itu. Dua angka ini TIDAK BOLEH diadu; docs §9.
 * 3. **Angka ringkasan milik upstream.** `summary` dipakai apa adanya, tidak
 *    dihitung ulang dari `list` — pemutihan mengubah persen jadi 100 dan aturan
 *    itu tinggal di Maahir, bukan di sini. `summary.total` (79 di tangkapan)
 *    hanya menghitung yang SP-nya masih ≥ 1, sedangkan `list` berisi 82 baris
 *    karena tiga orang yang sudah diputihkan tetap ikut.
 */
import type { MaahirSpPayload, MaahirSpPenetapan, MaahirSpRow } from "@/lib/maahir/types";
import { jakartaDate, jamWib } from "@/lib/time/jakarta";

// ── Tanggal (string in, string out — tanpa Date, tanpa timezone) ────────────

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/**
 * "2026-09-03" → "3 Sep 2026". Sengaja tidak lewat `new Date(iso)`: itu dibaca
 * sebagai tengah malam UTC dan tercetak mundur sehari untuk siapa pun di barat
 * UTC — dan `cutoff` yang meleset sehari mengubah arti seluruh daftar ini.
 */
export function formatTanggal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const bulan = Number(m[2]);
  if (bulan < 1 || bulan > 12) return iso;
  return `${Number(m[3])} ${BULAN_PENDEK[bulan - 1]} ${m[1]}`;
}

/** Cap "terakhir ditarik" dari `maahir_rekap.fetched_at`: jam WIB + tanggal.
 *  Halaman tetap tampil dengan angka lama saat sync terakhir gagal, jadi cap
 *  ini yang memberi tahu seberapa lama angkanya sudah menganggur. */
export function fetchedLabel(at: Date): string {
  return `${jamWib(at)} WIB · ${formatTanggal(jakartaDate(at))}`;
}

export type SpBaris = MaahirSpRow & {
  /** Banyak catatan pemutihan yang menempel di baris ini. */
  pemutihan: number;
  /** `sp` lebih rendah dari `spKotor` — SP-nya sudah diputihkan sebagian/penuh. */
  turunKarenaPemutihan: boolean;
  /** Penetapan SP terakhir (level tertinggi/terbaru), untuk kolom "sejak kapan". */
  penetapanTerakhir: MaahirSpPenetapan | null;
};

export type SpFilter = "semua" | "sp3" | "sp2" | "sp1" | "diputihkan";

export const SP_FILTER_LABEL: Record<SpFilter, string> = {
  semua: "Semua",
  sp3: "SP 3",
  sp2: "SP 2",
  sp1: "SP 1",
  diputihkan: "Diputihkan",
};

/** SP tertinggi duluan; yang setara diurutkan dari alpa terbanyak. */
export function spRows(list: MaahirSpRow[]): SpBaris[] {
  return [...list]
    .map((r) => ({
      ...r,
      pemutihan: r.diputihkan?.length ?? 0,
      turunKarenaPemutihan: r.sp < r.spKotor,
      penetapanTerakhir: penetapanTerakhir(r.penetapan),
    }))
    .sort(
      (a, b) =>
        b.sp - a.sp ||
        b.spKotor - a.spKotor ||
        b.alpa - a.alpa ||
        a.name.localeCompare(b.name, "id"),
    );
}

/** Level tertinggi; kalau selevel, tanggal terakhir yang menang. */
function penetapanTerakhir(list: MaahirSpPenetapan[]): MaahirSpPenetapan | null {
  if (!list?.length) return null;
  return [...list].sort((a, b) => b.level - a.level || b.tanggal.localeCompare(a.tanggal))[0];
}

/** Saring tampilan saja — tidak ada angka yang dihitung ulang. `diputihkan`
 *  memotong silang level, jadi ia berdiri sendiri, bukan "SP 0". */
export function filterSpRows(rows: SpBaris[], filter: SpFilter): SpBaris[] {
  switch (filter) {
    case "sp3":
      return rows.filter((r) => r.sp === 3);
    case "sp2":
      return rows.filter((r) => r.sp === 2);
    case "sp1":
      return rows.filter((r) => r.sp === 1);
    case "diputihkan":
      return rows.filter((r) => r.pemutihan > 0);
    default:
      return rows;
  }
}

/**
 * Label rentang kumulatif, dari `mulai` dan `cutoff` di payload — dua tanggal
 * yang HARUS ikut tampil, karena tanpa keduanya angka SP ini tidak bisa
 * dibedakan dari blok SP bulanan di /dashboard.
 */
export function cutoffLabel(payload: Pick<MaahirSpPayload, "mulai" | "cutoff">): string {
  return `${formatTanggal(payload.mulai)} – ${formatTanggal(payload.cutoff)}`;
}
