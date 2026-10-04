import type { Momen } from "@/app/countdown/momen";

/**
 * Semua hitungan papan /countdown, sebagai fungsi murni atas satu instant.
 *
 * Bentuknya sengaja begitu: papan ini dirender di server lalu dihidupkan di
 * browser TV, dan kalau kedua sisi memanggil `Date.now()` masing-masing,
 * hasilnya berbeda dan React mengeluh hydration mismatch. Server mengirim
 * instant-nya sebagai prop, render pertama di klien memakai angka yang sama,
 * baru sesudah itu jamnya jalan sendiri.
 *
 * Dua cara menghitung hidup berdampingan di sini, dan bedanya penting:
 *
 *   - Momen **berjam** (punya `time`) dihitung sebagai durasi sungguhan sampai
 *     detik keberangkatan, lalu dipecah jadi hari/jam/menit. "0 HARI 3 jam"
 *     berarti benar-benar tiga jam lagi.
 *   - Momen **tanpa jam** dihitung per hari kalender Asia/Jakarta. Ramadhan
 *     tidak berangkat jam delapan; yang orang tanyakan adalah "berapa hari
 *     lagi", dan itu pertanyaan tentang tanggal, bukan tentang durasi.
 */

const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
const HIJRI = [
  "Muharram", "Safar", "Rabiul Awal", "Rabiul Akhir", "Jumadil Awal", "Jumadil Akhir",
  "Rajab", "Syaban", "Ramadhan", "Syawal", "Dzulqaidah", "Dzulhijjah",
];

const URGENT = "#F87171";
const TEXT = "#F3F7F5";
const MUTED = "#8FA5A0";
const URGENT_WINDOW_DAYS = 7;
/**
 * Batas kartu per halaman di bawah hero. Satu baris kartu adalah seluruh ruang
 * yang tersisa di kanvas — hero 960 px dan ticker sudah menghabiskan sisanya —
 * jadi menambah momen berarti kartunya menyempit, bukan barisnya bertambah.
 * Delapan adalah titik di mana angka "999 HARI" masih muat sebaris di kartu
 * selebar 414 px. Di atas itu kartunya tidak dipangkas lagi, melainkan dirotasi
 * per halaman — lihat `bagiHalaman`.
 */
export const MAX_KARTU_PER_HALAMAN = 8;

const HARI_MS = 86_400_000;
const JAM_MS = 3_600_000;
const MENIT_MS = 60_000;
// Asia/Jakarta (WIB) tidak pernah punya DST dan tidak pernah berubah offset,
// jadi satu konstanta cukup — tanpa perlu library zona waktu.
const WIB_OFFSET_MS = 7 * JAM_MS;

