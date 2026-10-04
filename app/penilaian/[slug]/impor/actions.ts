"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { requireStaff } from "@/lib/acara/access";
import { getDb } from "@/lib/db/client";
import { kpiPanitia } from "@/lib/penilaian/queries";
import { ANGKA, isNilai, type Nilai } from "@/lib/penilaian/skala";
import { ringkasImpor, siapkanImpor, tebakKolom, type BarisImpor, type Kandidat, type PetaKolom } from "@/lib/penilaian/impor";
import { tautkanPanitia } from "@/lib/orang/tautan-panitia";

export type HasilBaca =
  | { ok: true; sheet: string; sheets: string[]; headers: string[]; peta: PetaKolom; baris: BarisImpor[]; ringkas: ReturnType<typeof ringkasImpor> }
  | { ok: false; error: string };

async function acaraDariSlug(slug: string) {
  return (await getDb().execute(sql`select id, nama from acara where slug = ${slug} limit 1`)).rows[0] as { id: string; nama: string } | undefined;
}

/** Baca berkas + (opsional) peta kolom → pratinjau. Tidak menulis apa pun. */
export async function bacaImporAction(slug: string, form: FormData): Promise<HasilBaca> {
  await requireStaff();
  const a = await acaraDariSlug(slug);
  if (!a) return { ok: false, error: "Acara tidak ditemukan." };
  const file = form.get("berkas");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih berkas xlsx/csv." };
  if (file.size > 5_000_000) return { ok: false, error: "Berkas terlalu besar (maks 5 MB)." };
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: false });
  } catch {
    return { ok: false, error: "Berkas tidak terbaca sebagai xlsx/csv." };
  }
  const pilihan = String(form.get("sheet") ?? "").trim();
  const sheet = pilihan && wb.SheetNames.includes(pilihan) ? pilihan : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { defval: "" });
  if (rows.length > 2000) return { ok: false, error: "Terlalu banyak baris (maks 2.000)." };
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const kpi = await kpiPanitia();

  // Peta dari pengguna (langkah 2) bila dikirim; kalau tidak, tebakan otomatis.
  let peta = tebakKolom(headers, kpi);
  const petaRaw = form.get("peta");
  if (typeof petaRaw === "string" && petaRaw) {
    try {
      const p = JSON.parse(petaRaw) as PetaKolom;
      const sah = (h: unknown) => (typeof h === "string" && headers.includes(h) ? h : null);
      peta = { nama: sah(p.nama), evidence: sah(p.evidence), kpi: Object.fromEntries(kpi.map((k) => [k.id, sah(p.kpi?.[k.id])])) };
    } catch {
      /* peta rusak → pakai tebakan */
    }
  }
  if (!peta.nama) return { ok: true, sheet, sheets: wb.SheetNames, headers, peta, baris: [], ringkas: { baru: 0, berubah: 0, sama: 0, ditolak: 0 } };

  await tautkanPanitia(a.id);
  const db = getDb();
  const [panitiaRes, orangRes, lamaRes] = await Promise.all([
    db.execute(sql`
      select p.id panitia_id, o.id orang_id, o.nama, o.nama_kunci, d.nama divisi
      from acara_panitia p join orang o on o.id = p.orang_id left join acara_divisi d on d.id = p.divisi_id
      where p.acara_id = ${a.id} and p.status <> 'mundur'`),
    db.execute(sql`select id, nama, nama_kunci from orang where gabung_ke_id is null and status = 'aktif'`),
    db.execute(sql`select orang_id, kpi_id, nilai from penilaian where acara_id = ${a.id} and sumber = 'impor'`),
  ]);
  // Panitia acara ini dulu: nama yang sama dengan orang di luar panitia tidak dianggap ganda.
  const panitia: Kandidat[] = (panitiaRes.rows as Record<string, string>[]).map((r) => ({
    orangId: r.orang_id, panitiaId: r.panitia_id, nama: r.nama, namaKunci: r.nama_kunci, label: `${r.nama}${r.divisi ? ` · ${r.divisi}` : ""}`,
  }));
  const idPanitia = new Set(panitia.map((p) => p.orangId));
  const lain: Kandidat[] = (orangRes.rows as Record<string, string>[])
    .filter((r) => !idPanitia.has(r.id))
    .map((r) => ({ orangId: r.id, panitiaId: null, nama: r.nama, namaKunci: r.nama_kunci, label: `${r.nama} · bukan panitia acara ini` }));
  const lama = new Map<string, Record<string, Nilai>>();
  for (const r of lamaRes.rows as { orang_id: string; kpi_id: string; nilai: string }[]) {
    if (isNilai(r.nilai)) lama.set(r.orang_id, { ...(lama.get(r.orang_id) ?? {}), [r.kpi_id]: r.nilai });
  }
  // Dua lintasan: cocokkan ke panitia saja; baris yang ditolak karena "tidak dikenal" dicoba ke seluruh Daftar Individu.
  const pertama = siapkanImpor(rows, peta, kpi, panitia, lama);
  const baris = pertama.map((b) => {
    if (b.status !== "ditolak" || b.alasan !== "nama tidak dikenal") return b;
    const ulang = siapkanImpor([rows[b.no - 2]], peta, kpi, lain, lama)[0];
    return ulang ? { ...ulang, no: b.no } : b;
  });
  return { ok: true, sheet, sheets: wb.SheetNames, headers, peta, baris, ringkas: ringkasImpor(baris) };
}

