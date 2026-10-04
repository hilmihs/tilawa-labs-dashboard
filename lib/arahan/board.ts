/**
 * Semua hitungan papan /arahan sebagai fungsi murni atas satu instant.
 *
 * Bentuknya sama dengan lib/countdown/board.ts dan alasannya sama: papan dirender
 * di server lalu dihidupkan di browser TV. Kalau kedua sisi memanggil `Date.now()`
 * sendiri-sendiri, "usia 13 hari" bisa jadi 12 di server dan 13 di klien tepat di
 * pergantian tengah malam, dan React mengeluh hydration mismatch.
 *
 * Dua umur dihitung di sini, dan bedanya yang membuat papan ini berguna:
 *
 *   - **Usia arahan** — hari sejak tanggal permintaan. Ini yang jadi angka besar
 *     dan warna baris. Menjawab "sudah berapa lama ini menggantung".
 *   - **Usia checkpoint** — hari sejak catatan progres terakhir diubah. Ini yang
 *     memunculkan titik oranye. Menjawab "sudah berapa lama tidak ada kabar".
 *
 * Arahan bisa baru tapi sudah bisu, atau tua tapi bergerak tiap minggu. Satu
 * angka saja tidak bisa membedakan keduanya.
 */

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Semua tanggal papan dibaca sebagai hari kalender Jakarta, bukan hari UTC. */
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const HARI_MS = 24 * 60 * 60 * 1000;

export const WARNA = {
  teks: "#F3F7F5",
  redup: "#8FA5A0",
  samar: "#5F736F",
  panel: "#1B2724",
  garis: "#25332F",
  baris: "#131C1A",
  latar: "#0A0F0E",
  hijau: "#34D399",
  kuning: "#FBBF24",
  jingga: "#FB923C",
  merah: "#F87171",
} as const;

/** Ambang usia arahan, dalam hari. Di atas MENGENDAP baris dianggap kritis. */
export const AMBANG = { perhatian: 7, lambat: 14, mengendap: 30 } as const;
/** Checkpoint yang tidak disentuh lebih lama dari ini ditandai basi. */
export const AMBANG_BASI_HARI = 7;

export type Directive = {
  id: string;
  title: string;
  source: string;
  pic: string;
  stakeholders: string[];
  requestedAt: string; // 'YYYY-MM-DD'
  checkpoint: string | null;
  checkpointUpdatedAt: string | null; // ISO
};

export type BoardRow = {
  id: string;
  title: string;
  source: string;
  pic: string;
  /** Inisial PIC untuk lencana bulat. Maksimal dua huruf. */
  ini: string;
  stakeholders: string[];
  date: string; // '14 Jul 2026'
  age: number;
  color: string;
  /** Usia checkpoint dalam hari; null kalau belum pernah ada checkpoint. */
  updDays: number | null;
  upd: string; // 'diperbarui 12 hari lalu'
  updColor: string;
  stale: boolean;
  late: boolean;
  checkpoint: string;
};

export type BoardPage = {
  /** Kunci render sekaligus penanda urutan halaman ini. */
  mode: "usia" | "senyap";
  subtitle: string | null;
  rows: BoardRow[];
};

/** Ukuran chip stakeholder, seragam untuk seluruh papan. Lihat stakeholderTier. */
export type StakeholderTier = { font: number; padY: number; padX: number; gap: number };

// ── Geometri papan ────────────────────────────────────────────────────────
// Angka-angka ini dipakai DUA kali: di sini untuk memutuskan berapa baris muat
// dalam satu halaman, dan di Board.tsx untuk menggambarnya. Keduanya harus
// sepakat, jadi keduanya membaca konstanta yang sama — bukan salinan.

