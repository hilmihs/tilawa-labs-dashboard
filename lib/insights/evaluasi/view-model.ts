/**
 * Evaluasi (hasil ujian) — bentuk baris dan seluruh turunan angkanya, murni.
 *
 * Dipisah dari `index.ts` supaya komponen klien (tabel) bisa mengimpor tipe dan
 * penyaringnya tanpa ikut menarik driver database, dan supaya aturan "lulus"
 * bisa diuji tanpa DB.
 *
 * ── Dari mana datanya ────────────────────────────────────────────────────────
 * CMS tilawah tidak punya tabel nilai tersendiri. Sebuah pertemuan bertanda
 * `type_pertemuan = "ujian"` (tersimpan di `jadwal_sync.raw`), dan hasil ujian
 * tiap peserta ditulis ke baris presensi pertemuan itu juga: `lahn_jaliy`,
 * `lahn_khofiy`, dan `status` kehadiran. Panel guru menyimpannya lewat
 * `POST /api/presensis` yang sama persis dengan presensi biasa — jadi semuanya
 * sudah ikut tersinkron ke `attendance_sync` sejak awal.
 *
 * ── Aturan lulus ─────────────────────────────────────────────────────────────
 * {@link hasilUjian} menyalin apa adanya logika layar "Hasil Ujian" di CMS
 * (MeetingDetail): nilai lahn yang terisi berarti sudah diuji, dan verdict-nya
 * mengikuti status kehadiran pada pertemuan ujian tersebut. Aturan itu milik
 * upstream, bukan karangan dashboard ini — kalau upstream mengubahnya, ubah di
 * sini juga, jangan diperhalus diam-diam.
 */

/** Satu baris hasil: satu peserta pada satu pertemuan ujian. */
export type HasilBaris = {
  /** `attendance_sync.tilawah_presensi_id`, atau null bila peserta belum punya baris presensi. */
  presensiId: number | null;
  jadwalId: number;
  halaqahId: number;
  halaqahUserId: number | null;
  halaqah: string | null;
  pengajar: string | null;
  level: string | null;
  ujian: string | null;
  /** YYYY-MM-DD, apa adanya dari `jadwal_sync.schedule_date`. */
  tanggal: string | null;
  peserta: string | null;
  userCode: string | null;
  /** Kode presensi: 0 Alfa, 1 Hadir, 2 Telat, 3 Izin/Sakit. Null = belum ada baris. */
  status: number | null;
  lahnJaliy: number | null;
  lahnKhofiy: number | null;
  catatan: string | null;
};

/** Verdict upstream. `belum` = belum ada hasil apa pun, bukan "tidak lulus". */
export type Verdict = "lulus" | "tidak" | "belum";

/**
 * Aturan CMS, disalin dari bundel `MeetingDetail`:
 *
 * ```js
 * if (d) {
 *   if (d.lahn_jaliy != null) { hasUjian = true; isLulus = d.status === 1 }
 *   else if (d.status !== 1)  { hasUjian = true; isLulus = false }
 * }
 * ```
 *
 * Artinya: nilai lahn terisi → hasilnya ditentukan status kehadiran; tanpa nilai
 * lahn tapi tidak hadir → langsung tidak lulus; sisanya belum ada hasil.
 */
export function hasilUjian(status: number | null, lahnJaliy: number | null): Verdict {
  if (status == null) return "belum";
  if (lahnJaliy != null) return status === 1 ? "lulus" : "tidak";
  if (status !== 1) return "tidak";
  return "belum";
}

/** Nilai lahn sudah ditulis guru? Beda dari {@link hasilUjian}: seorang peserta
 *  bisa punya verdict "tidak" (karena alfa) tanpa satu angka pun tercatat. */
export function nilaiTercatat(baris: HasilBaris): boolean {
  return baris.lahnJaliy != null;
}

export function verdictOf(baris: HasilBaris): Verdict {
  return hasilUjian(baris.status, baris.lahnJaliy);
}

/** Rekap satu pertemuan ujian. */
export type UjianRingkas = {
  jadwalId: number;
  halaqahId: number;
  halaqah: string | null;
  pengajar: string | null;
  level: string | null;
  nama: string | null;
  tanggal: string | null;
  /** Tanggalnya sudah lewat (atau hari ini). Ujian yang belum jalan tidak dihitung sebagai tunggakan. */
  sudahLewat: boolean;
  peserta: number;
  lulus: number;
  tidak: number;
  belum: number;
  /** Berapa peserta yang angka lahn-nya benar-benar tertulis. */
  bernilai: number;
  rataJaliy: number | null;
  rataKhofiy: number | null;
};

