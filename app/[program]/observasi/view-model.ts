/**
 * `hits/keterangan-harian` (+ its children) → baris siap render.
 *
 * Modul MURNI: tanpa DB, tanpa `next/*`. Semua yang datang dari luar sudah
 * dibaca di `queries.ts`; di sini hanya penggabungan dan pengurutan.
 *
 * Tiga hal yang dijaga modul ini, semuanya cara layar ini bisa berbohong:
 *
 * 1. **Tidak ada angka turunan.** `docs/API-PUBLIC.md` §9 melarang menurunkan
 *    ulang angka rekap dari entitas mentah — tujuh aturan bisnis (sesi sakit
 *    yang keluar dari penyebut, pemutihan yang memaksa 100%, peserta yang masuk
 *    di tengah periode, dan dua definisi "bulan" yang berbeda) tinggal di
 *    Maahir. Jadi di sini tidak ada persen, rata-rata, peringkat, atau skor.
 *    Yang ada hanya **cacah baris yang sedang dirender** — itu panjang daftar,
 *    bukan metrik. Angka disiplin resmi tetap di `/[program]/disiplin`.
 * 2. **Kosong bukan nol.** `status_latihan` null pada ~6% baris dan `menit`
 *    kerap null; keduanya harus tercetak em dash, tidak pernah 0. Karena itu
 *    {@link jumlahMenit} mengembalikan `null` (bukan 0) ketika tidak ada satu
 *    pun nilai menit yang terisi.
 * 3. **Nilai enum yang belum dikenal harus lolos apa adanya.** Daftar nilai di
 *    `lib/maahir/entities.ts` dibaca dari cermin hidup, bukan dari dokumentasi.
 *    Nilai baru yang muncul besok harus tampil sebagai dirinya sendiri, tidak
 *    dipetakan ke "lainnya" dan tidak dibuang.
 *
 * Catatan tanggal: `tanggal` adalah `YYYY-MM-DD` polos dan diperlakukan sebagai
 * string dari ujung ke ujung. `created_at` sengaja TIDAK dipakai untuk
 * mengurutkan: baris Januari/April di-backfill 21 Juni 2026, jadi cap itu bukan
 * waktu kejadian.
 */
import type {
  MaahirHitsHalaqah,
  MaahirHitsPengajar,
  MaahirHutangBayar,
  MaahirKeteranganHarian,
  MaahirPelanggaran,
  MaahirTabayyun,
} from "@/lib/maahir/entities";
import type { StatusTone } from "@/lib/ui/status";

// ── Tanggal (string masuk, string keluar) ──────────────────────────────────

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/**
 * "2026-08-24" → "24 Agu". Sengaja tidak lewat `new Date(iso)`: string tanggal
 * polos dibaca sebagai tengah malam UTC dan tercetak mundur sehari untuk siapa
 * pun di barat UTC — persis jebakan yang dicatat di
 * `app/[program]/sp/view-model.ts`.
 */
export function tanggalPendek(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${Number(m[3])} ${BULAN_PENDEK[idx]}`;
}

/** "2026-08-24" → "24 Agustus 2026". Sama: tanpa `Date`. */
export function tanggalPanjang(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${Number(m[3])} ${BULAN_PANJANG[idx]} ${m[1]}`;
}

/** `deadline_at` adalah timestamp ISO penuh; hanya bagian tanggalnya yang dipakai. */
export function tanggalDariStamp(stamp: string | null): string {
  return stamp ? tanggalPendek(stamp.slice(0, 10)) : "—";
}

// ── Kosakata enum ──────────────────────────────────────────────────────────

/**
 * Kepanjangan yang BENAR-BENAR diketahui, tidak lebih.
 *
 * KBBS memakai rumusan yang sudah dipakai layar Disiplin ("Kelas Berjalan Baik
 * & Sesuai"); JKG dan KMT terbaca dari UI Maahir. KBLA, TIDAK_LATIHAN, dan
 * BADAL tidak punya kepanjangan yang terkonfirmasi, jadi tidak dikarang di sini
 * — kodenya tampil telanjang tanpa tooltip.
 */
const KEPANJANGAN: Record<string, string> = {
  KBBS: "Kelas Berjalan Baik & Sesuai",
  JKG: "Jadwal Kelas Ganti",
  KMT: "Kelas Mulai Terlambat (>5 menit)",
  LIBUR: "Libur",
};

/** Tooltip untuk sebuah kode, atau `null` kalau kepanjangannya tidak diketahui. */
export function kodeHint(kode: string | null): string | null {
  return kode ? (KEPANJANGAN[kode] ?? null) : null;
}

/**
 * Warna pil untuk `kondisi`. Ini pengelompokan tampilan, bukan skor: KBBS hijau
 * karena upstream memakainya sebagai "kelas berjalan baik", KMT/KBLA/JKG kuning
 * karena upstream sendiri menerbitkan pelanggaran dari ketiganya, LIBUR netral.
 * Nilai yang belum dikenal ikut netral — tidak boleh ditebak parah/tidaknya.
 */
