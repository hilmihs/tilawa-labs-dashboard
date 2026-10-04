import { ReportView } from "./ReportView";
import { getProgram } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { getBatchOptions, resolveReportScope } from "@/lib/reports/scope";
import { getHitsMonthlyReport } from "@/lib/reports/queries";
import { monthBounds } from "@/lib/insights/hkm/monthly";
import { getHkmDashboardData } from "../hkm/queries";
import { HkmReport } from "../hkm/HkmReport";
import { MaahirReport } from "./MaahirReport";
import { punyaHasilUjian } from "@/lib/insights/evaluasi/maahir";

export const metadata = { title: "Laporan Bulanan" };
export const dynamic = "force-dynamic";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<{ month?: string; batch?: string }>;
}) {
  const { program } = await params;

  // HKM (berkah-backed) programs render a month-scoped tilawah report.
  const programRow = await getProgram(program);
  if (programRow?.dataSourceType === "berkah_api") {
    const { month } = await searchParams;
    const data = await getHkmDashboardData(program, { mode: "bulanan", month });
    if (!data) return null;
    // Teacher attendance for HKM lives in the SEPARATE presensi program
    // (config.presensiSlug, a tilawah_api row) — the setoran program has no
    // meetings of its own. Same join lib/reports/hkm-bulanan.ts makes for the
    // coordinator's workbook.
    //
    // The window is the REPORTING month (28th→27th), not data.period: that one
    // spans the whole programme (config start → today) and would read as a
    // lifetime ratio on a page labelled "rekap bulanan". getHitsMonthlyReport
    // clamps the teacher end to today itself, so a future 27th is harmless.
    const { start: mStart, end: mEnd } = monthBounds(data.month);
    const presensiSlug = getProgramConfig(programRow).presensiSlug;
    const presensiScope = presensiSlug ? await resolveReportScope(presensiSlug) : null;
    const presensi = presensiScope
      ? await getHitsMonthlyReport(presensiScope, mStart, mEnd)
      : null;
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <HkmReport program={program} data={data} teacher={presensi?.overall ?? null} />
      </main>
    );
  }

  // Maahir tidak punya presensi mentah yang bisa diagregasi di sini — laporannya
  // sudah jadi di sisi upstream dan dicerminkan sebagai workbook. Cabang generik
  // di bawah membaca tabel tilawah, yang untuk program ini nol baris.
  if (programRow?.dataSourceType === "maahir_api") {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
        <MaahirReport program={program} />
      </main>
    );
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  // Both recaps run on the current calendar month. The teacher recap used to
  // default to the 16–15 honor period; the monthly report the coordinators
  // circulate is per calendar month, so the two tabs now line up.
  const pStart = iso(new Date(Date.UTC(y, m, 1)));
  const pEnd = iso(new Date(Date.UTC(y, m + 1, 0)));
  const tStart = pStart;
  const tEnd = pEnd;

  const reportFormat = getProgramConfig(programRow ?? { config: null }).reportFormat;

  // Batch picker for the participant tab. Empty for a program with a single
  // batch (or a session that may only read one of them) — nothing to choose.
  const { batch } = await searchParams;
  const batchOptions = await getBatchOptions(program, batch);
  const adaHasilUjian = programRow?.dataSourceType === "tilawah_api" ? await punyaHasilUjian(program, programRow.id) : false;

  return (
    // Wide recap tables (up to 8 columns × every pengajar) need the whole
    // viewport; the old max-w-5xl box forced a horizontal scroll on a screen
    // that had room to spare. Prose stays narrow so the intro is still readable.
    <main className="w-full space-y-6 px-6 py-8">
      <div>
        <h1 className="text-[19px] font-bold tracking-[-0.01em]">Laporan Bulanan</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          Laporan peserta, rekap presensi mengajar pengajar{adaHasilUjian ? ", dan hasil ujian" : ""} — per bulan kalender
          (rentang tanggal bisa diubah). Bisa diunduh sebagai xlsx.
        </p>
      </div>
      <ReportView
        program={program}
        defaults={{ pStart, pEnd, tStart, tEnd }}
        reportFormat={reportFormat}
        batchOptions={batchOptions}
        batch={batch}
        punyaHasilUjian={adaHasilUjian}
      />
    </main>
  );
}
