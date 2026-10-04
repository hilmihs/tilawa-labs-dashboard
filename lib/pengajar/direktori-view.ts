/**
 * Direktori pengajar lintas program — bentuk baris dan seluruh aturannya, murni
 * (tanpa DB) supaya bisa diuji. Kueri ada di `./direktori.ts`.
 *
 * Satu baris = satu ORANG (tabel `orang` Div. Kaderisasi), bukan satu akun:
 * - akun tilawah, mabni, dan peran Maahir yang ditautkan ke orang yang sama
 *   (orang_tautan, lihat lib/orang/sinkron.ts) jadi satu baris — pengajar HITS
 *   yang juga musyrif Maahir dan pengajar Mabni tidak lagi muncul tiga kali;
 * - akun yang belum bertaut ke `orang` tetap satu baris per (sumber, id guru
 *   kanonik): id tilawah berlaku di seluruh CMS tilawah, id mabni di ruang nama
 *   sendiri (id 22 tilawah ≠ id 22 mabni), akun ganda tilawah terverifikasi
 *   (lib/guru/duplicates.ts) dilipat ke akun kanoniknya.
 *
 * "Beban" = jumlah halaqah berjalan yang dia pegang: halaqah dengan ≥ 1 peserta
 * aktif, bukan kelas DEMO, dalam lingkup batch program itu — definisi "kelas"
 * yang sama dengan Beranda. Badal dihitung terpisah dan tidak menambah beban.
 *
 * Maahir: grid Maahir tidak memuat pengajar per kelas, jadi pengajar Maahir =
 * syaikh aktif (keputusan pemilik 23 Sep 2026) — ia "mengajar" tanpa angka
 * beban. Roster HITS di Maahir (hits/pengajar) memberi kelompok, ketua, dan
 * skor matrix bulanan; pengajar yang ada di roster itu tapi belum memegang
 * halaqah di tilawah tampil sebagai "tanpa halaqah". Musyrif/koordinator Maahir
 * hanya menjadi keterangan peran, bukan baris sendiri.
 */

export type SumberGuru = "tilawah" | "mabni";

/** Satu halaqah berjalan beserta pengajarnya. */
export type HalaqahMasukan = {
  sumber: SumberGuru;
  guruId: number | null;
  /** Nama dari akun guru (guru_sync), bila ada. */
  guruNama: string | null;
  /** Nama pengajar yang tertulis di halaqah — cadangan bila akun tak tersinkron. */
  pengajar: string | null;
  /** 1 = L, 2 = P dari akun upstream. */
  guruGender: number | null;
  guruHp: string | null;
  programSlug: string;
  programNama: string;
  batch: string | null;
  halaqah: string;
  peserta: number;
  /**
   * Pengajar kedua di halaqah mabni ("Bintang & Atalika" → Atalika). Ikut
   * dihitung sebagai halaqah yang dia pegang — dia memang mengajar di sana.
   */
  pendamping?: boolean;
};

/** Akun guru yang terdaftar di sebuah batch (guru_sync), memegang halaqah atau tidak. */
export type GuruTerdaftar = {
  sumber: SumberGuru;
  guruId: number;
  nama: string | null;
  gender: number | null;
  hp: string | null;
  programSlug: string;
  programNama: string;
  batch: string | null;
};

/** Satu baris `orang_tautan` beserta orang kanoniknya. */
export type TautanOrang = {
  sumber: "tilawah" | "mabni" | "maahir";
  peran: string;
  idUpstream: string;
  orangId: string;
  nama: string;
  kodeQr: string;
  gender: "L" | "P" | null;
  wa: string | null;
  qism: string | null;
  mustawa: string | null;
};

export type MatrixRingkas = {
  /** "2026-09" */
  bulan: string;
  skor: number | null;
  ranking: number | null;
  /** Jumlah pengajar yang diberi ranking bulan itu. */
  dari: number | null;
};

export type MaahirMasukan = {
  syaikh: { id: string; nama: string; gender: "L" | "P" | null; aktif: boolean }[];
  rosterHits: {
    id: string;
    nama: string;
    gender: "L" | "P" | null;
    aktif: boolean;
    kelompok: string | null;
    ketua: boolean;
    matrix: MatrixRingkas | null;
  }[];
  musyrif: { id: string; nama: string; aktif: boolean; kelas: string[] }[];
};

export type Penugasan = {
  programSlug: string;
  program: string;
  batch: string | null;
  halaqah: { nama: string; peserta: number; pendamping: boolean }[];
};

