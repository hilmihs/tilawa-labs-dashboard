/**
 * Panitia acara → orang (Daftar Individu). Tanpa tautan ini kepanitiaan dan
 * penilaian tidak bisa masuk CV (design "Rekomendasi" P0: "acara_panitia belum
 * tertaut ke orang").
 *
 * Aturan cocok, berurutan:
 *  1. nomor WA sama (dinormalkan 62…) — bukti terkuat;
 *  2. nama kunci persis sama DAN gender sama DAN hanya satu kandidat — nama
 *     tunggal seperti "Salma" yang punya dua kandidat tidak ditebak;
 *  2b. nama panitia ≥ 2 kata yang semuanya awalan kata di tepat satu nama
 *     orang segender ("Rifki Hanif" → "Nadia Kamila Permata" tidak, "Aditya
 *     Tri" → "Aditya Tri Anggoro" ya). Nama satu kata ("Wildan") TIDAK
 *     ditautkan otomatis — kandidatnya ditawarkan di grid untuk dikonfirmasi;
 *  3. belum cocok tapi punya WA → dibuatkan orang baru (perlu_review), karena
 *     WA unik dan panitia itu memang orang nyata;
 *  4. sisanya dibiarkan (dilaporkan) untuk ditautkan manusia.
 * Tautan yang sudah ada tidak pernah diubah — koreksi manusia menang.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { namaKunci } from "@/lib/hadir/nama";
import { buatKode } from "@/lib/hadir/kode";
import { normalizePhone } from "@/lib/wa";

export type PanitiaCalon = { id: string; nama: string; gender: string; wa: string | null };
export type OrangCalon = { id: string; namaKunci: string; gender: string; wa: string | null };

export type HasilCocok = {
  tautan: { panitiaId: string; orangId: string; cara: "wa" | "nama" | "nama_awal" }[];
  /** Orang baru per WA; `panitiaIds` = semua baris panitia ber-WA itu. */
  baru: { nama: string; gender: string; wa: string; panitiaIds: string[] }[];
  tertinggal: { panitia: PanitiaCalon; alasan: string }[];
};

/**
 * Orang segender yang namanya memuat setiap kata nama panitia sebagai awalan
 * kata, berurutan: "Aditya Tri" ⊂ "aditya tri anggoro", "Syukur" ⊂ "ahmad abdus
 * syukur". Dipakai untuk tautan otomatis (≥ 2 kata, satu kandidat) dan untuk
 * kandidat yang ditawarkan di grid.
 */
export function kandidatNama(nama: string, gender: string, orang: OrangCalon[]): OrangCalon[] {
  const kata = namaKunci(nama).split(" ").filter(Boolean);
  if (kata.length === 0) return [];
  return orang.filter((o) => {
    if (o.gender !== gender) return false;
    const ok = o.namaKunci.split(" ");
    let i = 0;
    for (const w of ok) if (i < kata.length && w.startsWith(kata[i])) i++;
    return i === kata.length;
  });
}

export function cocokkanPanitia(panitia: PanitiaCalon[], orang: OrangCalon[]): HasilCocok {
  const byWa = new Map<string, string>();
  const byNama = new Map<string, OrangCalon[]>();
  for (const o of orang) {
    const w = normalizePhone(o.wa);
    if (w) byWa.set(w, o.id);
    const k = `${o.namaKunci}|${o.gender}`;
    byNama.set(k, [...(byNama.get(k) ?? []), o]);
  }
  const hasil: HasilCocok = { tautan: [], baru: [], tertinggal: [] };
  // WA yang akan dibuat di putaran ini — dua baris panitia dengan WA sama (satu
  // orang di dua divisi/acara) cukup satu orang baru.
  const waBaru = new Map<string, HasilCocok["baru"][number]>();
  for (const p of panitia) {
    const w = normalizePhone(p.wa);
    const lewatWa = w ? byWa.get(w) : undefined;
    if (lewatWa) {
      hasil.tautan.push({ panitiaId: p.id, orangId: lewatWa, cara: "wa" });
      continue;
    }
    const calon = byNama.get(`${namaKunci(p.nama)}|${p.gender}`) ?? [];
    if (calon.length === 1) {
      hasil.tautan.push({ panitiaId: p.id, orangId: calon[0].id, cara: "nama" });
      continue;
    }
    if (calon.length === 0 && namaKunci(p.nama).split(" ").length >= 2) {
      const awal = kandidatNama(p.nama, p.gender, orang);
      if (awal.length === 1) {
        hasil.tautan.push({ panitiaId: p.id, orangId: awal[0].id, cara: "nama_awal" });
        continue;
      }
    }
    if (w) {
      const ada = waBaru.get(w);
      if (ada) ada.panitiaIds.push(p.id);
      else {
        const b = { nama: p.nama, gender: p.gender, wa: w, panitiaIds: [p.id] };
        waBaru.set(w, b);
        hasil.baru.push(b);
      }
      continue;
    }
    hasil.tertinggal.push({
      panitia: p,
      alasan: calon.length > 1 ? `${calon.length} orang bernama sama` : "tanpa WA dan nama belum dikenal",
    });
  }
  return hasil;
}