export function kondisiTone(kondisi: string | null): StatusTone {
  switch (kondisi) {
    case "KBBS":
      return "success";
    case "KMT":
    case "KBLA":
    case "JKG":
      return "warning";
    default:
      return "neutral";
  }
}

/** `pending`/`awaiting_reason` masih menunggu orang; `decided` sudah selesai. */
export function tabayyunTone(status: string | null): StatusTone {
  return status === "decided" ? "info" : status == null ? "neutral" : "warning";
}

/** Tabayyun yang belum diputus — dipakai sebagai penanda baris, bukan sebagai skor. */
export function tabayyunTerbuka(t: Pick<MaahirTabayyun, "status">): boolean {
  return t.status !== "decided";
}

// ── Bentuk baris ───────────────────────────────────────────────────────────

/** Halaqah dashboard yang ditunjuk sebuah baris, hasil `matchHalaqah()`. */
export type TautanHalaqah = {
  /** `halaqah_sync.tilawah_halaqah_id` — route detail memakai id NUMERIK ini. */
  tilawahHalaqahId: number;
};

export type ObservasiSumber = {
  keterangan: MaahirKeteranganHarian[];
  pelanggaran: MaahirPelanggaran[];
  tabayyun: MaahirTabayyun[];
  hutang: MaahirHutangBayar[];
  halaqah: Pick<MaahirHitsHalaqah, "id" | "name" | "gender" | "pengajar_id" | "level">[];
  pengajar: Pick<MaahirHitsPengajar, "id" | "name">[];
  /**
   * Maahir halaqah id → halaqah dashboard. Hanya berisi yang cocok; yang tidak
   * cocok atau ambigu tidak ada di sini dan barisnya tetap tampil sebagai teks
   * biasa (lihat header `lib/maahir/name-match.ts`).
   */
  tautan?: Record<string, TautanHalaqah>;
};

export type ObservasiBaris = {
  id: string;
  /** `YYYY-MM-DD` apa adanya — sumbu waktu satu-satunya di layar ini. */
  tanggal: string;
  halaqahId: string;
  /** `null` kalau halaqah-nya tidak ada di cermin `hits/halaqah`. */
  halaqahNama: string | null;
  halaqahGender: string | null;
  /** Id numerik untuk deep link ke `/[program]/halaqah/[id]`; `null` = tampil teks biasa. */
  tilawahHalaqahId: number | null;
  pengajarNama: string | null;
  level: string | null;
  pertemuanNo: number | null;
  kondisi: string | null;
  statusLatihan: string | null;
  pelanggaran: MaahirPelanggaran[];
  tabayyun: MaahirTabayyun[];
  hutang: MaahirHutangBayar[];
  /** Jumlah menit hutang-bayar. `null` bila tidak ada baris bermenit — bukan 0. */
  menitHutang: number | null;
  /** Jumlah menit yang menempel pada pelanggaran. `null` bila tidak ada — bukan 0. */
  menitPelanggaran: number | null;
  /** Ada pelanggaran ATAU tabayyun — penanda saringan, bukan penilaian. */
  adaTindakLanjut: boolean;
};

export type ObservasiKelompok = {
  halaqahId: string;
  halaqahNama: string | null;
  tilawahHalaqahId: number | null;
  pengajarNama: string | null;
  baris: ObservasiBaris[];
};

/**
 * Cacah baris MENTAH yang sedang dirender. Bukan angka rekap: tidak ada
 * penyebut, tidak ada persen, dan angkanya tidak boleh diadu dengan tab
 * Disiplin.
 */
export type ObservasiRingkas = {
  keterangan: number;
  pelanggaran: number;
  tabayyun: number;
  tabayyunBelumDiputus: number;
  hutang: number;
  halaqah: number;
};

export type ObservasiView = {
  baris: ObservasiBaris[];
  perHalaqah: ObservasiKelompok[];
  ringkas: ObservasiRingkas;
  /** Nilai `kondisi` yang benar-benar muncul, untuk mengisi saringan klien. */
  kondisiTampil: string[];
};

// ── Penggabungan ───────────────────────────────────────────────────────────

/**
 * Jumlah menit, atau `null` ketika tak satu pun baris membawa angka.
 *
 * Dipisah supaya aturan "kosong bukan nol" hanya ditulis sekali: `0` di layar
 * berarti "hutangnya nol menit", sedangkan `null` berarti "tidak ada angkanya".
 */
export function jumlahMenit(rows: { menit: number | null }[]): number | null {
  const angka = rows.map((r) => r.menit).filter((m): m is number => typeof m === "number");
  return angka.length === 0 ? null : angka.reduce((a, b) => a + b, 0);
}

function kelompokkan<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k == null) continue;
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/** Nama null selalu di belakang, apa pun arah urutannya. */
function bandingNama(a: string | null, b: string | null): number {
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1;
  return a.localeCompare(b, "id", { numeric: true });
}

/** Nomor pertemuan null selalu di belakang — bukan diperlakukan sebagai 0. */
function bandingPertemuan(a: number | null, b: number | null): number {
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1;
  return a - b;
}

