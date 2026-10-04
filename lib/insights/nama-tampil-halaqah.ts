/**
 * Mengisi `halaqah_sync.nama_tampil` — nama halaqah yang dibaca koordinator,
 * mis. "M1 - Usbu'i 1 (ikh)" (permintaan pemilik 22 Sep 2026).
 *
 * Dihitung dari CERMIN, bukan dari panggilan upstream: nomornya butuh seluruh
 * himpunan halaqah program itu, dan cermin adalah satu-satunya tempat himpunan
 * itu lengkap tanpa tergantung cakupan batch si pemanggil. Hasilnya disimpan
 * supaya SQL laporan dan ekspor xlsx ikut membacanya tanpa mengulang logika
 * penomoran — dua salinan penomoran akan menyebut nomor berbeda di dua halaman.
 *
 * Dipanggil di akhir sinkron mabni dan oleh scripts/backfill-nama-tampil.ts.
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { halaqahSync, programs } from "@/lib/db/schema";
import { namaKelasBaru, type KelasUntukNama } from "@/lib/integrations/mabni/nama-kelas";

/** Kelas demo/uji: dikeluarkan SEBELUM penomoran, kalau tidak ia merebut nomor 1. */
const DEMO = /^\s*\[DEMO/i;

export type HasilNamaTampil = { dinilai: number; ditulis: number; dilewati: number };

export async function perbaruiNamaTampil(programSlug: string): Promise<HasilNamaTampil> {
  const db = getDb();
  const rows = await db.execute(sql`
    select hs.tilawah_halaqah_id as id, hs.name, hs.nama_tampil, hs.raw->'kelas' as kelas
      from ${halaqahSync} hs
      join ${programs} p on p.id = hs.program_id
     where p.slug = ${programSlug}
  `);

  const kandidat: KelasUntukNama[] = [];
  let dilewati = 0;
  const namaSekarang = new Map<number, string | null>();
  for (const r of rows.rows as Record<string, unknown>[]) {
    const id = Number(r.id);
    const nama = (r.name as string | null) ?? "";
    namaSekarang.set(id, (r.nama_tampil as string | null) ?? null);
    const k = r.kelas as { gender?: string | null; jenis_pertemuan?: string | null; hari?: number[] | null; jenjang?: { nama?: string } | null } | null;
    // Tanpa jenis_pertemuan skema "M1 - Usbu'i 1" tidak berlaku (HITS, dll) —
    // barisnya dibiarkan memakai `name`.
    if (!k?.jenis_pertemuan || DEMO.test(nama)) { dilewati += 1; continue; }
    kandidat.push({
      id,
      nama,
      gender: k.gender ?? null,
      jenis_pertemuan: k.jenis_pertemuan ?? null,
      hari: k.hari ?? null,
      jenjang: k.jenjang?.nama ? { nama: k.jenjang.nama } : null,
    });
  }

  const hasil = namaKelasBaru(kandidat);
  let ditulis = 0;
  for (const h of hasil) {
    if (!h.namaBaru || namaSekarang.get(h.id) === h.namaBaru) continue;
    await db
      .update(halaqahSync)
      .set({ namaTampil: h.namaBaru })
      .where(sql`${halaqahSync.tilawahHalaqahId} = ${h.id} and ${halaqahSync.programId} = (select id from ${programs} where slug = ${programSlug})`);
    ditulis += 1;
  }
  return { dinilai: kandidat.length, ditulis, dilewati };
}

/** Program yang tidak punya baris apa pun — dipakai skrip backfill untuk melapor. */
export async function programAda(programSlug: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.select({ slug: programs.slug }).from(programs).where(eq(programs.slug, programSlug)).limit(1);
  return rows.length > 0;
}