/** Tulis baris Baru/Berubah hasil pratinjau. Sumber 'impor'; tulis ulang idempoten. */
export async function tulisImporAction(
  slug: string,
  baris: { orangId: string; panitiaId: string | null; nilai: Record<string, string>; evidence: string }[],
): Promise<{ ok: boolean; pesan: string }> {
  const user = await requireStaff();
  const a = await acaraDariSlug(slug);
  if (!a) return { ok: false, pesan: "Acara tidak ditemukan." };
  if (!Array.isArray(baris) || baris.length > 2000) return { ok: false, pesan: "Isian tidak sah." };
  const kpi = new Map((await kpiPanitia()).map((k) => [k.id, k]));
  const uuid = /^[0-9a-f-]{36}$/i;
  const db = getDb();
  let n = 0;
  await db.transaction(async (tx) => {
    for (const b of baris) {
      if (typeof b?.orangId !== "string" || !uuid.test(b.orangId)) continue;
      const ada = (await tx.execute(sql`select 1 from orang where id = ${b.orangId}`)).rows.length;
      if (!ada) continue;
      const panitiaId = typeof b.panitiaId === "string" && uuid.test(b.panitiaId) ? b.panitiaId : null;
      for (const [kpiId, v] of Object.entries(b.nilai ?? {})) {
        const k = kpi.get(kpiId);
        if (!k || !isNilai(v)) continue;
        await tx.execute(sql`
          insert into penilaian (orang_id, acara_id, panitia_id, kpi_id, kpi_versi, nilai, nilai_angka, sumber, penilai_staff_id)
          values (${b.orangId}, ${a.id}, ${panitiaId}, ${kpiId}, ${k.versi}, ${v}, ${ANGKA[v]}, 'impor', ${user.sub})
          on conflict (orang_id, acara_id, kpi_id, sumber) do update set
            nilai = excluded.nilai, nilai_angka = excluded.nilai_angka, kpi_versi = excluded.kpi_versi,
            penilai_staff_id = excluded.penilai_staff_id, updated_at = now()`);
        n++;
      }
      const ev = typeof b.evidence === "string" ? b.evidence.trim().slice(0, 1000) : "";
      if (ev) {
        await tx.execute(sql`delete from catatan_orang where orang_id = ${b.orangId} and acara_id = ${a.id} and jenis = 'evidence_impor'`);
        await tx.execute(sql`
          insert into catatan_orang (orang_id, acara_id, jenis, isi, oleh_staff_id) values (${b.orangId}, ${a.id}, 'evidence_impor', ${ev}, ${user.sub})`);
      }
    }
  });
  revalidatePath(`/penilaian/${slug}`);
  return { ok: true, pesan: `${n} penilaian ditulis dari ${baris.length} orang.` };
}
