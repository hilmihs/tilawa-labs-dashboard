/**
 * Ringkasan acara (design "Acara" a2, rekomendasi 28 Sep 2026) — murni.
 *
 * - Progres per kode divisi: satu baris per kode (registrasi, panjam, …)
 *   dengan batang ikhwan dan akhwat berdampingan, bukan 14 baris terpisah.
 * - Tugas terlambat: nama tugas, PIC-nya, dan umur keterlambatan — bukan
 *   sekadar angka per divisi — supaya bisa langsung diingatkan lewat WA.
 */
import { isTerlambat } from "./view-model";

const BERES = new Set(["selesai", "disetujui"]);

export type Progres = { selesai: number; total: number; persen: number | null };
export type BarisKode = { kode: string; nama: string; ikhwan: Progres | null; akhwat: Progres | null; bersama: Progres | null; terendah: number };

const progres = (selesai: number, total: number): Progres => ({ selesai, total, persen: total ? Math.round((100 * selesai) / total) : null });

export function progresPerKode(
  divisi: readonly { id: string; kode: string; nama: string; sisi: string }[],
  tugas: readonly { divisiId: string | null; status: string }[],
): BarisKode[] {
  const perDivisi = new Map<string, { selesai: number; total: number }>();
  for (const t of tugas) {
    if (!t.divisiId) continue;
    const e = perDivisi.get(t.divisiId) ?? { selesai: 0, total: 0 };
    e.total++;
    if (BERES.has(t.status)) e.selesai++;
    perDivisi.set(t.divisiId, e);
  }
  const perKode = new Map<string, BarisKode>();
  for (const d of divisi) {
    const b = perKode.get(d.kode) ?? { kode: d.kode, nama: d.nama, ikhwan: null, akhwat: null, bersama: null, terendah: 101 };
    const e = perDivisi.get(d.id) ?? { selesai: 0, total: 0 };
    const p = progres(e.selesai, e.total);
    if (d.sisi === "ikhwan") b.ikhwan = p;
    else if (d.sisi === "akhwat") b.akhwat = p;
    else b.bersama = p;
    if (p.persen != null) b.terendah = Math.min(b.terendah, p.persen);
    perKode.set(d.kode, b);
  }
  // Yang paling tertinggal di atas; kode tanpa tugas sama sekali di bawah.
  return [...perKode.values()].sort((a, b) => a.terendah - b.terendah || a.nama.localeCompare(b.nama));
}

export function progresTotal(tugas: readonly { status: string }[]): Progres {
  return progres(tugas.filter((t) => BERES.has(t.status)).length, tugas.length);
}

export type TugasTerlambat = {
  id: string;
  judul: string;
  divisi: string | null;
  pic: string | null;
  picWa: string | null;
  hari: number;
};

const hariAntara = (dari: string, sampai: string) =>
  Math.round((Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000);

/**
 * Tugas yang lewat tenggat, paling lama di atas. PIC = panitia yang ditugasi;
 * bila tidak ada, PIC divisinya; bila tidak ada juga, teks "ditugaskan ke".
 */
export function daftarTerlambat(
  tugas: readonly { id: string; judul: string; divisiId: string | null; panitiaId: string | null; ditugaskanKe: string | null; tenggat: string | null; status: string }[],
  divisi: readonly { id: string; nama: string; sisi: string }[],
  panitia: readonly { id: string; nama: string; wa: string | null; divisiId: string | null; peran: string }[],
  today: string,
): TugasTerlambat[] {
  const div = new Map(divisi.map((d) => [d.id, d]));
  const orang = new Map(panitia.map((p) => [p.id, p]));
  const picDivisi = new Map<string, (typeof panitia)[number]>();
  for (const p of panitia) if (p.peran === "pic" && p.divisiId && !picDivisi.has(p.divisiId)) picDivisi.set(p.divisiId, p);
  return tugas
    .filter((t) => isTerlambat(t, today))
    .map((t) => {
      const p = (t.panitiaId && orang.get(t.panitiaId)) || (t.divisiId && picDivisi.get(t.divisiId)) || null;
      const d = t.divisiId ? div.get(t.divisiId) : undefined;
      return {
        id: t.id,
        judul: t.judul,
        divisi: d ? `${d.nama}${d.sisi !== "bersama" ? ` (${d.sisi})` : ""}` : null,
        pic: p?.nama ?? t.ditugaskanKe ?? null,
        picWa: p?.wa ?? null,
        hari: hariAntara(t.tenggat!, today),
      };
    })
    .sort((a, b) => b.hari - a.hari || a.judul.localeCompare(b.judul));
}