export type PengajarBaris = {
  kunci: string;
  /** Baris `orang` kanonik, bila akunnya sudah bertaut. */
  orangId: string | null;
  nama: string;
  gender: "L" | "P" | null;
  hp: string | null;
  kodeQr: string | null;
  beban: number;
  peserta: number;
  badal: number;
  penugasan: Penugasan[];
  /** Program · batch tempat akunnya terdaftar tanpa memegang halaqah (hanya bila tidak mengajar). */
  terdaftar: { program: string; batch: string | null }[];
  /** Memegang halaqah, atau syaikh Maahir aktif. Dasar angka Pengajar di Beranda. */
  mengajar: boolean;
  syaikhMaahir: boolean;
  rosterHits: { kelompok: string | null; ketua: boolean } | null;
  musyrifKelas: string[];
  matrix: MatrixRingkas | null;
  /** Kajian (acara) yang dia hadiri — presensi QR Div. Kaderisasi. */
  kajianHadir: number;
  qism: string | null;
  mustawa: string | null;
};

/** Nama program untuk baris Maahir — sama dengan kartu programnya. */
export const PROGRAM_MAAHIR = "Kelas Maahir";

/**
 * "HITS Reguler (Batch Juni 2026)" → "HITS Reguler". Salinan kecil dari
 * lib/programs/families.ts supaya modul ini tetap murni tanpa impor DB.
 */
export function namaProgram(name: string): string {
  return name.replace(/\s*\(\s*batch[^)]*\)\s*$/i, "").trim();
}

/** "April_2026" → "April 2026", "Batch Januari 2026" → "Januari 2026", "LAZ  #40" → "LAZ #40". */
export function rapikanBatch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^batch\s+/i, "")
    .trim();
  return s || null;
}

const genderDariKode = (g: number | null | undefined): "L" | "P" | null =>
  g === 1 ? "L" : g === 2 ? "P" : null;

const kunciNama = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

type Kerja = PengajarBaris & { _gender: number | "L" | "P" | null; _hp: string | null; _namaAkun: string };