/** Lebar kolom Stakeholder, tempat chip-chip itu dibungkus. */
export const KOLOM_STAKEHOLDER = 600;
/** Padding kiri+kanan sel, dipotong dari lebar yang bisa dipakai chip. */
export const SEL_PAD_X = 32;
/** Tinggi minimum satu baris — cukup untuk judul dua baris dan checkpoint. */
export const BARIS_MIN_TINGGI = 152;
/** Ruang kosong di atas+bawah isi sel, supaya chip tidak menempel garis baris. */
export const BARIS_PAD_Y = 28;
/**
 * Tinggi yang tersisa untuk baris-baris dalam satu halaman:
 * kanvas 2160 − padding 2×96 − header 160 − jeda 48 − baris judul 88 − footer 124.
 */
export const TINGGI_UNTUK_BARIS = 1548;

/**
 * Satu ukuran chip untuk seluruh papan, dipilih dari arahan dengan stakeholder
 * terbanyak.
 *
 * Bukan per baris dan bukan per halaman. Kalau tiap baris menskalakan dirinya
 * sendiri, baris berstakeholder enam akan berhuruf kecil tepat di sebelah baris
 * berhuruf besar yang cuma punya satu, dan dari seberang ruangan itu terbaca
 * sebagai kolom yang rusak. Per halaman pun tidak bisa: ukurannya ikut menentukan
 * tinggi baris, tinggi baris menentukan isi halaman, dan isi halaman akan
 * menentukan ukuran — melingkar. Satu ukuran global memutus lingkaran itu.
 */
export function stakeholderTier(maxCount: number): StakeholderTier {
  if (maxCount <= 2) return { font: 34, padY: 12, padX: 22, gap: 12 };
  if (maxCount <= 4) return { font: 31, padY: 10, padX: 19, gap: 10 };
  if (maxCount <= 6) return { font: 29, padY: 9, padX: 17, gap: 9 };
  // Lantainya berhenti di 27. Di bawah itu nama tidak lagi terbaca dari seberang
  // ruangan, dan papan yang tidak terbaca sama saja dengan papan yang kosong —
  // jadi yang mengalah adalah tinggi barisnya, bukan hurufnya. Paginasi sudah
  // menyerap konsekuensinya.
  return { font: 27, padY: 8, padX: 16, gap: 9 };
}

/**
 * Lebar chip untuk sebuah nama, ditaksir dari jumlah karakternya.
 *
 * Menaksir, bukan mengukur: keputusan berapa baris yang muat harus diambil di
 * server maupun di klien dan harus menghasilkan angka yang sama, sedangkan
 * pengukuran teks sesungguhnya hanya ada di browser. Faktor 0,58 em sengaja
 * sedikit lebih longgar daripada lebar rata-rata Plus Jakarta Sans, karena
 * menaksir kelebihan hanya membuat baris sedikit lebih tinggi, sementara
 * menaksir kekurangan membuat chip tumpah keluar baris.
 */
function lebarChip(nama: string, t: StakeholderTier): number {
  return Math.ceil(nama.length * t.font * 0.58) + t.padX * 2 + 4;
}

/** Berapa baris yang dibutuhkan chip-chip ini di dalam kolom stakeholder. */
export function barisChip(names: string[], t: StakeholderTier): number {
  if (names.length === 0) return 1;
  const muat = KOLOM_STAKEHOLDER - SEL_PAD_X;
  let baris = 1;
  let terpakai = 0;
  for (const nama of names) {
    const w = Math.min(lebarChip(nama, t), muat);
    if (terpakai === 0) {
      terpakai = w;
      continue;
    }
    if (terpakai + t.gap + w <= muat) {
      terpakai += t.gap + w;
    } else {
      baris += 1;
      terpakai = w;
    }
  }
  return baris;
}

/**
 * Tinggi satu baris papan. Tumbuh mengikuti stakeholder-nya, karena tidak ada
 * satu pun nama yang boleh disembunyikan — sebuah baris dengan sembilan nama
 * memang harus lebih tinggi daripada baris dengan satu.
 */