function rata(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** Hari ini di Asia/Jakarta sebagai YYYY-MM-DD — `schedule_date` disimpan sebagai
 *  tanggal lokal, jadi membandingkannya dengan UTC bisa meleset sehari. */
export function hariIniJakarta(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function ringkasUjian(rows: HasilBaris[], hariIni = hariIniJakarta()): UjianRingkas[] {
  const byJadwal = new Map<number, HasilBaris[]>();
  for (const r of rows) {
    const list = byJadwal.get(r.jadwalId);
    if (list) list.push(r);
    else byJadwal.set(r.jadwalId, [r]);
  }

  const out: UjianRingkas[] = [];
  for (const [jadwalId, list] of byJadwal) {
    const head = list[0];
    // Baris sintetis (pertemuan ujian tanpa satu pun presensi) memakai
    // presensiId null; jangan dihitung sebagai peserta.
    const peserta = list.filter((r) => r.presensiId != null);
    const verdicts = peserta.map(verdictOf);
    out.push({
      jadwalId,
      halaqahId: head.halaqahId,
      halaqah: head.halaqah,
      pengajar: head.pengajar,
      level: head.level,
      nama: head.ujian,
      tanggal: head.tanggal,
      sudahLewat: head.tanggal != null && head.tanggal <= hariIni,
      peserta: peserta.length,
      lulus: verdicts.filter((v) => v === "lulus").length,
      tidak: verdicts.filter((v) => v === "tidak").length,
      belum: verdicts.filter((v) => v === "belum").length,
      bernilai: peserta.filter(nilaiTercatat).length,
      rataJaliy: rata(peserta.map((r) => r.lahnJaliy).filter((v): v is number => v != null)),
      rataKhofiy: rata(peserta.map((r) => r.lahnKhofiy).filter((v): v is number => v != null)),
    });
  }

  return out.sort((a, b) => (b.tanggal ?? "").localeCompare(a.tanggal ?? ""));
}

export type EvaluasiRingkas = {
  ujianTotal: number;
  ujianLewat: number;
  /** Ujian yang tanggalnya sudah lewat tapi belum satu peserta pun punya hasil. */
  ujianTanpaHasil: number;
  pesertaDiuji: number;
  adaHasil: number;
  lulus: number;
  tidak: number;
  belum: number;
  bernilai: number;
  /** `adaHasil / pesertaDiuji` dalam persen, atau null bila belum ada yang diuji. */
  persenAdaHasil: number | null;
  rataJaliy: number | null;
  rataKhofiy: number | null;
};

export function ringkasEvaluasi(rows: HasilBaris[], ujian: UjianRingkas[]): EvaluasiRingkas {
  const peserta = rows.filter((r) => r.presensiId != null);
  const verdicts = peserta.map(verdictOf);
  const lulus = verdicts.filter((v) => v === "lulus").length;
  const tidak = verdicts.filter((v) => v === "tidak").length;
  const belum = verdicts.filter((v) => v === "belum").length;
  const adaHasil = lulus + tidak;

  return {
    ujianTotal: ujian.length,
    ujianLewat: ujian.filter((u) => u.sudahLewat).length,
    ujianTanpaHasil: ujian.filter((u) => u.sudahLewat && u.lulus + u.tidak === 0).length,
    pesertaDiuji: peserta.length,
    adaHasil,
    lulus,
    tidak,
    belum,
    bernilai: peserta.filter(nilaiTercatat).length,
    persenAdaHasil:
      peserta.length === 0 ? null : Math.round((adaHasil / peserta.length) * 1000) / 10,
    rataJaliy: rata(peserta.map((r) => r.lahnJaliy).filter((v): v is number => v != null)),
    rataKhofiy: rata(peserta.map((r) => r.lahnKhofiy).filter((v): v is number => v != null)),
  };
}

// ── Penyaring tabel ──────────────────────────────────────────────────────────

export type HasilFilter = "semua" | "lulus" | "tidak" | "belum";

export const HASIL_FILTER: HasilFilter[] = ["semua", "lulus", "tidak", "belum"];

export const HASIL_FILTER_LABEL: Record<HasilFilter, string> = {
  semua: "Semua",
  lulus: "Lulus",
  tidak: "Tidak lulus",
  belum: "Belum ada hasil",
};

export function resolveFilter(value: string | undefined): HasilFilter {
  return (HASIL_FILTER as string[]).includes(value ?? "") ? (value as HasilFilter) : "semua";
}

export function filterHasil(rows: HasilBaris[], filter: HasilFilter): HasilBaris[] {
  if (filter === "semua") return rows;
  return rows.filter((r) => verdictOf(r) === filter);
}

// ── Format ───────────────────────────────────────────────────────────────────

/** "26 Agu 2026" — tanggal ditulis apa adanya, tanpa konversi zona (sudah lokal). */
export function formatTanggal(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const bulan = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  return `${d} ${bulan[m - 1]} ${y}`;
}
