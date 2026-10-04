/**
 * Fungsi murni presensi: terlambat, jendela scan, ringkasan hari-H, roster
 * pemindai, dan perencanaan batch scan. Tidak menyentuh DB; diuji di
 * view-model.test.ts. Semua jam dibaca sebagai WIB (+07:00).
 */
import { JAKARTA_OFFSET_MS } from "@/lib/time/jakarta";

export type Konfirmasi = "bisa" | "belum_bisa" | null;
export type MetodeHadir = "qr" | "cari_nama" | "manual" | "nawa";

/** Satu baris orang dalam konteks satu acara: pendaftaran ⋈ orang ⋈ hadir. */
export type OrangAcaraRow = {
  id: string;
  nama: string;
  gender: string; // 'L' | 'P'
  programTeks: string | null;
  kategori: string;
  kodeQr: string;
  wa: string | null;
  konfirmasi: Konfirmasi;
  alasan: string | null;
  hadirAt: string | null; // ISO
  metode: MetodeHadir | null;
  golongan: string[]; // slug golongan orang ini
};

export type AcaraPresensi = {
  tanggal: string; // YYYY-MM-DD
  jamMulai: string | null; // 'HH:MM' atau 'HH:MM:SS'
  toleransiMenit: number;
  scanBukaAt: string | null; // ISO
  scanTutupAt: string | null; // ISO
};

/** Ambang terlambat sebagai epoch ms; null bila jam mulai belum diisi. */
export function ambangTerlambatMs(a: Pick<AcaraPresensi, "tanggal" | "jamMulai" | "toleransiMenit">): number | null {
  if (!a.jamMulai) return null;
  const [h, m] = a.jamMulai.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const mulai = Date.parse(`${a.tanggal}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`);
  if (Number.isNaN(mulai)) return null;
  return mulai + (a.toleransiMenit ?? 0) * 60_000;
}

export function terlambat(waktuISO: string, a: Pick<AcaraPresensi, "tanggal" | "jamMulai" | "toleransiMenit">): boolean {
  const ambang = ambangTerlambatMs(a);
  if (ambang === null) return false;
  const t = Date.parse(waktuISO);
  return Number.isFinite(t) && t > ambang;
}

/** Null di salah satu ujung = tanpa batas di ujung itu. */
export function dalamJendela(waktuISO: string, bukaISO: string | null, tutupISO: string | null): boolean {
  const t = Date.parse(waktuISO);
  if (!Number.isFinite(t)) return false;
  if (bukaISO && t < Date.parse(bukaISO)) return false;
  if (tutupISO && t > Date.parse(tutupISO)) return false;
  return true;
}

