/**
 * Impor penilaian dari xlsx / Google Form (design "Input Penilaian" p4) —
 * murni. Alurnya sama dengan impor pendaftaran: baca → cocokkan kolom →
 * pratinjau → tulis; tidak ada yang ditulis sebelum konfirmasi, dan tulis ulang
 * idempoten (sumber 'impor', satu nilai per orang × acara × KPI).
 */
import { namaKunci } from "@/lib/hadir/nama";
import { isNilai, type Nilai } from "./skala";

export type KpiMini = { id: string; kode: string; nama: string };

/** Peta kolom: header file untuk nama, evidence, dan tiap KPI (kpiId → header). */
export type PetaKolom = { nama: string | null; evidence: string | null; kpi: Record<string, string | null> };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Tebakan awal peta kolom dari judul kolom. Pengguna bisa mengubahnya sebelum pratinjau. */
export function tebakKolom(headers: string[], kpi: KpiMini[]): PetaKolom {
  const h = headers.map((x) => ({ asli: x, n: norm(x) }));
  const cari = (pola: RegExp) => h.find((x) => pola.test(x.n))?.asli ?? null;
  const peta: PetaKolom = {
    nama: cari(/^(nama( lengkap)?|name|nama panitia|panitia)\b/) ?? cari(/\bnama\b/),
    evidence: cari(/\b(contoh|kejadian|evidence|catatan|keterangan|alasan)\b/),
    kpi: {},
  };
  for (const k of kpi) {
    const kata = norm(k.nama).split(" ").filter((w) => w.length > 2);
    const cocok = h.find((x) => kata.every((w) => x.n.includes(w))) ?? h.find((x) => kata.some((w) => x.n.includes(w)));
    peta.kpi[k.id] = cocok && cocok.asli !== peta.nama && cocok.asli !== peta.evidence ? cocok.asli : null;
  }
  return peta;
}

/** "B" / "b" / "4" / 4 / "4 - Sangat baik" → huruf; kosong → null; lainnya → "tidak_sah". */
export function konversiNilai(v: unknown): Nilai | null | "tidak_sah" {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (isNilai(up)) return up;
  const huruf = up.match(/^([BCDE])\b/);
  if (huruf) return huruf[1] as Nilai;
  const n = Number(s.replace(",", ".").match(/^\d+(\.\d+)?/)?.[0]);
  if (!Number.isFinite(n)) return "tidak_sah";
  // Skala 1–4 (Google Form lama): 4 → B … 1 → E. Desimal dibulatkan ke tingkat terdekat.
  const r = Math.round(n);
  return r === 4 ? "B" : r === 3 ? "C" : r === 2 ? "D" : r === 1 ? "E" : "tidak_sah";
}

export type Kandidat = { orangId: string; panitiaId: string | null; nama: string; namaKunci: string; label: string };

export type StatusBaris = "baru" | "berubah" | "sama" | "ditolak";

export type BarisImpor = {
  no: number; // nomor baris di sheet (header = 1)
  namaFile: string;
  cocok: Kandidat | null;
  nilai: Record<string, Nilai>;
  nilaiLama: Record<string, Nilai>;
  evidence: string;
  status: StatusBaris;
  alasan: string;
};

/**
 * Nama di file → kandidat. Urutan: nama kunci persis; lalu setiap kata nama di
 * file adalah awalan kata di tepat satu kandidat. Panitia acara didahulukan
 * daripada orang lain di Daftar Individu (dikirim pemanggil sudah berurut).
 */
export function cocokNama(nama: string, kandidat: Kandidat[]): { cocok: Kandidat | null; alasan: string } {
  const k = namaKunci(nama);
  if (!k) return { cocok: null, alasan: "nama kosong" };
  const persis = kandidat.filter((c) => c.namaKunci === k);
  const unik = (arr: Kandidat[]) => [...new Map(arr.map((c) => [c.orangId, c])).values()];
  const p = unik(persis);
  if (p.length === 1) return { cocok: p[0], alasan: "" };
  if (p.length > 1) return { cocok: null, alasan: `${p.length} orang bernama ${nama.trim()}` };
  const kata = k.split(" ");
  const awal = unik(
    kandidat.filter((c) => {
      const ok = c.namaKunci.split(" ");
      let i = 0;
      for (const w of ok) if (i < kata.length && w.startsWith(kata[i])) i++;
      return i === kata.length;
    }),
  );
  if (awal.length === 1) return { cocok: awal[0], alasan: "ejaan/kependekan, cocok awalan" };
  if (awal.length > 1) return { cocok: null, alasan: `${awal.length} kandidat untuk "${nama.trim()}"` };
  return { cocok: null, alasan: "nama tidak dikenal" };
}

export function siapkanImpor(
  rows: Record<string, unknown>[],
  peta: PetaKolom,
  kpi: KpiMini[],
  kandidat: Kandidat[],
  /** orangId → kpiId → nilai impor yang sudah tersimpan untuk acara ini. */
  lama: Map<string, Record<string, Nilai>>,
): BarisImpor[] {
  const out: BarisImpor[] = [];
  const sudah = new Set<string>();
  rows.forEach((r, i) => {
    const no = i + 2;
    const namaFile = String((peta.nama && r[peta.nama]) ?? "").trim();
    const evidence = String((peta.evidence && r[peta.evidence]) ?? "").trim().slice(0, 1000);
    const nilai: Record<string, Nilai> = {};
    const salah: string[] = [];
    for (const k of kpi) {
      const kol = peta.kpi[k.id];
      if (!kol) continue;
      const v = konversiNilai(r[kol]);
      if (v === "tidak_sah") salah.push(k.nama);
      else if (v) nilai[k.id] = v;
    }
    if (!namaFile && Object.keys(nilai).length === 0) return; // baris kosong
    const base = { no, namaFile, nilai, evidence, nilaiLama: {} as Record<string, Nilai> };
    if (salah.length) return void out.push({ ...base, cocok: null, status: "ditolak", alasan: `nilai tidak dikenal di ${salah.join(", ")}` });
    if (Object.keys(nilai).length === 0) return void out.push({ ...base, cocok: null, status: "ditolak", alasan: "tidak ada nilai" });
    const { cocok, alasan } = cocokNama(namaFile, kandidat);
    if (!cocok) return void out.push({ ...base, cocok: null, status: "ditolak", alasan });
    if (sudah.has(cocok.orangId)) return void out.push({ ...base, cocok, status: "ditolak", alasan: "orang yang sama sudah ada di baris sebelumnya" });
    if ((Object.values(nilai).includes("D") || Object.values(nilai).includes("E")) && !evidence) {
      return void out.push({ ...base, cocok, status: "ditolak", alasan: "nilai D/E tanpa contoh kejadian" });
    }
    sudah.add(cocok.orangId);
    const l = lama.get(cocok.orangId) ?? {};
    const adaLama = Object.keys(l).length > 0;
    const beda = Object.entries(nilai).some(([k, v]) => l[k] !== v);
    out.push({ ...base, nilaiLama: l, cocok, status: !adaLama ? "baru" : beda ? "berubah" : "sama", alasan });
  });
  return out;
}

export function ringkasImpor(b: BarisImpor[]): Record<StatusBaris, number> {
  const n: Record<StatusBaris, number> = { baru: 0, berubah: 0, sama: 0, ditolak: 0 };
  for (const x of b) n[x.status]++;
  return n;
}
