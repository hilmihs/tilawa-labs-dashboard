/**
 * `rekap/matrix-guru` → tab "Matrix skill" di halaman pengajar.
 *
 * Empat hal yang membentuk modul ini, semuanya cara layar ini bisa berbohong
 * kalau tidak dijaga:
 *
 * 1. **Route-nya menjawab untuk SELURUH HITS sekaligus.** Tangkapan 3 Sep 2026
 *    berisi 178 pengajar dari delapan batch. Satu koordinator memegang satu
 *    batch, jadi baris disaring lewat `pengajar_id` yang punya halaqah di batch
 *    pin program — kalau tidak, tiap koordinator membuka tabel 178 baris yang
 *    sama.
 * 2. **`null` bukan 0.** Di tangkapan yang sama `skor_hafalan` null pada 177 dari
 *    178 pengajar dan `skor_metode_pengajaran` null pada 173. Itu artinya "belum
 *    dinilai", bukan "nilainya nol". Merender 0 di sana menuduh seluruh angkatan
 *    gagal total. Karena itu semua skor di sini tetap `number | null` dan
 *    `formatSkor` mengembalikan tanda pisah, bukan angka.
 * 3. **Rata-rata per kategori TIDAK dihitung ulang.** `rata_rata_hard_skill`,
 *    `rata_rata_pedagogis`, `rata_rata_soft_skill`, `rata_rata_keseluruhan`
 *    datang jadi dari upstream (docs/API-PUBLIC.md §9). Satu-satunya rata-rata
 *    yang dihitung di sini adalah rata-rata antar-pengajar untuk KPI, dan itu
 *    agregat tampilan, bukan aturan bisnis — labelnya menyebut berapa orang yang
 *    ikut dihitung.
 * 4. **Skor tidak ter-batch.** Berbeda dengan halaqah, matrix dinilai per ORANG
 *    (kehadiran Maahir/Tibyan, kepatuhan SOP, dst). Jadi baris yang lolos filter
 *    tetap membawa penilaian dari seluruh aktivitas pengajar itu, dan `ranking`
 *    adalah peringkat lintas seluruh HITS — bukan peringkat di dalam batch.
 *    Layar menyatakan itu, tidak menyiratkan sebaliknya.
 */
import type { StatusTone } from "@/lib/ui/status";
import type { MaahirMatrixPayload, MaahirMatrixSkor } from "@/lib/maahir/types";

/** Satu pengajar batch ini pada snapshot bulan yang dibuka. */
export type MatrixRow = {
  pengajarId: string;
  nama: string;
  /** "Kelompok 4 Ikhwan" | "Belum Ada Kelompok (Akhwat)" — apa adanya dari upstream. */
  kelompok: string;
  gender: "ikhwan" | "akhwat";
  /** false = pengajar sudah dinonaktifkan di Maahir tapi masih di snapshot. */
  active: boolean;
  /** Halaqah yang diampu DI BATCH INI (dari mirror `hits/halaqah`). */
  halaqahDiBatch: number;
  /** Baris snapshot mentah, atau null bila pengajar ini tidak punya baris bulan itu. */
  skor: MaahirMatrixSkor | null;
  /** Peringkat lintas seluruh HITS, bukan di dalam batch. Null = tidak diperingkat. */
  ranking: number | null;
  rataHard: number | null;
  rataPedagogis: number | null;
  rataSoft: number | null;
  rataKeseluruhan: number | null;
  teguranBulan: number | null;
  teguranKumulatif: number | null;
  /** Tidak ada nilai keseluruhan yang bisa ditampilkan untuk bulan itu. */
  belumDinilai: boolean;
};

export type MatrixRingkas = {
  /** Pengajar batch ini yang muncul di snapshot. */
  pengajar: number;
  dinilai: number;
  belumDinilai: number;
  /** Rata-rata `rata_rata_keseluruhan` antar pengajar yang dinilai; null bila nol orang. */
  rataProgram: number | null;
  teguranBulan: number;
  teguranKumulatif: number;
  /** Pengajar batch ini yang namanya tidak ada sama sekali di snapshot. Bukan nol
   *  nilai — mereka memang tidak ikut dipotret, jadi dihitung terpisah. */
  tidakDiSnapshot: number;
};