/**
 * Tautkan panitia yang belum punya orang_id (semua acara, atau satu acara).
 * Idempoten; aman dipanggil saat membuka grid penilaian dan di akhir sinkron.
 */
export async function tautkanPanitia(acaraId?: string): Promise<{ tertaut: number; dibuat: number; tertinggal: number }> {
  const db = getDb();
  const panitia = (
    await db.execute(sql`
      select id, nama, gender, wa from acara_panitia
      where orang_id is null and status <> 'mundur'
        ${acaraId ? sql`and acara_id = ${acaraId}` : sql``}`)
  ).rows as PanitiaCalon[];
  if (panitia.length === 0) return { tertaut: 0, dibuat: 0, tertinggal: 0 };
  const orang = (
    await db.execute(sql`
      select id, nama_kunci "namaKunci", gender, wa from orang
      where gabung_ke_id is null and status = 'aktif'`)
  ).rows as OrangCalon[];
  const h = cocokkanPanitia(panitia, orang);

  await db.transaction(async (tx) => {
    for (const t of h.tautan) {
      await tx.execute(sql`update acara_panitia set orang_id = ${t.orangId}, updated_at = now() where id = ${t.panitiaId} and orang_id is null`);
    }
    for (const p of h.baru) {
      const id = crypto.randomUUID();
      // WA unik parsial: bila ternyata sudah dipakai (balapan), cukup tautkan ke pemiliknya.
      const ins = await tx.execute(sql`
        insert into orang (id, nama, nama_kunci, gender, wa, kategori, kode_qr, sumber, perlu_review)
        values (${id}, ${p.nama.trim()}, ${namaKunci(p.nama)}, ${p.gender === "P" ? "P" : "L"}, ${p.wa}, 'umum', ${buatKode()}, 'panitia', true)
        on conflict do nothing
        returning id`);
      const orangId = (ins.rows[0] as { id: string } | undefined)?.id
        ?? ((await tx.execute(sql`select id from orang where wa = ${p.wa} limit 1`)).rows[0] as { id: string } | undefined)?.id;
      if (!orangId) continue;
      for (const pid of p.panitiaIds) {
        await tx.execute(sql`update acara_panitia set orang_id = ${orangId}, updated_at = now() where id = ${pid} and orang_id is null`);
      }
    }
  });
  return { tertaut: h.tautan.length, dibuat: h.baru.length, tertinggal: h.tertinggal.length };
}

/** Tautan manual dari grid: ke orang yang dipilih, atau orang baru (perlu_review). */
export async function tautkanManual(panitiaId: string, orangId: string | "baru"): Promise<boolean> {
  const db = getDb();
  const p = (await db.execute(sql`select id, nama, gender, orang_id from acara_panitia where id = ${panitiaId} limit 1`)).rows[0] as
    | { id: string; nama: string; gender: string; orang_id: string | null }
    | undefined;
  if (!p) return false;
  let target = orangId;
  if (orangId === "baru") {
    target = crypto.randomUUID();
    await db.execute(sql`
      insert into orang (id, nama, nama_kunci, gender, kategori, kode_qr, sumber, perlu_review)
      values (${target}, ${p.nama.trim()}, ${namaKunci(p.nama)}, ${p.gender === "P" ? "P" : "L"}, 'umum', ${buatKode()}, 'panitia', true)`);
  } else {
    const ada = (await db.execute(sql`select 1 from orang where id = ${orangId} and gabung_ke_id is null`)).rows.length;
    if (!ada) return false;
  }
  await db.execute(sql`update acara_panitia set orang_id = ${target}, updated_at = now() where id = ${panitiaId}`);
  return true;
}

/** Kandidat orang untuk panitia yang belum tertaut, per panitiaId (maks 5). */
export async function kandidatUntukPanitia(
  panitia: { id: string; nama: string; gender: string }[],
): Promise<Record<string, { id: string; nama: string }[]>> {
  if (panitia.length === 0) return {};
  const orang = (
    await getDb().execute(sql`
      select id, nama, nama_kunci "namaKunci", gender, wa from orang where gabung_ke_id is null and status = 'aktif' and kategori <> 'peserta'`)
  ).rows as (OrangCalon & { nama: string })[];
  const out: Record<string, { id: string; nama: string }[]> = {};
  for (const p of panitia) {
    out[p.id] = (kandidatNama(p.nama, p.gender, orang) as (OrangCalon & { nama: string })[]).slice(0, 5).map((o) => ({ id: o.id, nama: o.nama }));
  }
  return out;
}
