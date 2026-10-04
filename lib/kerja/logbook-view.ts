/**
 * Hitungan tampilan logbook di layar admin — murni. Bulan, pemotongan per
 * pekan, dan angka ringkasan; susunan tabelnya sendiri ada di ./logbook.ts.
 */
import { addDaysISO, isoDow } from "@/lib/time/jakarta";
import { hariDalamBulan } from "./logbook";
import { SESI, type Sesi } from "./types";

const BULAN_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Ahd"];

/** `?bulan=` yang sah, selain itu bulan berjalan dari `hariIni`. */
export function bulanAtauIni(v: string | undefined, hariIni: string): string {
  return v && BULAN_RE.test(v) ? v : hariIni.slice(0, 7);
}

/** "2026-09" + 1 → "2026-10"; negatif mundur, lintas tahun aman. */
export function geserBulan(bulan: string, n: number): string {
  const [y, m] = bulan.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** "2026-09" → "September 2026" (judul "Bulan/Tahun" di lembar kertas). */
export function namaBulan(bulan: string): string {
  const [y, m] = bulan.split("-").map(Number);
  return `${NAMA_BULAN[m - 1]} ${y}`;
}

/** "2026-09-29" → "Sel". */
export const hariPendek = (iso: string) => HARI_PENDEK[isoDow(iso) - 1];

/**
 * Hari sebulan dipotong per pekan Senin–Ahad (pekan pertama/terakhir bisa
 * pendek). Di layar satu pekan = paling banyak 7 tanggal × 3 sesi = 21 kolom:
 * masih muat di laptop tanpa geser, dan pekan adalah irama yang dipakai admin
 * saat memeriksa. Lembar cetak tetap 5 tanggal per halaman (potongHalaman).
 */
export function pekanBulan(bulan: string): string[][] {
  const out: string[][] = [];
  for (const t of hariDalamBulan(bulan)) {
    if (out.length === 0 || isoDow(t) === 1) out.push([]);
    out[out.length - 1].push(t);
  }
  return out;
}

/**
 * Indeks pekan yang ditampilkan: `?minggu=N` (1-based) bila sah; kalau tidak,
 * pekan yang memuat hari ini (bulan berjalan) atau pekan pertama.
 */
export function pekanAktif(pekan: readonly string[][], param: string | undefined, hariIni: string): number {
  const n = Number(param);
  if (Number.isInteger(n) && n >= 1 && n <= pekan.length) return n - 1;
  const i = pekan.findIndex((p) => p.includes(hariIni));
  return i >= 0 ? i : 0;
}

/** ["2026-09-01" … "2026-09-06"] → "1–6 Sep"; satu tanggal → "30 Sep". */
export function labelRentang(hari: readonly string[]): string {
  if (hari.length === 0) return "";
  const a = hari[0];
  const b = hari[hari.length - 1];
  const bln = BULAN_PENDEK[Number(b.slice(5, 7)) - 1];
  const tgA = Number(a.slice(8, 10));
  const tgB = Number(b.slice(8, 10));
  return a === b ? `${tgB} ${bln}` : `${tgA}–${tgB} ${bln}`;
}

type Isi = { orangId: string; tanggal: string; sesi: string; sumber: string };

/**
 * Per orang: sesi terisi, hari hadir (≥ 1 sesi), dan hari lengkap — pengurus
 * wajib 3 tap sehari (Pagi, Siang, Sore); telat tidak dihitung, hanya ada/tidak.
 */
export function totalPerOrang(hadir: readonly Isi[]): Map<string, { sesi: number; hari: number; lengkap: number }> {
  const perHari = new Map<string, Map<string, number>>();
  const sesi = new Map<string, number>();
  for (const h of hadir) {
    if (!(SESI as readonly string[]).includes(h.sesi)) continue;
    sesi.set(h.orangId, (sesi.get(h.orangId) ?? 0) + 1);
    const m = perHari.get(h.orangId) ?? new Map<string, number>();
    m.set(h.tanggal, (m.get(h.tanggal) ?? 0) + 1);
    perHari.set(h.orangId, m);
  }
  return new Map(
    [...sesi].map(([id, n]) => {
      const m = perHari.get(id) ?? new Map<string, number>();
      return [id, { sesi: n, hari: m.size, lengkap: [...m.values()].filter((x) => x >= SESI.length).length }];
    }),
  );
}

export type RingkasanBulan = {
  sesiTerisi: number;
  lewatKartu: number;
  manual: number;
  /** Hari (≤ hari ini) yang ada isiannya dari siapa pun — dipakai sebagai "hari kantor buka". */
  hariBuka: number;
  /** Σ sesi terisi ÷ (anggota × hari buka × 3 sesi), 0–100; null bila belum ada hari buka. */
  persen: number | null;
};

/**
 * Angka bulan untuk kartu ringkasan. Tidak ada kalender libur, jadi "hari
 * kantor buka" diturunkan dari data: hari yang terisi setidaknya satu sesi.
 * Hari libur (tak ada yang datang) dengan begitu tidak menurunkan persen.
 */
export function ringkasBulan(anggotaIds: readonly string[], hadir: readonly Isi[], hariIni: string): RingkasanBulan {
  const ids = new Set(anggotaIds);
  const milik = hadir.filter((h) => ids.has(h.orangId) && h.tanggal <= hariIni && (SESI as readonly string[]).includes(h.sesi));
  const manual = milik.filter((h) => h.sumber === "manual").length;
  const hariBuka = new Set(milik.map((h) => h.tanggal)).size;
  // Target pengurus: 3 tap sehari. Persen = sesi terisi dari seluruh sesi wajib.
  const persen = hariBuka > 0 && ids.size > 0 ? Math.round((milik.length / (ids.size * hariBuka * SESI.length)) * 100) : null;
  return { sesiTerisi: milik.length, lewatKartu: milik.length - manual, manual, hariBuka, persen };
}

/** Hari ini: berapa anggota sudah tercatat di tiap sesi, dan berapa orang unik. */
export function hitungHariIni(anggotaIds: readonly string[], hadir: readonly Isi[], hariIni: string): Record<Sesi, number> & { orang: number } {
  const ids = new Set(anggotaIds);
  const out = { pagi: 0, siang: 0, sore: 0, orang: 0 };
  const orang = new Set<string>();
  for (const h of hadir) {
    if (h.tanggal !== hariIni || !ids.has(h.orangId) || !(SESI as readonly string[]).includes(h.sesi)) continue;
    out[h.sesi as Sesi]++;
    orang.add(h.orangId);
  }
  out.orang = orang.size;
  return out;
}

/** Tanggal ISO sah dan benar-benar ada di kalender (bukan 2026-02-30). */
export function tanggalSah(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return addDaysISO(iso, 0) === iso;
}
