/**
 * Satu peserta = satu manusia, bukan satu akun. Murni (tanpa DB) supaya bisa
 * diuji; dipakai angka Beranda (lib/insights/beranda.ts) dan daftar /peserta
 * (lib/lintas/direktori.ts) supaya kartu dan daftarnya tetap sama.
 *
 * Audit 29 Sep 2026 (10 sudut, DB lokal 23 Sep) menemukan ±100 akun ganda dari
 * ±3.800. Aturan di bawah hanya yang buktinya kuat — sisanya (nama sama tanpa
 * HP, nama umum seperti "Umar Latif Baswedan") sengaja TIDAK digabung:
 *
 *  1. Maahir: `anggotaId` adalah satu keanggotaan kelas, bukan satu orang —
 *     peserta yang ikut "Intensif Akhwat" dan "Intensif Siang Akhwat" punya dua
 *     id. Di dalam Maahir, nama sama = satu orang.
 *  2. HP sama DAN nama cocok. HP saja tidak cukup: satu keluarga sering memakai
 *     satu nomor (Suwaidin / Al Kartubin), jadi nama berbeda tetap dua orang.
 *     HP dinormalisasi `normalizePhone` (melipat "6262…"/"620…" — tanpa itu
 *     pasangan akun lama/baru HITS Januari tak pernah bertemu).
 *  3. Salinan HKM → RBI: 10 Agu 2026 akun HKM (HURUF BESAR, HP karangan
 *     62813000…) dibuat ulang di RBI dengan HP karangan seri lain. Hanya nama
 *     yang tersisa, jadi dicocokkan longgar — tapi HANYA antara dua program itu
 *     dan hanya bila pasangannya tunggal.
 */
import { namaKunci } from "@/lib/hadir/nama";
import { normalizePhone } from "@/lib/wa";

export type AkunPeserta = {
  /** Kunci baris sekarang: "tilawah_api:123", "mabni_api:9", "maahir:<anggotaId>". */
  kunci: string;
  sumber: "cermin" | "maahir";
  programSlug: string;
  nama: string;
  hp: string | null;
};

/** Bentuk banding longgar: tanpa isi kurung, bin/binti, huruf dobel dilipat. */
export function kunciLonggar(nama: string): string {
  const tanpaKurung = nama.replace(/\([^)]*\)/g, " ");
  return namaKunci(tanpaKurung)
    .split(" ")
    .filter((t) => t && t !== "bin" && t !== "binti" && t !== "bint")
    .map((t) => t.replace(/(.)\1+/g, "$1"))
    .join(" ");
}

const token = (nama: string) => kunciLonggar(nama).split(" ").filter(Boolean);

/** Nama sama, atau semua kata nama pendek ada di nama panjang ("Zaky" ⊂ "Zaky Riko V"). */
export function namaCocok(a: string, b: string): boolean {
  const ta = token(a);
  const tb = token(b);
  if (!ta.length || !tb.length) return false;
  const [pendek, panjang] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const set = new Set(panjang);
  return pendek.every((t) => set.has(t));
}

/**
 * Cocok longgar untuk salinan HKM↔RBI: urutan kata bebas, dan kata nama pendek
 * boleh berupa awalan kata nama panjang (inisial "H" ↔ "Hermanto",
 * "Syaiful" ↔ "Syaeful" tidak). Nama satu kata tidak pernah cukup.
 */
export function namaCocokSalinan(a: string, b: string): boolean {
  const ta = token(a);
  const tb = token(b);
  const [pendek, panjang] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (pendek.length < 2) return false;
  const sisa = [...panjang];
  for (const t of pendek) {
    const i = sisa.findIndex((u) => u === t || u.startsWith(t));
    if (i < 0) return false;
    sisa.splice(i, 1);
  }
  return true;
}

/**
 * Kelompokkan akun menjadi orang. Mengembalikan kunci-akun → kunci-orang (kunci
 * akun pertama di kelompoknya), plus daftar kelompok ber-anggota > 1 untuk
 * ditinjau.
 */
