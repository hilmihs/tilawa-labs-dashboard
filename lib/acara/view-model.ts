import type { DivisiTokenPayload } from "@/lib/auth/divisi-token";
import { diffDaysISO } from "@/lib/time/jakarta";
import { BARANG_PERUNTUKAN, LABEL_PERUNTUKAN, TUGAS_STATUS_BERES, TUGAS_STATUS_TERKUNCI, type BarangPeruntukan } from "./types";

/**
 * Fungsi murni: hasil query → bentuk siap tampil. Tidak ada DB, tidak ada
 * Date.now() — "hari ini" selalu dioper sebagai YYYY-MM-DD WIB oleh pemanggil
 * (lib/time/jakarta.ts), supaya halaman dan XLSX membaca angka yang sama dan
 * uji tidak bergantung pada jam mesin.
 */

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * jumlah × harga_satuan. Tidak pernah dibaca dari kolom tersimpan: di berkas
 * the institute 2 kolom Total Harga sering tidak sinkron dengan harga × jumlah.
 * Kolom numeric datang dari pg sebagai string.
 */
export function totalHarga(
  jumlah: string | number | null | undefined,
  hargaSatuan: string | number | null | undefined,
): number | null {
  const j = toNum(jumlah);
  const h = toNum(hargaSatuan);
  if (j === null || h === null) return null;
  return Math.round(j * h * 100) / 100;
}

export function isBeres(status: string): boolean {
  return (TUGAS_STATUS_BERES as readonly string[]).includes(status);
}

/** Token divisi hanya boleh menggeser status yang bukan keputusan koordinator. */
export function bolehUbahStatusTugas(status: string): boolean {
  return !(TUGAS_STATUS_TERKUNCI as readonly string[]).includes(status);
}

/**
 * Angka yang diketik panitia Indonesia → string untuk kolom pg numeric(12,2).
 * Titik dibaca sebagai pemisah ribuan dan koma sebagai desimal ("150.000",
 * "1.500,25") karena begitulah HP panitia menampilkannya; membaca "1.5"
 * sebagai satu setengah akan menjadikan harga Rp 150.000 sebagai Rp 150.
 * Batas 10 digit bulat + 2 desimal mengikuti numeric(12,2): lebih dari itu
 * ditolak di sini, bukan dibulatkan diam-diam oleh pg atau meledak sebagai
 * galat "numeric field overflow".
 */
export function parseAngkaId(v: unknown): string | null {
  if (typeof v === "number") {
    // Angka JS tidak pernah membawa pemisah ribuan: titiknya selalu desimal,
    // jadi jangan lewat jalur string ("1.555" akan terbaca 1555).
    if (!Number.isFinite(v) || v < 0) return null;
    const m = /^(\d+)(?:\.(\d+))?$/.exec(String(v));
    if (!m) return null; // notasi eksponen (1e21) atau bentuk lain
    if (m[1].length > 10 || (m[2]?.length ?? 0) > 2) return null;
    return String(v);
  }
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  // Titik tunggal dengan 1–2 digit di belakangnya ("2.5") tidak mungkin
  // ribuan (ribuan selalu tepat tiga digit) — dibaca sebagai desimal.
  const m = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?$/.exec(t) ?? /^(\d+)\.(\d{1,2})$/.exec(t);
  if (!m) return null;
  const bulat = m[1].replace(/\./g, "");
  const desimal = m[2] ?? "";
  if (bulat.length > 10 || desimal.length > 2) return null;
  return desimal ? `${bulat}.${desimal}` : bulat;
}

/**
 * Kebalikan parseAngkaId untuk tampilan: "2.00" → "2", "1.50" → "1,5".
 * pg mengembalikan numeric(12,2) dengan dua desimal tetap; panitia membaca
 * "2 pcs", bukan "2.00 pcs".
 */