export function susunDirektori(input: {
  halaqah: HalaqahMasukan[];
  terdaftar: GuruTerdaftar[];
  tautan: TautanOrang[];
  /** (sumber:guruId) → jumlah pertemuan yang dia ampu di halaqah orang lain. */
  badal: Map<string, number>;
  /** Akun ganda tilawah, kelompok pertama = kanonik. */
  akunGanda: readonly (readonly number[])[];
  /** null = user tidak melihat program Maahir. */
  maahir?: MaahirMasukan | null;
  /** orangId → jumlah kajian yang dihadiri. */
  kajianHadir?: Map<string, number>;
  /**
   * Nama yang diputuskan bukan pengajar (KEPUTUSAN_IDENTITAS.kecuali: akun umum
   * "Syaikh Ahmad", akun RBI Zaky yang tidak mengajar). Tidak punya baris `orang`,
   * jadi tanpa ini tetap tampil — dan terhitung — sebagai pengajar tak bertaut.
   */
  kecuali?: readonly string[];
}): PengajarBaris[] {
  const dikecualikan = new Set((input.kecuali ?? []).map(kunciNama));
  const kanonik = new Map<number, number>();
  for (const grp of input.akunGanda) for (const id of grp) kanonik.set(id, grp[0]);
  const idKanonik = (sumber: SumberGuru, id: number) =>
    sumber === "tilawah" ? (kanonik.get(id) ?? id) : id;
  const kunciAkun = (sumber: SumberGuru, id: number) => `${sumber}:${idKanonik(sumber, id)}`;

  // Tautan diindeks per akun. Tautan tilawah/mabni per program; id-nya kanonik.
  const tautan = new Map<string, TautanOrang>();
  for (const t of input.tautan) {
    const k =
      t.sumber === "maahir"
        ? `maahir:${t.peran}:${t.idUpstream}`
        : /^\d+$/.test(t.idUpstream)
          ? kunciAkun(t.sumber, Number(t.idUpstream))
          : null;
    if (k && !tautan.has(k)) tautan.set(k, t);
  }

  const baris = new Map<string, Kerja>();
  const ambil = (kunci: string, nama: string) => {
    let b = baris.get(kunci);
    if (!b) {
      b = {
        kunci, orangId: null, nama, gender: null, hp: null, kodeQr: null, beban: 0, peserta: 0, badal: 0,
        penugasan: [], terdaftar: [], mengajar: false, syaikhMaahir: false, rosterHits: null, musyrifKelas: [],
        matrix: null, kajianHadir: 0, qism: null, mustawa: null, _gender: null, _hp: null, _namaAkun: nama,
      };
      baris.set(kunci, b);
    }
    return b;
  };

  for (const h of input.halaqah) {
    const nama = (h.guruNama ?? h.pengajar ?? "").trim();
    // Halaqah tanpa pengajar sama sekali bukan beban siapa pun.
    if (h.guruId == null && !nama) continue;
    const kunci = h.guruId != null ? kunciAkun(h.sumber, h.guruId) : `${h.sumber}:nama:${kunciNama(nama)}`;
    const b = ambil(kunci, nama || "(tanpa nama)");
    // Nama dari akun kanonik menang atas nama akun gandanya.
    if (h.guruId != null && idKanonik(h.sumber, h.guruId) === h.guruId && h.guruNama) b._namaAkun = h.guruNama.trim();
    // Halaqah yang sama tidak dihitung dua kali untuk satu orang (dua akun gandanya
    // sama-sama tercantum, atau utama sekaligus pendamping).
    if (b.penugasan.some((x) => x.programSlug === h.programSlug && x.halaqah.some((y) => y.nama === h.halaqah))) continue;
    b._gender ??= h.guruGender;
    b._hp ??= h.guruHp;
    b.beban += 1;
    b.peserta += h.peserta;
    tambahHalaqah(b, {
      programSlug: h.programSlug,
      program: namaProgram(h.programNama),
      batch: h.batch,
      halaqah: [{ nama: h.halaqah, peserta: h.peserta, pendamping: !!h.pendamping }],
    });
  }

  // Terdaftar di batch tapi tidak memegang halaqah → beban 0.
  for (const g of input.terdaftar) {
    const kunci = kunciAkun(g.sumber, g.guruId);
    const ada = baris.get(kunci);
    if (ada && ada.beban > 0) continue;
    const b = ambil(kunci, (g.nama ?? "").trim() || "(tanpa nama)");
    b._gender ??= g.gender;
    b._hp ??= g.hp;
    tambahTerdaftar(b, { program: namaProgram(g.programNama), batch: g.batch });
  }

  // Maahir: syaikh, roster HITS, musyrif — tiap entri satu baris sementara,
  // digabung ke orangnya di bawah bila bertaut.
  const m = input.maahir;
  if (m) {
    for (const s of m.syaikh.filter((x) => x.aktif)) {
      const b = ambil(`maahir:syaikh:${s.id}`, s.nama);
      b._gender ??= s.gender;
      b.syaikhMaahir = true;
    }
    for (const r of m.rosterHits.filter((x) => x.aktif)) {
      const b = ambil(`maahir:pengajar_hits:${r.id}`, r.nama);
      b._gender ??= r.gender;
      b.rosterHits = { kelompok: r.kelompok, ketua: r.ketua };
      b.matrix = r.matrix;
    }
    for (const u of m.musyrif.filter((x) => x.aktif)) {
      const b = ambil(`maahir:musyrif:${u.id}`, u.nama);
      b.musyrifKelas = [...u.kelas];
    }
  }

  // Tempelkan orang, lalu gabung semua baris yang menunjuk orang yang sama.
  const perOrang = new Map<string, Kerja>();
  const hasil: Kerja[] = [];
  for (const b of baris.values()) {
    const t = tautan.get(b.kunci);
    if (!t) {
      hasil.push(b);
      continue;
    }
    const ada = perOrang.get(t.orangId);
    if (!ada) {
      b.orangId = t.orangId;
      b.kunci = `orang:${t.orangId}`;
      b.nama = t.nama;
      b.kodeQr = t.kodeQr;
      b._gender ??= t.gender;
      b._hp ??= t.wa;
      b.qism = t.qism;
      b.mustawa = t.mustawa;
      perOrang.set(t.orangId, b);
      hasil.push(b);
      continue;
    }
    gabung(ada, b);
  }

  const out: PengajarBaris[] = [];
  for (const b of hasil) {
    const { _gender, _hp, _namaAkun, ...rest } = b;
    if (!rest.orangId && (dikecualikan.has(kunciNama(_namaAkun)) || dikecualikan.has(kunciNama(rest.nama)))) continue;
    const punyaAkunCermin = rest.beban > 0 || rest.terdaftar.length > 0;
    // Musyrif/koordinator Maahir saja bukan pengajar; baris itu tidak ditampilkan.
    if (!punyaAkunCermin && !rest.syaikhMaahir && !rest.rosterHits) continue;
    if (!rest.orangId) rest.nama = _namaAkun;
    rest.gender = typeof _gender === "number" ? genderDariKode(_gender) : _gender;
    rest.hp = _hp || null;
    rest.badal = badalUntuk(b, input.badal, tautan, kunciAkun);
    rest.kajianHadir = rest.orangId ? (input.kajianHadir?.get(rest.orangId) ?? 0) : 0;
    rest.mengajar = rest.beban > 0 || rest.syaikhMaahir;
    if (rest.mengajar) rest.terdaftar = [];
    else if (rest.rosterHits && !rest.terdaftar.some((t) => t.program === "HITS Reguler")) {
      rest.terdaftar.push({ program: "HITS Reguler", batch: "roster Maahir" });
    }
    rest.penugasan.sort((x, y) => x.program.localeCompare(y.program) || (y.batch ?? "").localeCompare(x.batch ?? ""));
    for (const p of rest.penugasan) p.halaqah.sort((x, y) => x.nama.localeCompare(y.nama, "id", { numeric: true }));
    out.push(rest);
  }
  return out.sort((a, b) => a.nama.localeCompare(b.nama, "id", { sensitivity: "base" }));
}