/** Hari kalender di Asia/Jakarta, sebagai YYYY-MM-DD. */
export function jakartaToday(now: Date = new Date()): string {
  // en-CA memberi format ISO tanpa perlu merakit ulang bagian-bagiannya.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Tanggal ISO → Date pada tengah hari UTC. Tengah hari, bukan tengah malam,
 * supaya pergeseran zona apa pun tidak pernah melempar tanggalnya ke hari
 * sebelah — dan karena semua Date di modul ini dibaca dengan getUTC*, tanggal
 * yang keluar selalu sama dengan yang masuk.
 */
function toUtcNoon(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function selisihHari(fromIso: string, toIso: string): number {
  return Math.round((toUtcNoon(toIso).getTime() - toUtcNoon(fromIso).getTime()) / HARI_MS);
}

/**
 * Jam dinding WIB pada suatu instant. Selalu WIB, bukan jam browser: papan ini
 * menggantung di satu ruangan di Jakarta, dan laptop yang zonanya salah tidak
 * boleh membuat jamnya berbeda dari jam di dinding sebelahnya.
 *
 * Detiknya dipisah supaya bisa digambar lebih kecil dari jam dan menitnya.
 */
export function jamWib(nowMs: number): { jam: string; detik: string } {
  const d = new Date(nowMs + WIB_OFFSET_MS);
  const dua = (n: number) => String(n).padStart(2, "0");
  return {
    jam: `${dua(d.getUTCHours())}.${dua(d.getUTCMinutes())}`,
    detik: dua(d.getUTCSeconds()),
  };
}

/** Tanggal + jam Jakarta → epoch ms. `time` kosong berarti tengah malam WIB. */
function instant(iso: string, time?: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const [hh, mm] = (time ?? "00:00").split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - WIB_OFFSET_MS;
}

/** "08:00" → "08.00", gaya penulisan jam Indonesia. */
function jamLabel(time: string): string {
  return time.replace(":", ".");
}

let hijriFmt: Intl.DateTimeFormat | null = null;

type HijriParts = { day: number; month: number; year: string };

function hijriParts(iso: string): HijriParts | null {
  try {
    hijriFmt ??= new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const p: Record<string, string> = {};
    for (const part of hijriFmt.formatToParts(toUtcNoon(iso))) p[part.type] = part.value;
    return {
      day: Number(p.day),
      month: Number(p.month),
      year: String(p.year).replace(/[^0-9]/g, ""),
    };
  } catch {
    return null;
  }
}

/** "21 Rabiul Awal 1448 H", atau "" kalau runtime-nya tanpa kalender islamic. */
function hijri(iso: string): string {
  const p = hijriParts(iso);
  return p ? `${p.day} ${HIJRI[p.month - 1] ?? ""} ${p.year} H` : "";
}

/**
 * Rentang Hijriah yang tidak mengulang apa yang sudah sama.
 *
 * Bentuk penuh — "18 Rabiul Akhir 1448 H – 27 Rabiul Akhir 1448 H" — membuat
 * baris tanggal hero melipat jadi dua baris dan mendorong komposisinya. Bulan
 * dan tahun yang identik cukup ditulis sekali.
 */
function rentangHijri(startIso: string, endIso: string): string {
  const a = hijriParts(startIso);
  const b = hijriParts(endIso);
  if (!a || !b) return "";
  if (a.year === b.year && a.month === b.month) {
    return `${a.day} – ${b.day} ${HIJRI[b.month - 1] ?? ""} ${b.year} H`;
  }
  if (a.year === b.year) {
    return `${a.day} ${HIJRI[a.month - 1] ?? ""} – ${b.day} ${HIJRI[b.month - 1] ?? ""} ${b.year} H`;
  }
  return `${hijri(startIso)} – ${hijri(endIso)}`;
}

function hariNama(iso: string): string {
  return HARI[toUtcNoon(iso).getUTCDay()];
}
function tanggalPanjang(iso: string): string {
  const d = toUtcNoon(iso);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function tanggalPendek(iso: string): string {
  const d = toUtcNoon(iso);
  return `${d.getUTCDate()} ${BULAN_PENDEK[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Rentang tanggal untuk momen berdurasi. Bulannya ditulis dua kali kalau
 * rentangnya menyeberang bulan — "29–8 Oktober" untuk perjalanan 29 September
 * sampai 8 Oktober membaca seperti salah ketik.
 */
function rentangTanggal(startIso: string, endIso: string): string {
  const s = toUtcNoon(startIso);
  const e = toUtcNoon(endIso);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  return sameMonth
    ? `${s.getUTCDate()}–${e.getUTCDate()} ${BULAN[e.getUTCMonth()]} ${e.getUTCFullYear()}`
    : `${tanggalPanjang(startIso)} – ${tanggalPanjang(endIso)}`;
}

/**
 * Hex aksen → rgba, untuk glow radial di sudut hero. Spec menyebut "glow
 * radial aksen ≤ 12%", jadi warnanya harus ikut kategori momen — bukan putih
 * netral yang membuat setiap momen bercahaya sama.
 */
function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type Hero = {
  accent: string;
  glow: string;
  category: string;
  title: string;
  pill: string | null;
  dateLine: string;
  /** Persis satu dari ketiganya — hero punya tiga tampilan, bukan tiga lapis. */
  mode: "counting" | "berlangsung" | "hari-ini";
  days: number;
  /** "06 jam 12 menit", hanya untuk momen berjam. null = tampilkan hari saja. */
  jamMenit: string | null;
  numColor: string;
  unitColor: string;
  /** Tempat acara, satu baris di bawah tanggal. null = momen tanpa lokasi. */
  lokasi: string | null;
  /**
   * Jam selesai ("12.00") untuk acara sehari berjam. Panel berlangsungnya
   * menampilkan "SAMPAI 12.00" alih-alih "HARI KE-1 / 1" yang tak berkata apa-apa.
   */
  sampai: string | null;
  dayIndex: number;
  total: number;
  pct: number;
  endLine: string;
};

export type Card = {
  key: string;
  no: string;
  name: string;
  accent: string;
  days: number;
  numColor: string;
  masehi: string;
  hijri: string;
  hisab: string;
  opacity: number;
};

export type BoardView = {
  headerMasehi: string;
  headerHijri: string;
  hero: Hero;
  cards: Card[];
};

/** State hero yang dipaksa untuk demo/QA; "auto" = turunkan dari tanggal. */
export type PaksaState = "auto" | "normal" | "urgent" | "berlangsung" | "hari-h";

export function computeBoard(
  nowMs: number,
  momen: Momen[],
  paksa: PaksaState = "auto",
): BoardView {
  const todayIso = jakartaToday(new Date(nowMs));

  const items = momen
    .map((m) => {
      const endIso = m.end ?? m.date;
      const startAt = instant(m.date, m.time);
      // Momen berdurasi tanpa jam selesai dianggap habis di akhir hari terakhir,
      // bukan di awalnya — 10 Hari Dzulhijjah masih berlangsung pada tanggal 16.
      const endAt = m.endTime ? instant(endIso, m.endTime) : instant(endIso) + HARI_MS;

      const sisaMs = startAt - nowMs;
      const days = m.time
        ? Math.floor(sisaMs / HARI_MS)
        : selisihHari(todayIso, m.date);
      const sudahMulai = m.time ? nowMs >= startAt : selisihHari(todayIso, m.date) <= 0;
      const lewat = m.endTime ? nowMs > endAt : selisihHari(todayIso, endIso) < 0;

      return {
        ...m,
        endIso,
        startAt,
        endAt,
        sisaMs,
        days,
        lewat,
        // Hanya momen berdurasi yang bisa "berlangsung"; momen sehari langsung
        // lompat dari hari-H ke lewat.
        berlangsung: Boolean(m.end) && sudahMulai && !lewat,
      };
    })
    // Yang sudah lewat dibuang ke belakang, sisanya yang terdekat di depan.
    // Diurutkan pada instant, bukan pada `days`, supaya momen berjam dan momen
    // tanpa jam tetap berbanding pada sumbu yang sama.
    .sort((a, b) => (a.lewat !== b.lewat ? (a.lewat ? 1 : -1) : a.startAt - b.startAt));

  // Memaksa state "berlangsung" hanya bermakna pada momen yang punya rentang;
  // dipaksakan ke momen sehari, hero-nya berbunyi "HARI KE-1 / 1" dan tidak
  // memeriksa apa pun. Angkat momen berdurasi pertama ke hero untuk pratinjau.
  if (paksa === "berlangsung") {
    const idx = items.findIndex((m) => m.end);
    if (idx > 0) items.unshift(...items.splice(idx, 1));
  }

  const h = items[0];

  let berlangsung = h.berlangsung;
  // Momen berjam tidak pernah memakai "HARI INI": pada hari-H yang berguna
  // justru sisa jam dan menitnya, bukan kata "hari ini" yang berlaku 24 jam.
  let hariIni = !berlangsung && !h.time && h.days === 0;
  let urgent = !berlangsung && !hariIni && h.days >= 0 && h.days <= URGENT_WINDOW_DAYS;
  let heroDays = h.days;
  let heroSisaMs: number | null = h.time ? h.sisaMs : null;

  if (paksa === "urgent") {
    berlangsung = false;
    hariIni = false;
    urgent = true;
    heroDays = 3;
    heroSisaMs = h.time ? 3 * HARI_MS + 6 * JAM_MS + 12 * MENIT_MS : null;
  } else if (paksa === "berlangsung") {
    berlangsung = true;
    hariIni = false;
    urgent = false;
  } else if (paksa === "hari-h") {
    berlangsung = false;
    hariIni = true;
    urgent = false;
  } else if (paksa === "normal") {
    berlangsung = false;
    hariIni = false;
    urgent = false;
  }

  const accent = urgent ? URGENT : h.accent;
  const total = h.end ? selisihHari(h.date, h.endIso) + 1 : 1;
  const dayIndex = Math.min(total, Math.max(1, selisihHari(h.date, todayIso) + 1));

  // Acara sehari berjam: rentangnya jam, bukan tanggal. Progress bar-nya pun
  // mengukur jam yang sudah lewat — hari ke-1 dari 1 selalu 100%.
  const sehari = h.endIso === h.date && Boolean(h.time && h.endTime);
  const jamKeberangkatan = h.time
    ? ` · ${jamLabel(h.time)}${sehari && h.endTime ? `–${jamLabel(h.endTime)}` : ""}`
    : "";
  const jamPulang = h.endTime ? ` · ${jamLabel(h.endTime)}` : "";
  const pct = sehari
    ? Math.min(100, Math.max(0, Math.round(((nowMs - h.startAt) / (h.endAt - h.startAt)) * 100)))
    : Math.round((dayIndex / total) * 100);

  const hero: Hero = {
    accent,
    glow: rgba(accent, 0.12),
    category: h.kategori,
    title: h.judul,
    pill: urgent ? "SEGERA" : berlangsung ? "SEDANG BERLANGSUNG" : null,
    // Jam pulang tidak diulang di sini — ia sudah punya tempatnya sendiri di
    // baris "berakhir" di bawah progress bar.
    dateLine: berlangsung && !sehari
      ? `${rentangTanggal(h.date, h.endIso)} · ${rentangHijri(h.date, h.endIso)}`
      : `${hariNama(h.date)}, ${tanggalPanjang(h.date)}${jamKeberangkatan} · ${hijri(h.date)}`,
    mode: berlangsung ? "berlangsung" : hariIni ? "hari-ini" : "counting",
    days: Math.max(0, heroDays),
    jamMenit:
      heroSisaMs !== null && heroSisaMs > 0
        ? `${String(Math.floor(heroSisaMs / JAM_MS) % 24).padStart(2, "0")} jam ` +
          `${String(Math.floor(heroSisaMs / MENIT_MS) % 60).padStart(2, "0")} menit`
        : null,
    numColor: urgent ? URGENT : TEXT,
    unitColor: urgent ? URGENT : MUTED,
    lokasi: h.lokasi ?? null,
    sampai: sehari && h.endTime ? jamLabel(h.endTime) : null,
    dayIndex,
    total,
    pct,
    endLine: `berakhir ${hariNama(h.endIso)}, ${tanggalPanjang(h.endIso)}${jamPulang}`,
  };

  const cards: Card[] = items.slice(1).map((m, i) => ({
    key: m.date + m.name,
    no: String(i + 2).padStart(2, "0"),
    name: m.name,
    accent: m.accent,
    days: m.lewat ? 0 : Math.max(0, m.days),
    numColor: !m.lewat && m.days >= 0 && m.days <= URGENT_WINDOW_DAYS ? URGENT : TEXT,
    masehi: tanggalPendek(m.date),
    hijri: hijri(m.date),
    hisab: m.hisab ? " · hisab" : "",
    opacity: m.lewat ? 0.4 : 1,
  }));

  return {
    headerMasehi: `${hariNama(todayIso)}, ${tanggalPanjang(todayIso)}`,
    headerHijri: hijri(todayIso),
    hero,
    cards,
  };
}

export type Halaman<T> = {
  isi: T[];
  /** Nomor halaman yang tampil, 0-based, sudah dibungkus ke jumlah halaman. */
  indeks: number;
  jumlah: number;
  /** Kartu per halaman — dasar lebar kartu, supaya halaman terakhir tidak melebar. */
  per: number;
};

/**
 * Rotasi baris kartu saat momennya melebihi satu baris.
 *
 * Halamannya dibagi rata, bukan diisi penuh lalu sisanya: sepuluh kartu jadi
 * 5 + 5, bukan 8 + 2. Halaman berisi dua kartu kecil di pojok kiri terbaca
 * seperti papan yang rusak, dan lebar kartu yang berubah tiap rotasi membuat
 * angkanya melompat-lompat.
 *
 * Urutannya tetap urutan kartu (terdekat dulu), jadi momen yang mendesak
 * selalu ada di halaman pertama. `putaran` boleh bilangan berapa pun — biasanya
 * nomor slot waktu — dan dibungkus modulo jumlah halaman di sini.
 */
export function bagiHalaman<T>(
  cards: T[],
  putaran: number,
  maks: number = MAX_KARTU_PER_HALAMAN,
): Halaman<T> {
  const jumlah = Math.max(1, Math.ceil(cards.length / maks));
  const per = Math.ceil(cards.length / jumlah);
  const indeks = ((putaran % jumlah) + jumlah) % jumlah;
  return { isi: cards.slice(indeks * per, (indeks + 1) * per), indeks, jumlah, per };
}