export function formatJumlah(v: string | number | null): string | null {
  const n = toNum(v);
  if (n === null) return null;
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/**
 * tenggat < hari ini AND status belum beres. Status "terlambat" tidak pernah
 * disimpan — status tersimpan yang bisa basi akan basi.
 */
export function isTerlambat(t: { tenggat: string | null; status: string }, today: string): boolean {
  if (!t.tenggat) return false;
  if (isBeres(t.status)) return false;
  return t.tenggat < today;
}

/** Hari menuju hari-H: positif sebelum, 0 pada hari-H, negatif sesudah. */
export function hMinus(tanggalAcara: string, today: string): number {
  return diffDaysISO(tanggalAcara, today);
}

export type ProgresDivisi = {
  divisiId: string;
  nama: string;
  sisi: string;
  selesai: number;
  total: number;
  persen: number | null; // null bila belum ada tugas
};

/**
 * Selesai / total per divisi. Divisi terendah di atas (bukan abjad) — dashboard
 * harus menuntun ke tindakan. Divisi tanpa tugas di paling bawah: belum ada
 * yang bisa dinilai. Tugas lintas divisi (divisiId null) tidak dihitung.
 */
export function progresDivisi(
  divisi: ReadonlyArray<{ id: string; nama: string; sisi: string }>,
  tugas: ReadonlyArray<{ divisiId: string | null; status: string }>,
): ProgresDivisi[] {
  const acc = new Map<string, { selesai: number; total: number }>();
  for (const d of divisi) acc.set(d.id, { selesai: 0, total: 0 });
  for (const t of tugas) {
    if (!t.divisiId) continue;
    const a = acc.get(t.divisiId);
    if (!a) continue;
    a.total++;
    if (isBeres(t.status)) a.selesai++;
  }
  return divisi
    .map((d) => {
      const a = acc.get(d.id)!;
      return {
        divisiId: d.id,
        nama: d.nama,
        sisi: d.sisi,
        selesai: a.selesai,
        total: a.total,
        persen: a.total === 0 ? null : Math.round((a.selesai / a.total) * 100),
      };
    })
    .sort((x, y) => {
      if (x.persen === null && y.persen === null) return 0;
      if (x.persen === null) return 1;
      if (y.persen === null) return -1;
      return x.persen - y.persen;
    });
}

export type TugasPapan<T> = T & { terlambat: boolean; beres: boolean };

/**
 * Urutan papan divisi: terlambat (tenggat terdekat dulu) → terbuka (tenggat
 * naik, tanpa tenggat terakhir) → beres. Yang terlambat harus di paling atas
 * dengan penanda merah — itu satu-satunya hal yang harus terlihat tanpa scroll.
 */
export function susunPapanTugas<T extends { tenggat: string | null; status: string }>(
  rows: ReadonlyArray<T>,
  today: string,
): TugasPapan<T>[] {
  const rank = (t: TugasPapan<T>) => (t.terlambat ? 0 : t.beres ? 2 : 1);
  const tenggatKey = (t: T) => t.tenggat ?? "9999-12-31";
  return rows
    .map((t) => ({ ...t, terlambat: isTerlambat(t, today), beres: isBeres(t.status) }))
    .sort((a, b) => rank(a) - rank(b) || tenggatKey(a).localeCompare(tenggatKey(b)));
}

export type RingkasRab = {
  diajukan: number;
  disetujui: number;
  ditolak: number;
  /** Baris beli yang belum punya harga/jumlah — jumlah Rp di atas belum lengkap. */
  tanpaHarga: number;
  /** Baris beli dengan status_approval di luar kosakata — tidak masuk angka mana pun. */
  lain: number;
};

/**
 * Angka RAB: hanya sumber=beli. Barang pinjam/venue tidak masuk anggaran.
 * Baris tanpa harga dan baris berstatus asing dihitung terpisah, bukan
 * dijadikan nol diam-diam: di the institute 2 total RAB terlihat "beres" padahal
 * belasan baris belum berharga, dan itu baru ketahuan sesudah acara.
 */
export function ringkasRab(
  rows: ReadonlyArray<{
    sumber: string | null;
    statusApproval: string;
    jumlah: string | number | null;
    hargaSatuan: string | number | null;
  }>,
): RingkasRab {
  const out: RingkasRab = { diajukan: 0, disetujui: 0, ditolak: 0, tanpaHarga: 0, lain: 0 };
  for (const b of rows) {
    if (b.sumber !== "beli") continue;
    const total = totalHarga(b.jumlah, b.hargaSatuan);
    if (total === null) out.tanpaHarga++;
    if (b.statusApproval === "diajukan" || b.statusApproval === "disetujui" || b.statusApproval === "ditolak") {
      out[b.statusApproval] += total ?? 0;
    } else {
      out.lain++;
    }
  }
  return out;
}

export type HakAkses = "tulis" | "baca";

/**
 * Apa yang boleh dilakukan pemegang token terhadap divisi `target`:
 * divisinya sendiri → tulis; divisi lain di acara yang sama → baca; acara lain → null.
 * Semua divisi saling terlihat (keputusan 11 Sep 2026) — evaluasi the institute 2 menyebut
 * "tidak ada komunikasi antar PIC" sebagai kegagalan utama. Tulis tetap hanya ke
 * divisi sendiri supaya jejak di acara_log tetap bermakna.
 * `divisiToken` adalah baris divisi yang dimuat dari payload.did — bila id-nya
 * tidak cocok, pemanggil salah memuat dan jawabannya null.
 */
export function hakAksesDivisi(
  payload: DivisiTokenPayload,
  divisiToken: { id: string; acaraId: string },
  target: { id: string; acaraId: string },
): HakAkses | null {
  if (divisiToken.id !== payload.did) return null;
  if (target.acaraId !== divisiToken.acaraId) return null;
  return target.id === payload.did ? "tulis" : "baca";
}

export type TerlambatDivisi = { divisiId: string; nama: string; sisi: string; jumlah: number };

/** Jumlah tugas terlambat per divisi, terbanyak di atas; divisi tanpa keterlambatan tidak ikut. */
export function terlambatPerDivisi(
  divisi: ReadonlyArray<{ id: string; nama: string; sisi: string }>,
  tugas: ReadonlyArray<{ divisiId: string | null; tenggat: string | null; status: string }>,
  today: string,
): TerlambatDivisi[] {
  const n = new Map<string, number>();
  for (const t of tugas) {
    if (!t.divisiId || !isTerlambat(t, today)) continue;
    n.set(t.divisiId, (n.get(t.divisiId) ?? 0) + 1);
  }
  return divisi
    .filter((d) => (n.get(d.id) ?? 0) > 0)
    .map((d) => ({ divisiId: d.id, nama: d.nama, sisi: d.sisi, jumlah: n.get(d.id)! }))
    .sort((a, b) => b.jumlah - a.jumlah);
}

/** Satu-satunya laporan yang dibutuhkan setelah acara: barang harus_kembali yang belum kembali. */
export function barangBelumKembali<T extends { kriteria: string | null; sudahKembali: boolean }>(rows: ReadonlyArray<T>): T[] {
  return rows.filter((b) => b.kriteria === "harus_kembali" && !b.sudahKembali);
}

export type FilterTugas = { divisiId?: string; fase?: number; status?: string; terlambat?: boolean };

/** Saringan papan staff. `divisiId: "lintas"` = tugas tanpa divisi. Terlambat dihitung, bukan dibaca. */
export function saringTugas<T extends { divisiId: string | null; fase: number; status: string; tenggat: string | null }>(
  rows: ReadonlyArray<T>,
  f: FilterTugas,
  today: string,
): T[] {
  return rows.filter((t) => {
    if (f.divisiId === "lintas" && t.divisiId !== null) return false;
    if (f.divisiId && f.divisiId !== "lintas" && t.divisiId !== f.divisiId) return false;
    if (f.fase !== undefined && t.fase !== f.fase) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.terlambat && !isTerlambat(t, today)) return false;
    return true;
  });
}