function tambahHalaqah(b: PengajarBaris, p: Penugasan) {
  const ada = b.penugasan.find((x) => x.programSlug === p.programSlug && x.batch === p.batch);
  if (!ada) {
    b.penugasan.push({ ...p, halaqah: [...p.halaqah] });
    return;
  }
  for (const h of p.halaqah) if (!ada.halaqah.some((y) => y.nama === h.nama)) ada.halaqah.push(h);
}

function tambahTerdaftar(b: PengajarBaris, t: { program: string; batch: string | null }) {
  if (!b.terdaftar.some((x) => x.program === t.program && x.batch === t.batch)) b.terdaftar.push(t);
}

function gabung(ke: Kerja, dari: Kerja) {
  for (const p of dari.penugasan) {
    for (const h of p.halaqah) {
      // Halaqah yang sama lewat dua akun tetap satu beban.
      const sudah = ke.penugasan.some((x) => x.programSlug === p.programSlug && x.halaqah.some((y) => y.nama === h.nama));
      if (sudah) continue;
      ke.beban += 1;
      ke.peserta += h.peserta;
      tambahHalaqah(ke, { ...p, halaqah: [h] });
    }
  }
  for (const t of dari.terdaftar) tambahTerdaftar(ke, t);
  ke._gender ??= dari._gender;
  ke._hp ??= dari._hp;
  ke.syaikhMaahir ||= dari.syaikhMaahir;
  ke.rosterHits ??= dari.rosterHits;
  ke.matrix ??= dari.matrix;
  for (const k of dari.musyrifKelas) if (!ke.musyrifKelas.includes(k)) ke.musyrifKelas.push(k);
}

/** Badal semua akun tilawah/mabni yang tergabung di baris ini. */
function badalUntuk(
  b: Kerja,
  badal: Map<string, number>,
  tautan: Map<string, TautanOrang>,
  kunciAkun: (s: SumberGuru, id: number) => string,
): number {
  if (!b.orangId) return badal.get(b.kunci) ?? 0;
  let n = 0;
  const dihitung = new Set<string>();
  for (const [k, t] of tautan) {
    if (t.orangId !== b.orangId || t.sumber === "maahir" || dihitung.has(k)) continue;
    dihitung.add(k);
    n += badal.get(kunciAkun(t.sumber, Number(t.idUpstream))) ?? 0;
  }
  return n;
}

// ── Saringan ────────────────────────────────────────────────────────────────

export type Beban = "0" | "1" | "2" | "3";
export type Saringan = { q?: string; program?: string; g?: "L" | "P"; beban?: Beban; urut?: "nama" | "beban" | "matrix" };

export const LABEL_BEBAN: Record<Beban, string> = { "0": "Tanpa halaqah", "1": "1 halaqah", "2": "2 halaqah", "3": "3+ halaqah" };

/**
 * Kelompok beban. Syaikh Maahir tanpa halaqah cermin mengajar, jadi bukan
 * "tanpa halaqah" — ia tidak masuk kelompok mana pun (null) dan tetap tampil
 * di "Semua".
 */
export const kelasBeban = (r: Pick<PengajarBaris, "beban" | "mengajar">): Beban | null =>
  !r.mengajar ? "0" : r.beban === 0 ? null : r.beban >= 3 ? "3" : (String(r.beban) as Beban);