export function tinggiBaris(row: BoardRow, t: StakeholderTier): number {
  const baris = barisChip(row.stakeholders, t);
  const tinggiChip = t.font + t.padY * 2 + 4;
  const isi = baris * tinggiChip + (baris - 1) * t.gap + BARIS_PAD_Y * 2;
  return Math.max(BARIS_MIN_TINGGI, isi);
}

export type BoardView = {
  pages: BoardPage[];
  /** Jumlah arahan yang sudah lewat ambang mengendap, untuk lencana header. */
  lateCount: number;
  total: number;
  dateText: string;
  /** Ukuran chip stakeholder yang dipakai seluruh papan. */
  tier: StakeholderTier;
  /** Tinggi tergambar per baris, dikunci id — sumber yang sama dengan paginasi. */
  heights: Record<string, number>;
};

/** Awal hari kalender Jakarta yang memuat `ms`, sebagai epoch ms. */
function awalHariJakarta(ms: number): number {
  return Math.floor((ms + JAKARTA_OFFSET_MS) / HARI_MS) * HARI_MS - JAKARTA_OFFSET_MS;
}

/**
 * Selisih hari kalender Jakarta. Sengaja bukan (a-b)/86400000: tanggal permintaan
 * disimpan sebagai date polos, dan pembagian mentah membuat arahan yang dimasukkan
 * sore hari terbaca 0 hari sampai lewat 24 jam penuh, bukan sampai ganti tanggal.
 */
export function selisihHari(dariISO: string, sampaiMs: number): number {
  const dari = awalHariJakarta(Date.parse(`${dariISO.slice(0, 10)}T00:00:00+07:00`));
  const sampai = awalHariJakarta(sampaiMs);
  return Math.round((sampai - dari) / HARI_MS);
}

export function warnaUsia(age: number): string {
  if (age > AMBANG.mengendap) return WARNA.merah;
  if (age > AMBANG.lambat) return WARNA.jingga;
  if (age > AMBANG.perhatian) return WARNA.kuning;
  return WARNA.hijau;
}

export function formatTanggalPendek(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BULAN_PENDEK[m - 1]} ${y}`;
}

export function formatTanggalPanjang(ms: number): string {
  const j = new Date(ms + JAKARTA_OFFSET_MS);
  return `${HARI[j.getUTCDay()]}, ${j.getUTCDate()} ${BULAN[j.getUTCMonth()]} ${j.getUTCFullYear()}`;
}

export function formatJam(ms: number): string {
  const j = new Date(ms + JAKARTA_OFFSET_MS);
  return `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}

export function inisial(nama: string): string {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return "—";
  if (kata.length === 1) return kata[0].slice(0, 2).toUpperCase();
  return (kata[0][0] + kata[kata.length - 1][0]).toUpperCase();
}

function labelPembaruan(updDays: number | null, senyap: number): string {
  // Baris tanpa checkpoint sudah bertuliskan "Belum ada checkpoint." di atasnya;
  // mengulang kalimat yang sama di bawah membuang satu baris. Yang belum
  // terbaca di mana pun adalah sudah berapa lama diamnya.
  if (updDays === null) return `belum ada kabar ${senyap} hari`;
  if (updDays <= 0) return "diperbarui hari ini";
  if (updDays === 1) return "diperbarui kemarin";
  return `diperbarui ${updDays} hari lalu`;
}