export function buildObservasiView(sumber: ObservasiSumber): ObservasiView {
  const halaqahById = new Map(sumber.halaqah.map((h) => [h.id, h]));
  const pengajarById = new Map(sumber.pengajar.map((p) => [p.id, p]));
  const tautan = sumber.tautan ?? {};

  const pelanggaranBy = kelompokkan(sumber.pelanggaran, (p) => p.keterangan_id);
  const tabayyunBy = kelompokkan(sumber.tabayyun, (t) => t.keterangan_id);
  const hutangBy = kelompokkan(sumber.hutang, (h) => h.keterangan_id);

  const baris: ObservasiBaris[] = sumber.keterangan.map((k) => {
    const halaqah = halaqahById.get(k.halaqah_id) ?? null;
    const pengajar = halaqah?.pengajar_id ? (pengajarById.get(halaqah.pengajar_id) ?? null) : null;
    const pelanggaran = pelanggaranBy.get(k.id) ?? [];
    const tabayyun = tabayyunBy.get(k.id) ?? [];
    const hutang = hutangBy.get(k.id) ?? [];
    return {
      id: k.id,
      tanggal: k.tanggal,
      halaqahId: k.halaqah_id,
      halaqahNama: halaqah?.name ?? null,
      halaqahGender: halaqah?.gender ?? null,
      tilawahHalaqahId: tautan[k.halaqah_id]?.tilawahHalaqahId ?? null,
      pengajarNama: pengajar?.name ?? null,
      // `level` pada keterangan menang atas `level` halaqah: yang pertama
      // mencatat kurikulum pertemuan itu, yang kedua kurikulum kelasnya.
      level: k.level ?? halaqah?.level ?? null,
      pertemuanNo: k.pertemuan_no,
      kondisi: k.kondisi ?? null,
      statusLatihan: k.status_latihan ?? null,
      pelanggaran,
      tabayyun,
      hutang,
      menitHutang: jumlahMenit(hutang),
      menitPelanggaran: jumlahMenit(pelanggaran),
      adaTindakLanjut: pelanggaran.length > 0 || tabayyun.length > 0,
    };
  });

  // Terbaru dulu; pada tanggal yang sama, urut nama halaqah lalu nomor
  // pertemuan supaya urutannya stabil antar-render (id sebagai pemutus akhir).
  //
  // Nomor pertemuan yang null diletakkan di BELAKANG, bukan diperlakukan sebagai
  // 0. `?? 0` akan menaruh catatan tanpa nomor mendahului pertemuan 1 seolah ia
  // pertemuan ke-nol — aturan "kosong bukan nol" berlaku pada urutan juga, bukan
  // cuma pada sel.
  baris.sort(
    (a, b) =>
      b.tanggal.localeCompare(a.tanggal) ||
      bandingNama(a.halaqahNama, b.halaqahNama) ||
      bandingPertemuan(a.pertemuanNo, b.pertemuanNo) ||
      a.id.localeCompare(b.id),
  );

  const perHalaqah: ObservasiKelompok[] = [...kelompokkan(baris, (r) => r.halaqahId)]
    .map(([halaqahId, rows]) => ({
      halaqahId,
      halaqahNama: rows[0].halaqahNama,
      tilawahHalaqahId: rows[0].tilawahHalaqahId,
      pengajarNama: rows[0].pengajarNama,
      baris: rows,
    }))
    .sort((a, b) => bandingNama(a.halaqahNama, b.halaqahNama) || a.halaqahId.localeCompare(b.halaqahId));

  const kondisiTampil = [
    ...new Set(baris.map((r) => r.kondisi).filter((k): k is string => k != null)),
  ].sort((a, b) => a.localeCompare(b, "id"));

  return {
    baris,
    perHalaqah,
    ringkas: {
      keterangan: baris.length,
      pelanggaran: baris.reduce((n, r) => n + r.pelanggaran.length, 0),
      tabayyun: baris.reduce((n, r) => n + r.tabayyun.length, 0),
      tabayyunBelumDiputus: baris.reduce(
        (n, r) => n + r.tabayyun.filter(tabayyunTerbuka).length,
        0,
      ),
      hutang: baris.reduce((n, r) => n + r.hutang.length, 0),
      halaqah: perHalaqah.length,
    },
    kondisiTampil,
  };
}

// ── Saringan klien ─────────────────────────────────────────────────────────

export type ObservasiFilter = {
  /** `"semua"` atau salah satu nilai `kondisi` yang muncul di data. */
  kondisi: string;
  /** Hanya baris yang punya pelanggaran atau tabayyun. */
  hanyaTindakLanjut: boolean;
};

export const FILTER_AWAL: ObservasiFilter = { kondisi: "semua", hanyaTindakLanjut: false };

/** Menyaring tampilan saja — tidak ada angka yang dihitung ulang. */
export function filterBaris(rows: ObservasiBaris[], f: ObservasiFilter): ObservasiBaris[] {
  return rows.filter(
    (r) =>
      (f.kondisi === "semua" || r.kondisi === f.kondisi) &&
      (!f.hanyaTindakLanjut || r.adaTindakLanjut),
  );
}
