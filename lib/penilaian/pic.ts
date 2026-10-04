/**
 * Penilaian lewat link PIC (design "Input Penilaian" p2): tautan papan divisi
 * bertoken + /nilai. PIC menilai anggota divisinya dari HP, tanpa akun. Nilai
 * disimpan dengan sumber 'link_pic' — berdampingan dengan nilai tim
 * kaderisasi ('grid'), tidak menimpanya. Evidence PIC disimpan sebagai
 * catatan jenis 'evidence_pic' supaya tidak menimpa evidence tim.
 *
 * Yang dinilai PIC: anggota divisinya sendiri (bukan PIC/koordinator/ketua/
 * pengawas — mereka dinilai tim kaderisasi lewat grid atau wawancara).
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { kpiPanitia, type Kpi } from "./queries";
import { ANGKA, butuhEvidence, isNilai, saranTepatWaktu, type Nilai } from "./skala";

// Sama dengan daftar literal di kueri getFormPic.
const PERAN_TIDAK_DINILAI_PIC = ["pic", "koordinator", "ketua", "pengawas"];

export type AnggotaPic = {
  panitiaId: string;
  nama: string;
  peran: string;
  tertaut: boolean;
  hadir: boolean;
  tugasSelesai: number;
  tugasTotal: number;
  nilai: Record<string, Nilai>;
  saran: Record<string, Nilai>;
  evidence: string;
};

export async function getFormPic(
  acara: { id: string; tanggal: string; jamMulai: string | null; toleransiMenit: number },
  divisiId: string,
): Promise<{ kpi: Kpi[]; anggota: AnggotaPic[]; picId: string | null }> {
  const db = getDb();
  const [kpi, rows, pic] = await Promise.all([
    kpiPanitia(),
    db.execute(sql`
      select p.id, p.nama, p.gelar, p.peran, p.orang_id, h.waktu::text hadir_waktu,
        count(t.id) filter (where t.status in ('selesai', 'disetujui'))::int tugas_selesai, count(t.id)::int tugas_total
      from acara_panitia p
      left join acara_hadir h on h.acara_id = p.acara_id and h.orang_id = p.orang_id
      left join acara_tugas t on t.acara_id = p.acara_id and t.panitia_id = p.id
      where p.acara_id = ${acara.id} and p.divisi_id = ${divisiId} and p.status <> 'mundur'
        and p.peran not in ('pic', 'koordinator', 'ketua', 'pengawas')
      group by p.id, h.waktu
      order by p.nama`),
    db.execute(sql`
      select id from acara_panitia where acara_id = ${acara.id} and divisi_id = ${divisiId} and peran = 'pic'
      order by created_at limit 1`),
  ]);
  const orangIds = (rows.rows as { orang_id: string | null }[]).map((r) => r.orang_id).filter((x): x is string => !!x);
  const idArr = sql`array[${sql.join(orangIds.map((i) => sql`${i}`), sql`, `)}]::uuid[]`;
  const nilaiRes = orangIds.length
    ? await db.execute(sql`
        select orang_id, kpi_id, nilai from penilaian
        where acara_id = ${acara.id} and sumber = 'link_pic' and orang_id = any(${idArr})`)
    : { rows: [] };
  const evRes = orangIds.length
    ? await db.execute(sql`
        select orang_id, isi from catatan_orang
        where acara_id = ${acara.id} and jenis = 'evidence_pic' and orang_id = any(${idArr})`)
    : { rows: [] };
  const nilai = new Map<string, Record<string, Nilai>>();
  for (const r of nilaiRes.rows as { orang_id: string; kpi_id: string; nilai: string }[]) {
    if (!isNilai(r.nilai)) continue;
    nilai.set(r.orang_id, { ...(nilai.get(r.orang_id) ?? {}), [r.kpi_id]: r.nilai });
  }
  const ev = new Map((evRes.rows as { orang_id: string; isi: string }[]).map((r) => [r.orang_id, r.isi]));
  const kpiWaktu = kpi.find((k) => k.otomatis && k.kode === "tepat_waktu");

  const anggota: AnggotaPic[] = (rows.rows as Record<string, unknown>[]).map((r) => {
    const orangId = (r.orang_id as string | null) ?? null;
    const saran: Record<string, Nilai> = {};
    const s = kpiWaktu ? saranTepatWaktu((r.hadir_waktu as string | null) ?? null, acara) : null;
    if (kpiWaktu && s) saran[kpiWaktu.id] = s;
    return {
      panitiaId: String(r.id),
      nama: `${r.gelar ? `${r.gelar} ` : ""}${r.nama}`,
      peran: String(r.peran),
      tertaut: !!orangId,
      hadir: !!r.hadir_waktu,
      tugasSelesai: Number(r.tugas_selesai),
      tugasTotal: Number(r.tugas_total),
      nilai: (orangId && nilai.get(orangId)) || {},
      saran,
      evidence: (orangId && ev.get(orangId)) || "",
    };
  });
  return { kpi, anggota, picId: (pic.rows[0] as { id: string } | undefined)?.id ?? null };
}

/** Simpan nilai PIC untuk satu anggota. Semua dicek ulang di server. */
export async function simpanNilaiPic(input: {
  acaraId: string;
  divisiId: string;
  panitiaId: string;
  nilai: Record<string, string>;
  evidence: string;
}): Promise<{ ok: boolean; pesan: string }> {
  const db = getDb();
  const p = (
    await db.execute(sql`
      select id, orang_id, peran from acara_panitia
      where id = ${input.panitiaId} and acara_id = ${input.acaraId} and divisi_id = ${input.divisiId} and status <> 'mundur'
      limit 1`)
  ).rows[0] as { id: string; orang_id: string | null; peran: string } | undefined;
  if (!p || PERAN_TIDAK_DINILAI_PIC.includes(p.peran)) return { ok: false, pesan: "Anggota ini tidak dinilai lewat tautan ini." };
  if (!p.orang_id) return { ok: false, pesan: "Anggota ini belum terdaftar di Daftar Individu — tim kaderisasi akan menautkannya." };
  const kpi = new Map((await kpiPanitia()).map((k) => [k.id, k]));
  const bersih = Object.entries(input.nilai).filter(([k, v]) => kpi.has(k) && (v === "" || isNilai(v))) as [string, Nilai | ""][];
  const evidence = (input.evidence ?? "").trim().slice(0, 1000);
  if (butuhEvidence(bersih.map(([, v]) => v)) && !evidence) {
    return { ok: false, pesan: "Nilai D atau E perlu contoh kejadian singkat." };
  }
  const pic = (
    await db.execute(sql`
      select id from acara_panitia where acara_id = ${input.acaraId} and divisi_id = ${input.divisiId} and peran = 'pic'
      order by created_at limit 1`)
  ).rows[0] as { id: string } | undefined;

  await db.transaction(async (tx) => {
    for (const [kpiId, v] of bersih) {
      if (v === "") {
        await tx.execute(sql`delete from penilaian where orang_id = ${p.orang_id} and acara_id = ${input.acaraId} and kpi_id = ${kpiId} and sumber = 'link_pic'`);
        continue;
      }
      await tx.execute(sql`
        insert into penilaian (orang_id, acara_id, panitia_id, kpi_id, kpi_versi, nilai, nilai_angka, sumber, penilai_panitia_id)
        values (${p.orang_id}, ${input.acaraId}, ${p.id}, ${kpiId}, ${kpi.get(kpiId)!.versi}, ${v}, ${ANGKA[v]}, 'link_pic', ${pic?.id ?? null})
        on conflict (orang_id, acara_id, kpi_id, sumber) do update set
          nilai = excluded.nilai, nilai_angka = excluded.nilai_angka, kpi_versi = excluded.kpi_versi,
          penilai_panitia_id = excluded.penilai_panitia_id, updated_at = now()`);
    }
    await tx.execute(sql`delete from catatan_orang where orang_id = ${p.orang_id} and acara_id = ${input.acaraId} and jenis = 'evidence_pic'`);
    if (evidence) {
      await tx.execute(sql`
        insert into catatan_orang (orang_id, acara_id, jenis, isi) values (${p.orang_id}, ${input.acaraId}, 'evidence_pic', ${evidence})`);
    }
  });
  return { ok: true, pesan: "Tersimpan." };
}
