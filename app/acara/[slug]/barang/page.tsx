import Link from "next/link";
import { notFound } from "next/navigation";
import { getAcaraBySlug, listBarangAcara, listDivisiAcara } from "@/lib/acara/queries";
import { LABEL_APPROVAL, LABEL_KRITERIA, LABEL_SUMBER, type BarangApproval, type BarangKriteria, type BarangSumber } from "@/lib/acara/types";
import { barangBelumKembali, formatJumlah, kelompokRab, totalHarga } from "@/lib/acara/view-model";
import type { BarangRow } from "@/lib/acara/types";
import { PageHead, rupiah, td, tdNum, th } from "../_ui";
import { ApprovalButtons } from "./ApprovalButtons";

const TABS = [["divisi", "Per divisi"], ["rekap", "Rekap"], ["rab", "RAB"], ["kembali", "Pengembalian"]] as const;
type Tab = (typeof TABS)[number][0];

/** Keempat tab adalah query di atas satu tabel acara_barang. Tidak ada tabel kedua. */
export default async function BarangPage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; approval?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const acara = await getAcaraBySlug(slug);
  if (!acara) notFound();
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "divisi") as Tab;
  const [divisi, barang] = await Promise.all([listDivisiAcara(acara.id), listBarangAcara(acara.id)]);
  const namaDivisi = new Map(divisi.map((d) => [d.id, `${d.nama} (${d.sisi})`]));

  return (
    <>
      <PageHead title="Barang">Satu baris per barang. RAB dan rekap adalah tampilan, bukan tabel lain.</PageHead>
      <nav className="mb-4 flex gap-1">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/acara/${slug}/barang?tab=${k}`} className={`rounded px-3 py-1.5 text-12 ${tab === k ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}>{label}</Link>
        ))}
      </nav>

      {tab === "divisi" && divisi.map((d) => {
        const rows = barang.filter((b) => b.divisiId === d.id);
        if (!rows.length) return null;
        return <Blok key={d.id} judul={`${d.nama} (${d.sisi})`} rows={rows} slug={slug} />;
      })}
      {tab === "rekap" && <Blok judul={`Semua barang (${barang.length})`} rows={barang} slug={slug} namaDivisi={namaDivisi} />}
      {tab === "rab" && <Rab barang={barang} divisi={divisi} approval={sp.approval} slug={slug} />}
      {tab === "kembali" && <Blok judul="Harus kembali, belum kembali" rows={barangBelumKembali(barang)} slug={slug} namaDivisi={namaDivisi} />}
    </>
  );
}

function Blok({ judul, rows, slug, namaDivisi }: { judul: string; rows: BarangRow[]; slug: string; namaDivisi?: Map<string, string> }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-14 font-semibold">{judul}</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full">
          <thead className="bg-neutral-50 dark:bg-neutral-900"><tr>
            <th className={th}>Nama Barang</th>{namaDivisi && <th className={th}>Divisi</th>}<th className={th}>Jumlah</th><th className={th}>Satuan</th>
            <th className={`${th} text-right`}>Harga</th><th className={`${th} text-right`}>Total Harga</th><th className={th}>Kriteria</th><th className={th}>Status</th><th className={th}>Sumber</th><th className={th}>Ketersediaan</th><th className={th}>Aksi</th>
          </tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className={td}>{b.nama}{b.pertanyaan && <div className="text-12 text-amber-700 dark:text-amber-300">? {b.pertanyaan}</div>}{b.alasanTolak && <div className="text-12 text-red-700 dark:text-red-300">Ditolak: {b.alasanTolak}</div>}</td>
                {namaDivisi && <td className={td}>{namaDivisi.get(b.divisiId)}</td>}
                <td className={tdNum}>{formatJumlah(b.jumlah) ?? "—"}</td>
                <td className={td}>{b.satuan ?? ""}</td>
                <td className={tdNum}>{rupiah(b.hargaSatuan === null ? null : Number(b.hargaSatuan))}</td>
                <td className={tdNum}>{rupiah(totalHarga(b.jumlah, b.hargaSatuan))}</td>
                <td className={td}>{b.kriteria ? LABEL_KRITERIA[b.kriteria as BarangKriteria] : ""}</td>
                <td className={td} data-approval={b.id}>{LABEL_APPROVAL[b.statusApproval as BarangApproval] ?? b.statusApproval}</td>
                <td className={td}>{b.sumber ? LABEL_SUMBER[b.sumber as BarangSumber] ?? b.sumber : ""}</td>
                <td className={td}>{b.statusKetersediaan}{b.kriteria === "harus_kembali" ? (b.sudahKembali ? " · kembali" : " · belum kembali") : ""}</td>
                <td className={td}><ApprovalButtons slug={slug} id={b.id} status={b.statusApproval} harusKembali={b.kriteria === "harus_kembali"} sudahKembali={b.sudahKembali} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={td} colSpan={11}>Kosong.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Rab({ barang, divisi, approval, slug }: { barang: BarangRow[]; divisi: Awaited<ReturnType<typeof listDivisiAcara>>; approval?: string; slug: string }) {
  const { kelompok, total } = kelompokRab(barang, divisi, approval || undefined);
  return (
    <section>
      <div className="mb-3 flex gap-2 text-12">
        {["", "diajukan", "disetujui", "ditolak"].map((a) => (
          <Link key={a} href={`/acara/${slug}/barang?tab=rab${a ? `&approval=${a}` : ""}`} className={`rounded border px-2 py-1 ${(approval ?? "") === a ? "border-neutral-900 font-semibold dark:border-neutral-100" : "border-neutral-300 dark:border-neutral-700"}`}>{a || "semua"}</Link>
        ))}
      </div>
      {kelompok.map((k) => (
        <div key={k.label} className="mb-4">
          <h3 className="mb-1 text-12 font-semibold">{k.label}</h3>
          <table className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800">
            <tbody>
              {k.rows.map((b) => (
                <tr key={b.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className={td}>{b.nama}</td><td className={tdNum}>{formatJumlah(b.jumlah)} {b.satuan}</td>
                  <td className={tdNum}>{rupiah(Number(b.hargaSatuan))}</td><td className={tdNum}>{rupiah(totalHarga(b.jumlah, b.hargaSatuan))}</td>
                  <td className={td}>{LABEL_APPROVAL[b.statusApproval as BarangApproval] ?? b.statusApproval}</td>
                </tr>
              ))}
              <tr className="border-t border-neutral-300 font-semibold dark:border-neutral-700"><td className={td} colSpan={3}>Subtotal</td><td className={tdNum}>{rupiah(k.subtotal)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-14 font-bold">Total: {rupiah(total)}</p>
      {kelompok.length === 0 && <p className="text-12 text-muted-foreground">Belum ada barang sumber beli.</p>}
    </section>
  );
}