/** 'HH:MM' WIB dari ISO. */
export function jamWibDari(iso: string): string {
  const d = new Date(Date.parse(iso) + JAKARTA_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export type RingkasanHadir = {
  terdaftar: number;
  hadir: number;
  bisa: number;
  belumBisa: number;
  tanpaJawaban: number;
  noShow: number; // bisa tapi belum hadir
  hadirTanpaRsvp: number; // hadir dengan konfirmasi belum_bisa/null
  terlambat: number;
  perGender: { L: { terdaftar: number; hadir: number }; P: { terdaftar: number; hadir: number } };
  perProgram: { program: string; terdaftar: number; bisa: number; hadir: number }[];
  histogram: { jam: string; jumlah: number }[]; // per 10 menit WIB, hanya bucket berisi, urut
};

export function ringkasHadir(rows: readonly OrangAcaraRow[], a: AcaraPresensi): RingkasanHadir {
  const r: RingkasanHadir = {
    terdaftar: rows.length, hadir: 0, bisa: 0, belumBisa: 0, tanpaJawaban: 0, noShow: 0, hadirTanpaRsvp: 0, terlambat: 0,
    perGender: { L: { terdaftar: 0, hadir: 0 }, P: { terdaftar: 0, hadir: 0 } },
    perProgram: [], histogram: [],
  };
  const prog = new Map<string, { program: string; terdaftar: number; bisa: number; hadir: number }>();
  const hist = new Map<string, number>();
  for (const o of rows) {
    const g = o.gender === "P" ? "P" : "L";
    r.perGender[g].terdaftar++;
    const p = o.programTeks?.trim() || "Tanpa program";
    const pp = prog.get(p) ?? { program: p, terdaftar: 0, bisa: 0, hadir: 0 };
    pp.terdaftar++;
    if (o.konfirmasi === "bisa") { r.bisa++; pp.bisa++; } else if (o.konfirmasi === "belum_bisa") r.belumBisa++; else r.tanpaJawaban++;
    if (o.hadirAt) {
      r.hadir++; pp.hadir++; r.perGender[g].hadir++;
      if (o.konfirmasi !== "bisa") r.hadirTanpaRsvp++;
      if (terlambat(o.hadirAt, a)) r.terlambat++;
      const jam = jamWibDari(o.hadirAt);
      const bucket = `${jam.slice(0, 3)}${jam[3]}0`;
      hist.set(bucket, (hist.get(bucket) ?? 0) + 1);
    } else if (o.konfirmasi === "bisa") r.noShow++;
    prog.set(p, pp);
  }
  r.perProgram = [...prog.values()].sort((x, y) => y.terdaftar - x.terdaftar || x.program.localeCompare(y.program));
  r.histogram = [...hist.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([jam, jumlah]) => ({ jam, jumlah }));
  return r;
}

/** Yang diunduh pemindai: tanpa WA penuh — HP panitia adalah HP pribadi. */
export type RosterEntri = {
  id: string;
  nama: string;
  kode: string;
  gender: string;
  program: string | null;
  konfirmasi: Konfirmasi;
  waAkhir4: string | null;
  hadirAt: string | null;
  golongan: string[];
  /** Anggota golongan yang ditandai wajib di acara ini — pemindai menandai yang bukan. */
  wajib: boolean;
};

export function rosterScanner(rows: readonly OrangAcaraRow[], wajibIds: ReadonlySet<string> = new Set()): RosterEntri[] {
  return rows.map((o) => ({
    id: o.id,
    nama: o.nama,
    kode: o.kodeQr,
    gender: o.gender,
    program: o.programTeks,
    konfirmasi: o.konfirmasi,
    waAkhir4: o.wa && o.wa.length >= 4 ? o.wa.slice(-4) : null,
    hadirAt: o.hadirAt,
    golongan: o.golongan,
    wajib: wajibIds.has(o.id),
  }));
}

export type ScanEvent = {
  klienId: string;
  orangId: string;
  waktu: string; // ISO
  metode: MetodeHadir;
  perangkatId?: string | null;
};

export type StatusScan = "baru" | "sudah" | "ditolak_jendela" | "tak_dikenal";

/**
 * Rencana tulis untuk satu batch dari antrean pemindai: buang klien_id ganda
 * (kiriman ulang), satu orang hanya satu kali (yang paling awal), tolak yang di
 * luar jendela, dan tandai "sudah" bila DB sudah punya barisnya. Hasil `tulis`
 * masih harus melewati ON CONFLICT DO NOTHING di DB — dua pemindai offline bisa
 * sama-sama memegang orang yang sama.
 */
export function rencanakanBatch(
  events: readonly ScanEvent[],
  sudahHadir: ReadonlySet<string>,
  orangDikenal: ReadonlySet<string>,
  jendela: { bukaISO: string | null; tutupISO: string | null },
): { tulis: ScanEvent[]; status: Map<string, StatusScan> } {
  const status = new Map<string, StatusScan>();
  const tulis: ScanEvent[] = [];
  const lihatKlien = new Set<string>();
  const lihatOrang = new Set<string>();
  const urut = [...events].sort((x, y) => x.waktu.localeCompare(y.waktu));
  for (const e of urut) {
    if (lihatKlien.has(e.klienId)) continue;
    lihatKlien.add(e.klienId);
    if (!orangDikenal.has(e.orangId)) { status.set(e.klienId, "tak_dikenal"); continue; }
    if (!dalamJendela(e.waktu, jendela.bukaISO, jendela.tutupISO)) { status.set(e.klienId, "ditolak_jendela"); continue; }
    if (sudahHadir.has(e.orangId) || lihatOrang.has(e.orangId)) { status.set(e.klienId, "sudah"); continue; }
    lihatOrang.add(e.orangId);
    tulis.push(e);
    status.set(e.klienId, "baru");
  }
  return { tulis, status };
}

export const LABEL_KONFIRMASI: Record<"bisa" | "belum_bisa" | "null", string> = {
  bisa: "Konfirmasi bisa",
  belum_bisa: "Belum bisa",
  null: "Tanpa konfirmasi",
};

export function labelKonfirmasi(k: Konfirmasi): string {
  return LABEL_KONFIRMASI[k ?? "null"];
}
