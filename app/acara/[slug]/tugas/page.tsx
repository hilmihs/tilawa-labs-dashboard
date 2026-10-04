import { notFound } from "next/navigation";
import { FASE_TUGAS } from "@/lib/acara/input";
import { getAcaraBySlug, listDivisiAcara, listTugasAcara } from "@/lib/acara/queries";
import { saringTugas, susunPapanTugas } from "@/lib/acara/view-model";
import { TUGAS_STATUS } from "@/lib/acara/types";
import { todayJakarta } from "@/lib/time/jakarta";
import { PageHead, input } from "../_ui";
import { TugasTable } from "./TugasTable";

type Param = string | string[] | undefined;

/** ?x=a&x=b datang sebagai array — ambil yang pertama; selain string diabaikan. */
function satu(v: Param): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s ? s : undefined;
}

function faseDari(v: Param): number | undefined {
  const s = satu(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n : undefined;
}

export default async function TugasPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, Param>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const acara = await getAcaraBySlug(slug);
  if (!acara) notFound();
  const today = todayJakarta();
  const [divisi, tugas] = await Promise.all([listDivisiAcara(acara.id), listTugasAcara(acara.id)]);
  const namaDivisi = new Map(divisi.map((d) => [d.id, `${d.nama} (${d.sisi})`]));
  const f = {
    divisiId: satu(sp.divisi),
    fase: faseDari(sp.fase),
    status: satu(sp.status),
    terlambat: satu(sp.terlambat) === "1",
  };
  const rows = susunPapanTugas(saringTugas(tugas, f, today), today).map((t) => ({
    id: t.id, judul: t.judul, divisiNama: t.divisiId ? namaDivisi.get(t.divisiId) ?? null : null,
    fase: t.fase, prioritas: t.prioritas, status: t.status, tenggat: t.tenggat,
    ditugaskanKe: t.ditugaskanKe, terlambat: t.terlambat, beres: t.beres,
  }));

  return (
    <>
      <PageHead title="Tugas">Seluruh divisi. Terlambat dihitung dari tenggat, bukan status.</PageHead>
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <select name="divisi" defaultValue={f.divisiId ?? ""} className={input}>
          <option value="">Semua divisi</option>
          <option value="lintas">Lintas divisi</option>
          {divisi.map((d) => <option key={d.id} value={d.id}>{d.nama} ({d.sisi})</option>)}
        </select>
        <select name="fase" defaultValue={f.fase !== undefined ? String(f.fase) : ""} className={input}>
          <option value="">Semua fase</option>{FASE_TUGAS.map((n) => <option key={n} value={n}>Fase {n}</option>)}
        </select>
        <select name="status" defaultValue={f.status ?? ""} className={input}>
          <option value="">Semua status</option>{TUGAS_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1 text-12"><input type="checkbox" name="terlambat" value="1" defaultChecked={f.terlambat} /> terlambat saja</label>
        <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-12 dark:border-neutral-700">Saring</button>
      </form>
      <TugasTable slug={slug} rows={rows} divisi={divisi.map((d) => ({ id: d.id, nama: d.nama, sisi: d.sisi }))} />
    </>
  );
}