export function kelompokkanPeserta(akun: readonly AkunPeserta[]): {
  orangDari: Map<string, string>;
  gabungan: { kunci: string[]; alasan: string }[];
} {
  // Satu akun muncul sekali per pendaftaran, dan ejaan/HP-nya bisa berbeda per
  // program — semua varian dipakai sebagai bukti, duplikat persisnya dibuang.
  const unik = [...new Map(akun.map((a) => [`${a.kunci}|${a.programSlug}|${a.nama}|${a.hp ?? ""}`, a])).values()];
  const induk = new Map<string, string>();
  const alasan = new Map<string, string>();
  for (const a of unik) induk.set(a.kunci, a.kunci);
  const cari = (x: string): string => {
    let r = x;
    while (induk.get(r) !== r) r = induk.get(r)!;
    induk.set(x, r);
    return r;
  };
  const satukan = (a: string, b: string, kenapa: string) => {
    const ra = cari(a);
    const rb = cari(b);
    if (ra === rb) return;
    induk.set(rb, ra);
    alasan.set(ra, alasan.has(ra) ? `${alasan.get(ra)}, ${kenapa}` : kenapa);
  };
  const kelompok = <K,>(daftar: readonly AkunPeserta[], kunci: (a: AkunPeserta) => K | null) => {
    const peta = new Map<K, AkunPeserta[]>();
    for (const a of daftar) {
      const k = kunci(a);
      if (k == null || k === "") continue;
      peta.set(k, [...(peta.get(k) ?? []), a]);
    }
    return peta;
  };

  // 1. Maahir: nama sama di dalam Maahir.
  for (const grup of kelompok(unik.filter((a) => a.sumber === "maahir"), (a) => kunciLonggar(a.nama)).values())
    for (const a of grup.slice(1)) satukan(grup[0].kunci, a.kunci, "Maahir: kelas lain, nama sama");

  // 2. HP sama + nama cocok (berpasangan, supaya satu nomor keluarga tidak menyeret semua).
  for (const grup of kelompok(unik, (a) => normalizePhone(a.hp)).values()) {
    for (let i = 0; i < grup.length; i++)
      for (let j = i + 1; j < grup.length; j++)
        if (namaCocok(grup[i].nama, grup[j].nama)) satukan(grup[i].kunci, grup[j].kunci, "HP & nama sama");
  }

  // 3. Salinan HKM ↔ RBI, hanya pasangan tunggal.
  const hkm = unik.filter((a) => a.programSlug === "hkm-presensi");
  const rbi = unik.filter((a) => a.programSlug === "rbi");
  if (hkm.length && rbi.length) {
    for (const h of hkm) {
      // Akun yang memang dipakai di kedua program (didaftarkan apa adanya) bukan salinan.
      if (rbi.some((r) => r.kunci === h.kunci)) continue;
      const calon = [...new Set(rbi.filter((r) => namaCocokSalinan(h.nama, r.nama)).map((r) => r.kunci))];
      if (calon.length !== 1) continue;
      const namaCalon = rbi.filter((r) => r.kunci === calon[0]).map((r) => r.nama);
      const balik = new Set(hkm.filter((x) => namaCalon.some((n) => namaCocokSalinan(x.nama, n))).map((x) => x.kunci));
      if (balik.size !== 1) continue;
      satukan(h.kunci, calon[0], "salinan HKM→RBI");
    }
  }

  const orangDari = new Map<string, string>();
  const anggota = new Map<string, string[]>();
  for (const a of unik) {
    const r = cari(a.kunci);
    orangDari.set(a.kunci, r);
    anggota.set(r, [...(anggota.get(r) ?? []), a.kunci]);
  }
  const gabungan = [...anggota.entries()]
    .filter(([, k]) => k.length > 1)
    .map(([r, k]) => ({ kunci: [...new Set(k)], alasan: alasan.get(r) ?? "" }))
    .filter((g) => g.kunci.length > 1);
  return { orangDari, gabungan };
}
