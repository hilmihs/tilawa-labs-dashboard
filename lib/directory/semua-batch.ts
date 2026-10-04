import { familyDisplayName, getBatchSiblings } from "@/lib/programs/families";
import {
  getPengajarDirectory,
  getPesertaDirectory,
  type PengajarDirectory,
  type PesertaDirectory,
} from "./queries";

/**
 * "Semua batch" untuk halaman peserta/pengajar: satu keluarga batch
 * (hits-regular / -apr / -jan) adalah tiga baris `programs` yang terpisah, jadi
 * gabungannya dibaca dengan memanggil direktori tiap saudara lalu menyatukan
 * barisnya. Tiap baris dicap `batch` (label) dan `programSlug` (asal) supaya
 * tabel bisa menampilkan kolom Batch dan tautan halaqah menunjuk program yang
 * benar — id halaqah milik program asalnya, bukan program yang sedang dibuka.
 *
 * Bukan perubahan sync/skema: sama seperti `getBatchSiblings`, ini hanya
 * pengelompokan di sisi UI.
 */
export type BatchStamp = { batch: string; programSlug: string };

export function namaSemuaBatch(programName: string, labels: string[]): string {
  return `${familyDisplayName(programName)} — semua batch (${labels.join(", ")})`;
}

export function gabungBatch<R extends object>(
  programName: string,
  parts: { label: string; slug: string; rows: R[] }[],
): { programName: string; rows: (R & BatchStamp)[] } {
  return {
    programName: namaSemuaBatch(
      programName,
      parts.map((p) => p.label),
    ),
    rows: parts.flatMap((p) =>
      p.rows.map((r) => ({ ...r, batch: p.label, programSlug: p.slug })),
    ),
  };
}

/** Peserta seluruh batch sekeluarga. Sama dengan direktori biasa bila program tak berkeluarga. */
export async function getPesertaDirectorySemuaBatch(
  slug: string,
): Promise<PesertaDirectory | null> {
  const siblings = await getBatchSiblings(slug);
  if (siblings.length < 2) return getPesertaDirectory(slug);
  const dirs = await Promise.all(siblings.map((s) => getPesertaDirectory(s.slug)));
  const me = dirs[siblings.findIndex((s) => s.current)];
  if (!me) return null;
  const parts = siblings.flatMap((s, i) => {
    const d = dirs[i];
    return d ? [{ label: s.label, slug: s.slug, rows: d.rows, wali: d.wali }] : [];
  });
  const gabungan = gabungBatch(me.programName, parts);
  return { ...gabungan, wali: parts.flatMap((p) => p.wali) };
}

/** Pengajar seluruh batch sekeluarga; satu pengajar yang mengajar di dua batch tampil dua baris. */
export async function getPengajarDirectorySemuaBatch(
  slug: string,
): Promise<PengajarDirectory | null> {
  const siblings = await getBatchSiblings(slug);
  if (siblings.length < 2) return getPengajarDirectory(slug);
  const dirs = await Promise.all(siblings.map((s) => getPengajarDirectory(s.slug)));
  const me = dirs[siblings.findIndex((s) => s.current)];
  if (!me) return null;
  const parts = siblings.flatMap((s, i) => {
    const d = dirs[i];
    return d ? [{ label: s.label, slug: s.slug, rows: d.rows }] : [];
  });
  return gabungBatch(me.programName, parts);
}
