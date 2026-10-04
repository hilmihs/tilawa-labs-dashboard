import JSZip from "jszip";
import { buatKartuPng } from "./kartu-png";
import { urlQr } from "./kode";

type OrangKartu = { nama: string; programTeks: string | null; gender: string; kodeQr: string };

const bersih = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();

/**
 * Nama berkas "Nama - Program.png" per orang, unik di dalam satu zip: nama +
 * program yang sama (dua "Aisyah - Pengajar HITS") diberi 4 huruf awal kode,
 * supaya tidak saling menimpa saat diekstrak ke Drive.
 */
export function namaBerkasKartu(rows: OrangKartu[]): string[] {
  const dipakai = new Set<string>();
  return rows.map((o) => {
    let nama = `${bersih(o.nama)} - ${bersih(o.programTeks ?? "Tanpa program")}`;
    if (dipakai.has(nama)) nama += ` (${o.kodeQr.slice(0, 4)})`;
    dipakai.add(nama);
    return `${nama}.png`;
  });
}

/** Zip kartu PNG A6 (QR + nama + program), isi QR = URL /h/<kode> di `base`. */
export async function buatZipKartu(rows: OrangKartu[], base: string): Promise<Uint8Array> {
  const zip = new JSZip();
  const nama = namaBerkasKartu(rows);
  for (let i = 0; i < rows.length; i++) {
    const o = rows[i];
    const png = await buatKartuPng({ nama: o.nama, program: o.programTeks, gender: o.gender, kode: o.kodeQr, url: urlQr(base, o.kodeQr) });
    zip.file(nama[i], png);
  }
  return zip.generateAsync({ type: "uint8array", compression: "STORE" });
}
