/**
 * Kelompokkan rekaman identitas (akun tilawah/mabni, peran Maahir, baris `orang`)
 * menjadi manusia. Murni — dipakai scripts/seed-orang-tautan.ts.
 *
 * Urutan bukti:
 *  1. email sama (kecuali email karangan `@email.com`) atau HP sama → pasti.
 *  2. `namaKunci` sama persis (nama utama atau alias) dan tidak ada dua
 *     identitas berbeda dengan nama itu di satu ruang ber-id (tilawah/mabni/
 *     orang) → otomatis. Nama satu kata ("Salma", "Ruqayyah") lebih ketat:
 *     hanya bila semua ruang ber-id bersama-sama menyumbang paling banyak SATU
 *     identitas — satu kata tidak cukup untuk memilih di antara dua akun.
 *  3. Putusan manusia (`Keputusan.gabung`) → apa pun di atas.
 * `Keputusan.pisah` tidak memisahkan; ia melaporkan konflik bila dua nama itu
 * akhirnya satu klaster, supaya penulis berhenti alih-alih menulis salah.
 */
import { namaKunci } from "@/lib/hadir/nama";

export type Rekaman = {
  /** Unik per identitas: "tilawah:16", "maahir:musyrif:<uuid>", "orang:<uuid>". */
  ref: string;
  /** Ruang id: dua ref berbeda di ruang ber-id dengan nama sama = dua orang yang belum tentu sama. */
  ruang: "tilawah" | "mabni" | "maahir" | "orang";
  nama: string;
  /** Ejaan lain orang yang sama dari sumber yang sama (mis. nama di akun ganda tilawah). */
  alias?: readonly string[];
  email: string | null;
  hp: string | null;
};

export type Keputusan = {
  /** Tiap grup = ejaan-ejaan satu orang (dibandingkan lewat namaKunci). */
  gabung: readonly (readonly string[])[];
  /** Pasangan nama yang pasti orang berbeda. */
  pisah: readonly (readonly [string, string])[];
  /** Nama yang bukan orang / tidak dimasukkan (akun bersama, tamu). */
  kecuali: readonly string[];
};

export type Metode = "email" | "hp" | "nama" | "manual" | "baru";

export type HasilKlaster = {
  klaster: Rekaman[][];
  metode: Map<string, Metode>;
  /** Nama yang sama dipakai identitas berbeda di ruang ber-id — tidak digabung otomatis. */
  namaAmbigu: { namaKunci: string; refs: string[] }[];
  konflik: { a: string; b: string; refs: string[] }[];
  dikecualikan: Rekaman[];
};

const RUANG_BER_ID = new Set(["tilawah", "mabni", "orang"]);

function emailBermakna(email: string | null): string | null {
  const e = email?.trim().toLowerCase();
  if (!e || !e.includes("@") || e.endsWith("@email.com")) return null;
  return e;
}

export function susunKlaster(rekaman: readonly Rekaman[], keputusan: Keputusan): HasilKlaster {
  const namaNama = (r: Rekaman) => [...new Set([r.nama, ...(r.alias ?? [])].map(namaKunci).filter(Boolean))];
  const kecuali = new Set(keputusan.kecuali.map(namaKunci));
  const dikecualikan = rekaman.filter((r) => kecuali.has(namaKunci(r.nama)));
  const semua = rekaman.filter((r) => !kecuali.has(namaKunci(r.nama)));

  const induk = new Map<string, string>(semua.map((r) => [r.ref, r.ref]));
  const cari = (x: string): string => {
    let akar = x;
    while (induk.get(akar) !== akar) akar = induk.get(akar)!;
    induk.set(x, akar);
    return akar;
  };
  const metode = new Map<string, Metode>();
  const satukan = (a: string, b: string, alasan: Metode) => {
    const ra = cari(a);
    const rb = cari(b);
    if (ra === rb) return;
    induk.set(ra, rb);
    if (!metode.has(a)) metode.set(a, alasan);
    if (!metode.has(b)) metode.set(b, alasan);
  };
  const kelompokkan = (kunci: (r: Rekaman) => string | null | string[]) => {
    const peta = new Map<string, Rekaman[]>();
    for (const r of semua) {
      const hasilKunci = kunci(r);
      for (const k of Array.isArray(hasilKunci) ? hasilKunci : [hasilKunci]) {
        if (!k) continue;
        const daftar = peta.get(k) ?? [];
        daftar.push(r);
        peta.set(k, daftar);
      }
    }
    return peta;
  };

  for (const grup of kelompokkan((r) => emailBermakna(r.email)).values())
    for (const r of grup.slice(1)) satukan(grup[0].ref, r.ref, "email");
  for (const grup of kelompokkan((r) => r.hp).values())
    for (const r of grup.slice(1)) satukan(grup[0].ref, r.ref, "hp");

  const namaAmbigu: HasilKlaster["namaAmbigu"] = [];
  for (const [nk, grup] of kelompokkan(namaNama)) {
    if (grup.length < 2) continue;
    const idPerRuang = new Map<string, Set<string>>();
    for (const r of grup) {
      if (!RUANG_BER_ID.has(r.ruang)) continue;
      const s = idPerRuang.get(r.ruang) ?? new Set<string>();
      s.add(cari(r.ref));
      idPerRuang.set(r.ruang, s);
    }
    const identitasBerId = new Set([...idPerRuang.values()].flatMap((s) => [...s]));
    const ambigu = nk.includes(" ")
      ? [...idPerRuang.values()].some((s) => s.size > 1)
      : identitasBerId.size > 1;
    if (ambigu) {
      namaAmbigu.push({ namaKunci: nk, refs: grup.map((r) => r.ref) });
      continue;
    }
    for (const r of grup.slice(1)) satukan(grup[0].ref, r.ref, "nama");
  }

  const perNama = kelompokkan(namaNama);
  for (const ejaan of keputusan.gabung) {
    const refs = [...new Set(ejaan.map(namaKunci))].flatMap((nk) => perNama.get(nk) ?? []);
    for (const r of refs.slice(1)) satukan(refs[0].ref, r.ref, "manual");
  }

  const kelompok = new Map<string, Rekaman[]>();
  for (const r of semua) {
    const akar = cari(r.ref);
    const daftar = kelompok.get(akar) ?? [];
    daftar.push(r);
    kelompok.set(akar, daftar);
  }
  const klaster = [...kelompok.values()];

  const konflik: HasilKlaster["konflik"] = [];
  for (const [a, b] of keputusan.pisah) {
    const na = namaKunci(a);
    const nb = namaKunci(b);
    for (const k of klaster) {
      const nks = new Set(k.flatMap(namaNama));
      if (nks.has(na) && nks.has(nb)) konflik.push({ a, b, refs: k.map((r) => r.ref) });
    }
  }

  return { klaster, metode, namaAmbigu, konflik, dikecualikan };
}