export function toRow(d: Directive, now: number): BoardRow {
  const age = Math.max(0, selisihHari(d.requestedAt, now));
  // Arahan tanpa checkpoint bukan "baru diperbarui" — kebisuannya dihitung sejak
  // tanggal permintaan, supaya arahan yang tidak pernah disentuh sama sekali ikut
  // naik ke halaman senyap, bukan bersembunyi di bawah null.
  const updDays = d.checkpointUpdatedAt
    ? Math.max(0, selisihHari(d.checkpointUpdatedAt, now))
    : null;
  const diamHari = updDays ?? age;
  const stale = diamHari > AMBANG_BASI_HARI;
  const late = age > AMBANG.mengendap;
  return {
    id: d.id,
    title: d.title,
    source: d.source,
    pic: d.pic,
    ini: inisial(d.pic),
    stakeholders: d.stakeholders,
    date: formatTanggalPendek(d.requestedAt),
    age,
    color: warnaUsia(age),
    updDays,
    upd: labelPembaruan(updDays, diamHari),
    updColor: stale ? WARNA.jingga : WARNA.redup,
    stale,
    late,
    checkpoint: d.checkpoint?.trim() || "Belum ada checkpoint.",
  };
}

/** Berapa lama baris ini bisu, untuk mengurutkan halaman senyap. */
function senyapHari(r: BoardRow): number {
  return r.updDays ?? r.age;
}

/**
 * Susun halaman rotasi papan.
 *
 * Halaman usia diisi sampai tingginya penuh dan diurutkan dari yang paling tua
 * — itu urutan bacaan yang diminta desain. Sesudahnya ditambahkan satu halaman
 * "senyap": daftar yang sama, diurutkan dari yang paling lama tanpa pembaruan
 * checkpoint. Halaman itu ada karena urutan usia menyembunyikan arahan yang baru
 * tapi sudah mati suri, dan justru itu yang perlu ditanyakan di rapat.
 *
 * Halaman senyap dilewati kalau isinya akan persis sama dengan halaman usia
 * (≤1 baris, atau tidak ada satu pun yang basi) — memutar dua halaman identik
 * membuat papan terlihat rusak.
 */
export function buildBoard(directives: Directive[], now: number): BoardView {
  const rows = directives.map((d) => toRow(d, now));
  const byAge = [...rows].sort((a, b) => b.age - a.age || a.title.localeCompare(b.title));

  const tier = stakeholderTier(rows.reduce((m, r) => Math.max(m, r.stakeholders.length), 0));
  const heights: Record<string, number> = {};
  for (const r of rows) heights[r.id] = tinggiBaris(r, tier);

  /**
   * Halaman diisi sampai penuh secara TINGGI, bukan sampai delapan baris.
   * Barisnya tidak lagi seragam — satu arahan dengan sembilan stakeholder makan
   * ruang dua arahan biasa — jadi menghitung baris akan membuat halaman padat
   * meluber dan halaman lengang menyisakan sepertiga layar kosong.
   */
  const potong = (list: BoardRow[]): BoardRow[][] => {
    const out: BoardRow[][] = [];
    let current: BoardRow[] = [];
    let used = 0;
    for (const r of list) {
      const h = heights[r.id];
      if (current.length > 0 && used + h > TINGGI_UNTUK_BARIS) {
        out.push(current);
        current = [];
        used = 0;
      }
      current.push(r);
      used += h;
    }
    if (current.length > 0) out.push(current);
    return out;
  };

  const pages: BoardPage[] = potong(byAge).map((pageRows) => ({
    mode: "usia" as const,
    subtitle: null,
    rows: pageRows,
  }));
  if (pages.length === 0) pages.push({ mode: "usia", subtitle: null, rows: [] });

  const bisu = rows.filter((r) => r.stale);
  if (rows.length > 1 && bisu.length > 0) {
    const bySilence = [...rows].sort((a, b) => senyapHari(b) - senyapHari(a) || b.age - a.age);
    // Halaman senyap adalah satu layar ringkasan, bukan rotasi kedua yang
    // panjang — ambil sebanyak yang muat dalam satu halaman dan berhenti.
    pages.push({
      mode: "senyap",
      subtitle: "Diurutkan: paling lama tanpa pembaruan checkpoint",
      rows: potong(bySilence)[0] ?? [],
    });
  }

  return {
    pages,
    lateCount: rows.filter((r) => r.late).length,
    total: rows.length,
    dateText: formatTanggalPanjang(now),
    tier,
    heights,
  };
}