export type KelompokRab<T> = { label: string; rows: T[]; subtotal: number };

/**
 * RAB = query di atas acara_barang, bukan tabel (spec §1.1). Hanya sumber=beli.
 * Dikelompokkan seperti berkas RAB the institute 2: barang peruntukan "divisi" per divisi
 * pengaju, lalu satu kelompok per peruntukan lain (ustadz & keluarga, panitia,
 * peserta, internal) — barang untuk keluarga ustadz yang diajukan LO tidak
 * boleh tercampur dengan barang LO sendiri (uji #10).
 */
export function kelompokRab<T extends { divisiId: string; peruntukan: string; sumber: string | null; statusApproval: string; jumlah: string | number | null; hargaSatuan: string | number | null }>(
  rows: ReadonlyArray<T>,
  divisi: ReadonlyArray<{ id: string; nama: string; sisi: string }>,
  approval?: string,
): { kelompok: KelompokRab<T>[]; total: number } {
  const beli = rows.filter((r) => r.sumber === "beli" && (!approval || r.statusApproval === approval));
  const sub = (xs: T[]) => xs.reduce((s, r) => s + (totalHarga(r.jumlah, r.hargaSatuan) ?? 0), 0);
  const kelompok: KelompokRab<T>[] = [];
  for (const d of divisi) {
    const xs = beli.filter((r) => r.peruntukan === "divisi" && r.divisiId === d.id);
    if (xs.length) kelompok.push({ label: `${d.nama} (${d.sisi})`, rows: xs, subtotal: sub(xs) });
  }
  for (const p of BARANG_PERUNTUKAN) {
    if (p === "divisi") continue;
    const xs = beli.filter((r) => r.peruntukan === p);
    if (xs.length) kelompok.push({ label: LABEL_PERUNTUKAN[p as BarangPeruntukan], rows: xs, subtotal: sub(xs) });
  }
  return { kelompok, total: kelompok.reduce((s, k) => s + k.subtotal, 0) };
}
