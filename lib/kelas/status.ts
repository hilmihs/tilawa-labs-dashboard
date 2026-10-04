/**
 * Status kelas: masih berjalan, sudah selesai, atau belum mulai — dasar angka
 * "Peserta aktif" di Beranda dan tab Berjalan · Selesai di /peserta dan /kelas.
 *
 * Kenapa perlu: status pendaftaran di tilawah tidak berubah saat kelas tamat,
 * jadi per 23 Sep 2026 ±2.200 dari 3.711 "peserta aktif" sebenarnya duduk di
 * kelas yang pertemuan terakhirnya sudah lewat (HITS Juni & Januari, DPQ, LAZ
 * #40–#42). Keputusan pemilik 29 Sep 2026: aktif = kelas berjalan; yang
 * selesai tetap terlihat sebagai riwayat.
 *
 * Sumber tanggal:
 *  - tilawah: pertemuan pertama & terakhir kelas itu di `jadwal_sync` (tilawah
 *    membuat semua pertemuan di muka). Halaqah tanpa jadwal (terpangkas dari
 *    cermin) memakai rentang programnya.
 *  - Mabni: cermin jadwalnya hanya beberapa pekan ke depan, jadi dipakai nama
 *    periode kelas ("July 2026 - March 2027") — selesai setelah bulan akhirnya.
 *  - Maahir: grid rekap bulan berjalan, selalu berjalan.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export type StatusKelas = "berjalan" | "selesai" | "belum_mulai";
export type Rentang = { awal: string | null; akhir: string | null };

export const LABEL_STATUS: Record<StatusKelas, string> = {
  berjalan: "Berjalan",
  selesai: "Selesai",
  belum_mulai: "Belum mulai",
};

const BULAN: Record<string, number> = {
  jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, maret: 3,
  apr: 4, april: 4, may: 5, mei: 5, jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7,
  aug: 8, august: 8, agu: 8, agustus: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10,
  nov: 11, november: 11, dec: 12, december: 12, des: 12, desember: 12,
};

/** "July 2026 - March 2027" → { awal: "2026-07-01", akhir: "2027-03-31" }; tak terbaca → null. */
export function rentangPeriode(nama: string | null | undefined): Rentang | null {
  if (!nama) return null;
  const cocok = [...nama.toLowerCase().matchAll(/([a-z]+)\s+(\d{4})/g)]
    .map((m) => ({ bulan: BULAN[m[1]], tahun: Number(m[2]) }))
    .filter((x) => x.bulan);
  if (cocok.length < 2) return null;
  const a = cocok[0];
  const b = cocok[cocok.length - 1];
  const hariAkhir = new Date(Date.UTC(b.tahun, b.bulan, 0)).getUTCDate();
  const dua = (n: number) => String(n).padStart(2, "0");
  return { awal: `${a.tahun}-${dua(a.bulan)}-01`, akhir: `${b.tahun}-${dua(b.bulan)}-${dua(hariAkhir)}` };
}

/** Tanpa tanggal sama sekali dianggap berjalan: lebih baik terhitung daripada hilang diam-diam. */
export function statusDariRentang(r: Rentang | null | undefined, hariIni: string): StatusKelas {
  if (r?.akhir && r.akhir < hariIni) return "selesai";
  if (r?.awal && r.awal > hariIni) return "belum_mulai";
  return "berjalan";
}

/** Peserta masih aktif bila setidaknya satu kelasnya belum selesai. */
export const masihAktif = (status: readonly StatusKelas[]) => status.some((s) => s !== "selesai");

export type PetaRentang = {
  /** Rentang satu kelas, kunci `${programId}:${halaqahId}`. */
  kelas: (programId: string, halaqahId: number | null, sumber: string, periodeNama?: string | null) => Rentang | null;
};

/** Baca rentang pertemuan semua kelas program-program ini sekaligus. */
export async function bacaRentangKelas(programIds: readonly string[]): Promise<PetaRentang> {
  const perKelas = new Map<string, Rentang>();
  const perProgram = new Map<string, Rentang>();
  if (programIds.length > 0) {
    const ids = sql`array[${sql.join(programIds.map((i) => sql`${i}`), sql`, `)}]::uuid[]`;
    const res = await getDb().execute(sql`
      select program_id::text pid, tilawah_halaqah_id hid, min(schedule_date)::text awal, max(schedule_date)::text akhir
      from jadwal_sync
      where program_id = any(${ids})
      group by grouping sets ((program_id, tilawah_halaqah_id), (program_id))`);
    for (const r of res.rows as { pid: string; hid: number | null; awal: string | null; akhir: string | null }[]) {
      if (r.hid == null) perProgram.set(r.pid, { awal: r.awal, akhir: r.akhir });
      else perKelas.set(`${r.pid}:${r.hid}`, { awal: r.awal, akhir: r.akhir });
    }
  }
  return {
    kelas: (programId, halaqahId, sumber, periodeNama) => {
      if (sumber === "mabni_api") return rentangPeriode(periodeNama) ?? perProgram.get(programId) ?? null;
      return (halaqahId != null ? perKelas.get(`${programId}:${halaqahId}`) : undefined) ?? perProgram.get(programId) ?? null;
    },
  };
}