export type MatrixView = {
  rows: MatrixRow[];
  ringkas: MatrixRingkas;
  /** Jumlah pengajar di snapshot upstream seluruhnya — konteks untuk `ranking`. */
  totalUpstream: number;
};

const EMPTY_VIEW: MatrixView = {
  rows: [],
  ringkas: {
    pengajar: 0,
    dinilai: 0,
    belumDinilai: 0,
    rataProgram: null,
    teguranBulan: 0,
    teguranKumulatif: 0,
    tidakDiSnapshot: 0,
  },
  totalUpstream: 0,
};

/** Rata-rata yang MENGABAIKAN null, dan mengembalikan null (bukan 0) bila tidak
 *  ada satu pun angka. Dipakai hanya untuk agregat antar-pengajar. */
export function rataRata(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Bangun baris tab matrix untuk satu program.
 *
 * `halaqahPerPengajar` = jumlah halaqah batch pin per `pengajar_id`, dari mirror
 * `hits/halaqah`. Map KOSONG menghasilkan view kosong dengan sengaja: "kami
 * tidak tahu pengajar mana milik Anda" tidak boleh jatuh ke "tampilkan semua",
 * yang justru membuat koordinator melihat 178 baris milik orang lain.
 */
export function buildMatrixView(
  payload: MaahirMatrixPayload | null | undefined,
  halaqahPerPengajar: ReadonlyMap<string, number>,
): MatrixView {
  const semua = payload?.pengajar ?? [];
  if (semua.length === 0 || halaqahPerPengajar.size === 0) {
    return { ...EMPTY_VIEW, totalUpstream: semua.length };
  }

  const rows: MatrixRow[] = [];
  for (const p of semua) {
    const halaqah = halaqahPerPengajar.get(p.pengajar_id);
    if (halaqah === undefined) continue;
    const m = p.matrix;
    rows.push({
      pengajarId: p.pengajar_id,
      nama: p.nama,
      kelompok: p.kelompok,
      gender: p.gender,
      active: p.active,
      halaqahDiBatch: halaqah,
      skor: m,
      ranking: m?.ranking ?? null,
      rataHard: m?.rata_rata_hard_skill ?? null,
      rataPedagogis: m?.rata_rata_pedagogis ?? null,
      rataSoft: m?.rata_rata_soft_skill ?? null,
      rataKeseluruhan: m?.rata_rata_keseluruhan ?? null,
      // Teguran adalah cacahan, bukan skor: 0 di sini benar-benar berarti nol
      // teguran. Yang null hanyalah pengajar tanpa baris snapshot sama sekali.
      teguranBulan: m ? m.total_teguran_bulan : null,
      teguranKumulatif: m ? m.total_teguran_kumulatif : null,
      belumDinilai: m == null || m.rata_rata_keseluruhan == null,
    });
  }

  const dinilai = rows.filter((r) => !r.belumDinilai);
  return {
    rows,
    ringkas: {
      pengajar: rows.length,
      dinilai: dinilai.length,
      belumDinilai: rows.length - dinilai.length,
      rataProgram: rataRata(dinilai.map((r) => r.rataKeseluruhan)),
      teguranBulan: rows.reduce((n, r) => n + (r.teguranBulan ?? 0), 0),
      teguranKumulatif: rows.reduce((n, r) => n + (r.teguranKumulatif ?? 0), 0),
      tidakDiSnapshot: halaqahPerPengajar.size - rows.length,
    },
    totalUpstream: semua.length,
  };
}

// ── Komponen skor ───────────────────────────────────────────────────────────

export type KomponenSkor = {
  key: keyof MaahirMatrixSkor;
  label: string;
};

export type KelompokKomponen = {
  judul: string;
  /** Field rata-rata milik upstream untuk kelompok ini — tidak dihitung ulang. */
  rata: keyof MaahirMatrixSkor;
  komponen: KomponenSkor[];
};

/**
 * Susunan kolom rapor sesuai kelompok di payload. Urutan dan penamaannya
 * mengikuti nama field upstream; tidak ada komponen yang dikarang, dan yang
 * selalu null di tangkapan (hafalan, kehadiran muallim, metode pengajaran) tetap
 * ditampilkan supaya jelas mana yang belum pernah diisi Maahir.
 */
export const KELOMPOK_KOMPONEN: KelompokKomponen[] = [
  {
    judul: "Hard skill",
    rata: "rata_rata_hard_skill",
    komponen: [
      { key: "skor_bacaan", label: "Bacaan" },
      { key: "skor_hafalan", label: "Hafalan" },
      { key: "skor_tajwid", label: "Tajwid" },
      { key: "skor_kehadiran_maahir", label: "Kehadiran Maahir" },
      { key: "skor_kehadiran_tibyan", label: "Kehadiran At-Tibyan" },
      { key: "skor_kehadiran_muallim", label: "Kehadiran Muallim" },
    ],
  },
  {
    judul: "Pedagogis",
    rata: "rata_rata_pedagogis",
    komponen: [
      { key: "skor_metode_pengajaran", label: "Metode pengajaran" },
      { key: "skor_kepatuhan_silabus", label: "Kepatuhan silabus" },
      { key: "skor_manajemen_halaqah", label: "Manajemen halaqah" },
      { key: "skor_evaluasi_penguasaan", label: "Evaluasi penguasaan" },
    ],
  },
  {
    judul: "Soft skill",
    rata: "rata_rata_soft_skill",
    komponen: [
      { key: "skor_kedisiplinan_waktu", label: "Kedisiplinan waktu" },
      { key: "skor_komitmen_jadwal", label: "Komitmen jadwal" },
      { key: "skor_tanggung_jawab", label: "Tanggung jawab" },
      { key: "skor_kepatuhan_sop", label: "Kepatuhan SOP" },
    ],
  },
];

/** Ambil satu komponen sebagai angka — apa pun selain number jadi null, jadi
 *  field teks (`updated_at`, `year_month`) tidak pernah tersaji sebagai skor. */
export function nilaiKomponen(
  skor: MaahirMatrixSkor | null | undefined,
  key: keyof MaahirMatrixSkor,
): number | null {
  const v = skor?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ── Format ──────────────────────────────────────────────────────────────────

/** Skor 0–4 dengan satu desimal; null jadi tanda pisah, TIDAK PERNAH "0.0". */
export function formatSkor(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) : "—";
}

/**
 * Warna pil untuk skala 0–4 milik Maahir. `null` sengaja netral (abu-abu):
 * belum dinilai bukan kabar buruk, dan mewarnainya merah akan terbaca sebagai
 * nilai jelek.
 */
export function skorTone(n: number | null | undefined): StatusTone {
  if (typeof n !== "number" || !Number.isFinite(n)) return "neutral";
  if (n >= 3.5) return "success";
  if (n >= 2.5) return "info";
  if (n >= 1.5) return "warning";
  return "danger";
}

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Label pemilih bulan saja ("Agustus 2026"). Periode yang dicakup angkanya
 *  tetap datang dari `periodLabel(meta)`, bukan dari sini. */
export function labelBulan(bulan: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(bulan);
  if (!m) return bulan;
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${BULAN_PANJANG[idx]} ${m[1]}` : bulan;
}

/**
 * "3 Sep 15:12 WIB (2 jam lalu)" — umur data selalu terlihat, karena halaman ini
 * harus tetap terpakai di atas data lama ketika upstream sedang mati.
 * `now` disuntikkan supaya bisa diuji tanpa jam sistem.
 */
export function ditarikLabel(at: Date, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - at.getTime()) / 60000);
  const rel =
    mins < 1
      ? "barusan"
      : mins < 60
        ? `${mins} menit lalu`
        : mins < 60 * 24
          ? `${Math.floor(mins / 60)} jam lalu`
          : `${Math.floor(mins / 1440)} hari lalu`;
  const stamp = at.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  return `${stamp} WIB (${rel})`;
}

/** Tanggal snapshot: "1 Sep 2026". Dipotong dari string ISO, bukan lewat
 *  `new Date(...)` yang menggeser tanggal untuk zona di barat UTC. */
export function tanggalSnapshot(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return null;
  return `${Number(m[3])} ${BULAN_PENDEK[idx]} ${m[1]}`;
}
