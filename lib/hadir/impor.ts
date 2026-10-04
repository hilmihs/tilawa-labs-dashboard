/**
 * Impor respons form kajian (xlsx Google Form) menjadi rencana tulis
 * orang + pendaftaran. Murni: pencocokan diberi peta dari pemanggil.
 *
 * Kolom form 3 Sep 2026: Timestamp, Nama Lengkap, Jenis Kelamin,
 * Mengajar dalam program, Konfirmasi kehadiran Pengajar, Alasan tidak bisa hadir.
 * Nama kolom dicocokkan longgar (huruf kecil, awalan) supaya form berikutnya
 * yang sedikit berbeda tetap terbaca; yang tak terbaca DILAPORKAN, tidak dibuang diam-diam.
 */
import { namaKunci } from "./nama";
import type { Konfirmasi } from "./view-model";

export type BarisForm = {
  nama: string;
  gender: "L" | "P";
  programTeks: string | null;
  konfirmasi: Konfirmasi;
  alasan: string | null;
  wa: string | null; // bila form punya kolom HP
};

const KOLOM: Record<keyof BarisForm, string[]> = {
  nama: ["nama lengkap", "nama", "name"],
  gender: ["jenis kelamin", "gender", "ikhwan/akhwat"],
  programTeks: ["mengajar dalam program", "program", "mengajar di"],
  konfirmasi: ["konfirmasi kehadiran", "konfirmasi", "kehadiran"],
  alasan: ["alasan"],
  wa: ["nomor wa", "no wa", "whatsapp", "wa", "no hp", "nomor hp", "hp", "telepon"],
};

function cariKolom(header: readonly string[], kandidat: readonly string[]): string | null {
  const h = header.map((x) => [x, x.trim().toLowerCase()] as const);
  for (const k of kandidat) {
    const hit = h.find(([, l]) => l === k) ?? h.find(([, l]) => l.startsWith(k));
    if (hit) return hit[0];
  }
  return null;
}

export function tebakGender(v: unknown): "L" | "P" | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["perempuan", "akhwat", "p", "f", "female", "wanita"].includes(s)) return "P";
  if (["laki-laki", "laki laki", "ikhwan", "l", "m", "male", "pria"].includes(s)) return "L";
  return null;
}

export function tebakKonfirmasi(v: unknown): Konfirmasi {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("belum") || s.includes("tidak")) return "belum_bisa";
  if (s.includes("bisa") || s.includes("hadir") || s.includes("ya")) return "bisa";
  return null;
}

export type BarisDibaca = { no: number; baris: BarisForm | null; alasanTolak?: string };

/** Baris mentah (objek per header) → BarisForm; header tak dikenal dilaporkan lewat `kolomHilang`. */
export function bacaBarisForm(rows: readonly Record<string, unknown>[]): { baris: BarisDibaca[]; kolomHilang: string[] } {
  const header = rows.length ? Object.keys(rows[0]) : [];
  const peta: Partial<Record<keyof BarisForm, string>> = {};
  for (const k of Object.keys(KOLOM) as (keyof BarisForm)[]) {
    const c = cariKolom(header, KOLOM[k]);
    if (c) peta[k] = c;
  }
  const kolomHilang = (["nama", "gender"] as const).filter((k) => !peta[k]);
  const ambil = (r: Record<string, unknown>, k: keyof BarisForm) => {
    const c = peta[k];
    const v = c ? r[c] : undefined;
    const s = v === undefined || v === null ? "" : String(v).trim();
    return s;
  };
  const baris: BarisDibaca[] = rows.map((r, i) => {
    const nama = ambil(r, "nama").replace(/\s+/g, " ");
    if (nama.length < 2) return { no: i + 2, baris: null, alasanTolak: "nama kosong" };
    const gender = tebakGender(ambil(r, "gender"));
    if (!gender) return { no: i + 2, baris: null, alasanTolak: `jenis kelamin tak terbaca: "${ambil(r, "gender")}"` };
    return {
      no: i + 2,
      baris: {
        nama,
        gender,
        programTeks: ambil(r, "programTeks") || null,
        konfirmasi: tebakKonfirmasi(ambil(r, "konfirmasi")),
        alasan: ambil(r, "alasan") || null,
        wa: ambil(r, "wa") || null,
      },
    };
  });
  return { baris, kolomHilang };
}

export type StatusCocok = "cocok_wa" | "cocok_nama" | "baru" | "ragu";

export type RencanaOrang = {
  status: StatusCocok;
  orangId: string | null; // terisi bila cocok
  input: BarisForm & { namaKunci: string; wa: string | null };
  /** nomor baris sumber (semua kemunculan; nama dobel dalam satu file digabung) */
  dariBaris: number[];
};

export type KonteksCocok = {
  /** wa (62…) → orang.id */
  byWa: ReadonlyMap<string, string>;
  /** nama_kunci → daftar orang.id (bisa >1) */
  byNamaKunci: ReadonlyMap<string, readonly string[]>;
  /** nama_kunci → HP dari guru_sync (untuk melengkapi baris baru tanpa HP) */
  teleponByNamaKunci: ReadonlyMap<string, string>;
  /** normalisasi HP dari pemanggil (lib/wa.ts), supaya modul ini tetap murni */
  normalisasiWa: (raw: string | null) => string | null;
};

/**
 * Aturan (urut): WA sama → cocok_wa; nama_kunci sama & tepat satu → cocok_nama;
 * nama_kunci sama tapi >1 → ragu (perlu_review, tidak menempel ke siapa pun);
 * selain itu → baru. Nama yang muncul dua kali di file = satu orang; jawaban
 * konfirmasi terakhir yang dipakai (orang mengisi ulang untuk mengoreksi).
 */
export function siapkanImporForm(baris: readonly BarisDibaca[], ctx: KonteksCocok): RencanaOrang[] {
  const perKunci = new Map<string, RencanaOrang>();
  for (const b of baris) {
    if (!b.baris) continue;
    const kunci = namaKunci(b.baris.nama);
    const waForm = ctx.normalisasiWa(b.baris.wa);
    const ada = perKunci.get(kunci);
    if (ada) {
      ada.dariBaris.push(b.no);
      ada.input = { ...ada.input, konfirmasi: b.baris.konfirmasi, alasan: b.baris.alasan, programTeks: b.baris.programTeks ?? ada.input.programTeks, wa: ada.input.wa ?? waForm };
      continue;
    }
    const wa = waForm ?? ctx.teleponByNamaKunci.get(kunci) ?? null;
    let status: StatusCocok = "baru";
    let orangId: string | null = null;
    const viaWa = wa ? ctx.byWa.get(wa) : undefined;
    if (viaWa) { status = "cocok_wa"; orangId = viaWa; }
    else {
      const kandidat = ctx.byNamaKunci.get(kunci) ?? [];
      if (kandidat.length === 1) { status = "cocok_nama"; orangId = kandidat[0]; }
      else if (kandidat.length > 1) status = "ragu";
    }
    perKunci.set(kunci, { status, orangId, input: { ...b.baris, namaKunci: kunci, wa }, dariBaris: [b.no] });
  }
  return [...perKunci.values()];
}

export function ringkasRencana(r: readonly RencanaOrang[]): Record<StatusCocok | "berHp", number> {
  const out = { cocok_wa: 0, cocok_nama: 0, baru: 0, ragu: 0, berHp: 0 };
  for (const x of r) { out[x.status]++; if (x.input.wa) out.berHp++; }
  return out;
}
