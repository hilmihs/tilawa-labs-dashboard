import Link from "next/link";
import { requireSuperUser } from "@/lib/auth/require";
import {
  bacaParamCetak,
  geserBulan,
  hrefCetak,
  kepalaTgl,
  labelBulan,
  labelBulanTahun,
  susunLembar,
  type Lembar,
} from "@/lib/kerja/cetak-view";
import { susunLogbook } from "@/lib/kerja/logbook";
import { hadirRentang, listAnggota } from "@/lib/kerja/queries";
import { SESI, SINGKAT_SESI } from "@/lib/kerja/types";
import { jakartaDate } from "@/lib/time/jakarta";
import { TombolCetak } from "./TombolCetak";

export const metadata = { title: "Cetak logbook kehadiran" };
export const dynamic = "force-dynamic";

const BULAN3 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tglPendek = (iso: string) => `${Number(iso.slice(8, 10))} ${BULAN3[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/**
 * Gaya lembar dalam milimeter supaya ukurannya sama dengan kertas: A4 lanskap
 * margin 10 mm → bidang 277 × 190 mm. Kolom: No 9 + Nama 58 + 15 sel × 14 = 277.
 * Warna header harus ikut tercetak → print-color-adjust: exact.
 */
const CSS = `
@page { size: A4 landscape; margin: 10mm; }
@media print { html, body { background: #fff !important; } }
.lb-lembar { box-sizing: border-box; width: 297mm; min-height: 210mm; padding: 10mm; margin: 0 auto; background: #fff; color: #000;
  font-family: Arial, Helvetica, sans-serif; box-shadow: 0 1px 3px rgba(0,0,0,.15), 0 8px 24px rgba(0,0,0,.08);
  -webkit-print-color-adjust: exact; print-color-adjust: exact; break-inside: avoid; }
.lb-lembar + .lb-lembar { margin-top: 8mm; break-before: page; }
@media print { .lb-lembar { width: auto; min-height: 0; padding: 0; box-shadow: none; } .lb-lembar + .lb-lembar { margin-top: 0; } }
.lb-judul { text-align: center; font-weight: 700; font-size: 15pt; letter-spacing: .02em; margin: 0; }
.lb-bulan { text-align: right; font-size: 10.5pt; margin: 2mm 0 0; }
.lb-bulan span { display: inline-block; min-width: 45mm; border-bottom: 1px solid #000; text-align: center; font-weight: 600; }
.lb-instruksi { font-size: 8.5pt; font-style: italic; color: #3b4a7a; margin: 1.5mm 0 2mm; }
.lb-tabel { width: 100%; table-layout: fixed; border-collapse: collapse; }
.lb-tabel th, .lb-tabel td { border: 1px solid #2b3a67; padding: 0 1mm; }
.lb-tabel thead th { background: #dfe3f0; height: 7mm; font-size: 9pt; font-weight: 700; text-align: center; }
.lb-tabel thead .lb-blok { letter-spacing: .06em; }
.lb-tabel thead .lb-hari { font-weight: 400; font-size: 7.5pt; margin-left: 1mm; }
.lb-tabel tbody td { height: 6.8mm; font-size: 10pt; }
.lb-no { text-align: center; }
.lb-nama { font-size: 8.5pt !important; line-height: 1; overflow: hidden; }
.lb-sel { text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lb-sel sup { font-size: 6.5pt; margin-left: .3mm; }
.lb-diperiksa td { height: 9mm; }
.lb-diperiksa .lb-label { font-style: italic; font-size: 9.5pt; padding-left: 2mm; }
.lb-kaki { font-size: 7.5pt; margin: 1.5mm 0 0; }
`;

function LembarLogbook({ l, kosong }: { l: Lembar; kosong: boolean }) {
  return (
    <section className="lb-lembar">
      <h1 className="lb-judul">LOGBOOK KEHADIRAN PENGURUS PENDIDIKAN</h1>
      <p className="lb-bulan">
        Bulan/Tahun: <span>{labelBulanTahun(l.hari)}</span>
      </p>
      <p className="lb-instruksi">
        Tuliskan jam kedatangan pada kolom sesi dengan format 24 jam HH.MM (contoh: 16.00).&nbsp;&nbsp; P = Pagi | Si = Siang | Sr = Sore.
      </p>
      <table className="lb-tabel">
        <colgroup>
          <col style={{ width: "9mm" }} />
          <col style={{ width: "58mm" }} />
          {l.hari.flatMap((_, i) => SESI.map((s) => <col key={`${i}-${s}`} style={{ width: "14mm" }} />))}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={2} className="lb-blok">{l.blok}</th>
            {l.hari.map((t, i) => {
              if (!t) return <th key={`k${i}`} colSpan={3}>Tgl ……</th>;
              const k = kepalaTgl(t);
              return (
                <th key={t} colSpan={3}>
                  Tgl {k.tgl}
                  <span className="lb-hari">({k.hari})</span>
                </th>
              );
            })}
          </tr>
          <tr>
            <th>No</th>
            <th>Nama</th>
            {l.hari.flatMap((_, i) => SESI.map((s) => <th key={`${i}-${s}`}>{SINGKAT_SESI[s]}</th>))}
          </tr>
        </thead>
        <tbody>
          {l.baris.map((b) => (
            <tr key={b.orangId}>
              <td className="lb-no">{b.no}</td>
              <td className="lb-nama">{b.nama}</td>
              {l.hari.flatMap((t, i) =>
                SESI.map((s) => {
                  const c = !kosong && t ? b.sel[t]?.[s] : null;
                  const manual = c?.sumber === "manual";
                  return (
                    <td key={`${i}-${s}`} className="lb-sel" title={manual ? `Diisi manual${c?.catatan ? `: ${c.catatan}` : ""}` : undefined}>
                      {c?.jam}
                      {manual && <sup>*</sup>}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
          <tr className="lb-diperiksa">
            <td colSpan={2} className="lb-label">Diperiksa</td>
            {l.hari.map((t, i) => <td key={t ?? `k${i}`} colSpan={3} />)}
          </tr>
        </tbody>
      </table>
      {!kosong && l.adaManual && <p className="lb-kaki">* diisi manual</p>}
    </section>
  );
}

/**
 * Logbook kehadiran pengurus siap cetak — pengganti lembar kertas. Satu lembar
 * A4 lanskap per 5 tanggal per blok (Ikhwan, lalu Akhwat), jam datang terisi
 * dari tap kartu. ?kosong=1 mencetak formulir kosong (nama saja) seperti kertas lama.
 */
export default async function CetakLogbookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSuperUser();
  const p = bacaParamCetak(await searchParams, jakartaDate());
  const [anggota, hadir] = await Promise.all([
    listAnggota(),
    p.kosong ? Promise.resolve([]) : hadirRentang(p.hari[0], p.hari[p.hari.length - 1]),
  ]);
  const lembar = susunLembar(susunLogbook(anggota, hadir, p.hari));
  const judul = p.rentang ? `${tglPendek(p.rentang.dari)} – ${tglPendek(p.rentang.sampai)}` : labelBulan(p.bulan);
  const tautanBulan = (n: number) => hrefCetak({ bulan: geserBulan(p.bulan, n), kosong: p.kosong });

  return (
    <main className="min-h-screen bg-neutral-200/70 px-4 py-5 text-neutral-900 print:min-h-0 print:bg-white print:p-0">
      <style>{CSS}</style>

      <div className="mx-auto mb-5 flex max-w-[297mm] flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/operating-office/kehadiran?bulan=${p.bulan}`} className="text-12 text-neutral-600 hover:underline">
            ← Kembali ke logbook
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={hrefCetak({ bulan: p.bulan, rentang: p.rentang, kosong: !p.kosong })}
              aria-pressed={p.kosong}
              className={
                p.kosong
                  ? "flex h-9 items-center rounded-[9px] border border-primary bg-primary px-3 text-12 font-medium text-primary-foreground"
                  : "flex h-9 items-center rounded-[9px] border border-neutral-300 bg-white px-3 text-12 font-medium text-neutral-700 hover:bg-neutral-50"
              }
            >
              {p.kosong ? "✓ Formulir kosong" : "Formulir kosong"}
            </Link>
            <TombolCetak />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap items-center gap-1" aria-label="Pilih bulan">
            <Link href={tautanBulan(-1)} className="flex h-8 items-center rounded-md px-2 text-12 text-neutral-600 hover:bg-white" aria-label="Bulan sebelumnya">
              ‹ <span className="hidden sm:inline">{labelBulan(geserBulan(p.bulan, -1))}</span>
            </Link>
            <span className="px-2 text-16 font-semibold">{judul}</span>
            <Link href={tautanBulan(1)} className="flex h-8 items-center rounded-md px-2 text-12 text-neutral-600 hover:bg-white" aria-label="Bulan berikutnya">
              <span className="hidden sm:inline">{labelBulan(geserBulan(p.bulan, 1))}</span> ›
            </Link>
          </nav>
          <p className="text-12 text-neutral-500">
            {lembar.length} lembar · A4 lanskap · skala 100%, matikan header/footer peramban
          </p>
        </div>
      </div>

      {lembar.length === 0 ? (
        <p className="mx-auto max-w-[297mm] rounded-md bg-white p-6 text-14 text-neutral-600">
          Belum ada anggota logbook. Tambahkan pengurus di{" "}
          <Link href="/operating-office/pengurus" className="underline">
            daftar pengurus
          </Link>{" "}
          dulu.
        </p>
      ) : (
        <div className="overflow-x-auto pb-4 print:overflow-visible print:pb-0">
          {lembar.map((l) => (
            <LembarLogbook key={l.kunci} l={l} kosong={p.kosong} />
          ))}
        </div>
      )}
    </main>
  );
}