/** Parsing searchParams yang tak dipercaya menjadi saringan yang sah. */
export function bacaSaringan(sp: Record<string, string | string[] | undefined>): Saringan {
  const satu = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const g = satu("g");
  const beban = satu("beban");
  const urut = satu("urut");
  return {
    q: satu("q")?.slice(0, 80),
    program: satu("program")?.slice(0, 120),
    g: g === "L" || g === "P" ? g : undefined,
    beban: beban === "0" || beban === "1" || beban === "2" || beban === "3" ? beban : undefined,
    urut: urut === "beban" || urut === "matrix" ? urut : undefined,
  };
}

const programDari = (r: PengajarBaris) => [
  ...r.penugasan.map((p) => p.program),
  ...r.terdaftar.map((t) => t.program),
  ...(r.syaikhMaahir || r.musyrifKelas.length ? [PROGRAM_MAAHIR] : []),
];

/** Semua saringan KECUALI beban — dipakai juga untuk menghitung chip beban. */
export function saringDasar(rows: PengajarBaris[], s: Saringan): PengajarBaris[] {
  const q = s.q ? kunciNama(s.q) : null;
  // Cari juga dengan potongan nomor HP (≥ 4 digit), tanpa peduli awalan 0/62.
  const digit = (s.q ?? "").replace(/\D/g, "").replace(/^(62|0)/, "");
  const cocok = (r: PengajarBaris) =>
    !q ||
    kunciNama(r.nama).includes(q) ||
    (digit.length >= 4 && (r.hp ?? "").replace(/\D/g, "").includes(digit)) ||
    r.penugasan.some((p) => p.halaqah.some((h) => kunciNama(h.nama).includes(q)));
  return rows.filter(
    (r) =>
      cocok(r) &&
      (!s.program || programDari(r).includes(s.program)) &&
      (!s.g || r.gender === s.g),
  );
}

export function terapkanSaringan(rows: PengajarBaris[], s: Saringan): PengajarBaris[] {
  const dasar = saringDasar(rows, s).filter((r) => !s.beban || kelasBeban(r) === s.beban);
  const nama = (a: PengajarBaris, b: PengajarBaris) => a.nama.localeCompare(b.nama, "id", { sensitivity: "base" });
  if (s.urut === "beban") return [...dasar].sort((a, b) => a.beban - b.beban || nama(a, b));
  // Skor matrix tertinggi dulu; yang belum dinilai di belakang.
  if (s.urut === "matrix")
    return [...dasar].sort((a, b) => (b.matrix?.skor ?? -1) - (a.matrix?.skor ?? -1) || nama(a, b));
  return dasar;
}

export function hitungBeban(rows: PengajarBaris[]): Record<Beban, number> {
  const n: Record<Beban, number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
  for (const r of rows) {
    const k = kelasBeban(r);
    if (k) n[k] += 1;
  }
  return n;
}

export function daftarProgram(rows: PengajarBaris[]): string[] {
  return [...new Set(rows.flatMap(programDari))].sort((a, b) => a.localeCompare(b));
}

/** Satu sel teks "HITS Reguler · Juni 2026 (2)" per penugasan — untuk CSV. */
export function teksPenugasan(p: Penugasan): string {
  return `${p.program}${p.batch ? ` · ${p.batch}` : ""} (${p.halaqah.length})`;
}

/** "Syaikh Maahir", "Musyrif Maahir (Alif)", "Kelompok Ar-Rahman · ketua" — keterangan peran. */
export function peranTambahan(r: PengajarBaris): string[] {
  const out: string[] = [];
  if (r.syaikhMaahir) out.push("Syaikh Maahir");
  if (r.musyrifKelas.length) out.push(`Musyrif Maahir (${r.musyrifKelas.join(", ")})`);
  const kel = r.rosterHits?.kelompok;
  // Nama kelompok Maahir biasanya sudah "Kelompok 4 Ikhwan" — jangan diawali dua kali.
  if (kel) out.push(`${/^kelompok\b/i.test(kel) ? kel : `Kelompok ${kel}`}${r.rosterHits!.ketua ? " · ketua" : ""}`);
  else if (r.rosterHits?.ketua) out.push("Ketua kelompok");
  return out;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-09" → "Sep 2026". */
export function labelBulan(ym: string): string {
  const [y, mo] = ym.split("-").map(Number);
  return mo >= 1 && mo <= 12 ? `${BULAN[mo - 1]} ${y}` : ym;
}
