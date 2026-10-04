/**
 * Ringkasan loyalitas lintas sesi (design "Acara" a4, rekomendasi 28 Sep 2026):
 * % peserta rutin, antar-pemateri, dan matriks loyalitas. Murni — sumber
 * datanya sama dengan rekap (lib/hadir/rekap.ts), kuncinya orangId.
 *
 * Definisi rutin eksplisit dan bisa diatur: hadir ≥ `minHadir` dari `jendela`
 * sesi terakhir (bawaan 3 dari 4 — usulan design, menunggu tim kaderisasi).
 * Penyebutnya = orang yang hadir minimal sekali di jendela itu.
 */
import type { BarisRekap, SesiMeta } from "./rekap";

export type DefinisiRutin = { minHadir: number; jendela: number };
export const RUTIN_BAWAAN: DefinisiRutin = { minHadir: 3, jendela: 4 };

export function bacaDefinisiRutin(minHadir: unknown, jendela: unknown): DefinisiRutin {
  const j = Number(jendela);
  const m = Number(minHadir);
  const jendelaOk = Number.isInteger(j) && j >= 2 && j <= 12 ? j : RUTIN_BAWAAN.jendela;
  const minOk = Number.isInteger(m) && m >= 1 && m <= jendelaOk ? m : Math.min(RUTIN_BAWAAN.minHadir, jendelaOk);
  return { minHadir: minOk, jendela: jendelaOk };
}

const urut = (s: readonly SesiMeta[]) => [...s].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.slug.localeCompare(b.slug));

function hitungJendela(sesi: SesiMeta[], hadir: readonly BarisRekap[], d: DefinisiRutin) {
  const ids = new Set(sesi.map((s) => s.acaraId));
  const perOrang = new Map<string, number>();
  for (const b of hadir) if (ids.has(b.acaraId)) perOrang.set(b.orangId, (perOrang.get(b.orangId) ?? 0) + 1);
  const rutin = [...perOrang.values()].filter((n) => n >= d.minHadir).length;
  return { rutin, penyebut: perOrang.size, persen: perOrang.size ? Math.round((1000 * rutin) / perOrang.size) / 10 : null };
}

export type RingkasRutin = {
  definisi: DefinisiRutin;
  /** Sesi di jendela terakhir (bisa kurang dari `jendela` bila sesinya belum cukup). */
  sesiJendela: SesiMeta[];
  rutin: number;
  penyebut: number;
  persen: number | null;
  /** Selisih poin persen dengan jendela yang digeser satu sesi ke belakang. */
  delta: number | null;
  cukup: boolean;
};

export function ringkasRutin(sesi: readonly SesiMeta[], hadir: readonly BarisRekap[], d: DefinisiRutin): RingkasRutin {
  const s = urut(sesi);
  const jendela = s.slice(-d.jendela);
  const kini = hitungJendela(jendela, hadir, d);
  const lalu = s.length > d.jendela ? hitungJendela(s.slice(-d.jendela - 1, -1), hadir, d) : null;
  return {
    definisi: d,
    sesiJendela: jendela,
    ...kini,
    delta: kini.persen != null && lalu?.persen != null ? Math.round((kini.persen - lalu.persen) * 10) / 10 : null,
    cukup: jendela.length >= d.jendela,
  };
}

export type BarisPemateri = {
  pemateri: string;
  sesi: number;
  rataHadir: number;
  /** Rata-rata bagian peserta sesinya yang datang lagi di sesi berikutnya (seri sama). null = tak ada sesi lanjutan. */
  retensi: number | null;
};

/**
 * Antar-pemateri: jumlah sesi, rata-rata hadir, dan retensi — dari hadirin sesi
 * X, berapa persen datang lagi di sesi berikutnya dalam seri yang sama.
 */
export function antarPemateri(sesi: readonly SesiMeta[], hadir: readonly BarisRekap[]): BarisPemateri[] {
  const s = urut(sesi);
  const hadirPer = new Map<string, Set<string>>();
  for (const b of hadir) {
    const set = hadirPer.get(b.acaraId) ?? new Set<string>();
    set.add(b.orangId);
    hadirPer.set(b.acaraId, set);
  }
  const berikutnya = new Map<string, string>();
  const perSeri = new Map<string, SesiMeta[]>();
  for (const x of s) {
    const k = x.seri ?? `__${x.acaraId}`;
    perSeri.set(k, [...(perSeri.get(k) ?? []), x]);
  }
  for (const arr of perSeri.values()) for (let i = 0; i < arr.length - 1; i++) berikutnya.set(arr[i].acaraId, arr[i + 1].acaraId);

  const per = new Map<string, { sesi: number; hadir: number; retensi: number[] }>();
  for (const x of s) {
    const nama = (x.pemateri ?? "").trim() || "(pemateri belum diisi)";
    const e = per.get(nama) ?? { sesi: 0, hadir: 0, retensi: [] };
    const h = hadirPer.get(x.acaraId) ?? new Set<string>();
    e.sesi += 1;
    e.hadir += h.size;
    const nx = berikutnya.get(x.acaraId);
    if (nx && h.size) {
      const lagi = [...h].filter((id) => hadirPer.get(nx)?.has(id)).length;
      e.retensi.push(lagi / h.size);
    }
    per.set(nama, e);
  }
  return [...per.entries()]
    .map(([pemateri, e]) => ({
      pemateri,
      sesi: e.sesi,
      rataHadir: Math.round((10 * e.hadir) / e.sesi) / 10,
      retensi: e.retensi.length ? Math.round((1000 * e.retensi.reduce((a, b) => a + b, 0)) / e.retensi.length) / 10 : null,
    }))
    .sort((a, b) => b.rataHadir - a.rataHadir);
}

export type BarisLoyalitas = { orangId: string; nama: string; gender: string; kodeQr: string | null; hadir: number; perSesi: boolean[] };

/** Matriks orang × sesi di jendela, urut paling sering hadir. */
export function matriksLoyalitas(sesiJendela: readonly SesiMeta[], hadir: readonly BarisRekap[], batas = 30): BarisLoyalitas[] {
  const idx = new Map(sesiJendela.map((s, i) => [s.acaraId, i]));
  const per = new Map<string, BarisLoyalitas>();
  for (const b of hadir) {
    const i = idx.get(b.acaraId);
    if (i === undefined) continue;
    const e = per.get(b.orangId) ?? {
      orangId: b.orangId, nama: b.nama, gender: b.gender, kodeQr: b.kodeQr ?? null, hadir: 0, perSesi: sesiJendela.map(() => false),
    };
    if (!e.perSesi[i]) {
      e.perSesi[i] = true;
      e.hadir += 1;
    }
    per.set(b.orangId, e);
  }
  return [...per.values()].sort((a, b) => b.hadir - a.hadir || a.nama.localeCompare(b.nama)).slice(0, batas);
}
