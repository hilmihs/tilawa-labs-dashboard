import { Download } from "lucide-react";
import { getProgram } from "@/lib/programs/resolve";
import { getPesertaDirectory } from "@/lib/directory/queries";
import { getPesertaDirectorySemuaBatch } from "@/lib/directory/semua-batch";
import { getBatchSiblings } from "@/lib/programs/families";
import { getLastSync } from "@/lib/sync/last-sync";
import { getHkmDashboardData } from "../hkm/queries";
import { monthLabel } from "@/lib/insights/hkm";
import { HkmParticipants } from "../hkm/HkmParticipants";
import { Button } from "@/components/ui/button";
import { KpiStrip, type KpiIssue, type KpiSupport } from "@/components/ui/kpi-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { BatchSwitcher } from "../BatchSwitcher";
import { PesertaTable } from "./PesertaTable";
import { parsePesertaFokus, type PesertaFokus } from "./fokus";
import { PesertaHeaderActions } from "./PesertaHeaderActions";
import { MaahirPeserta } from "./MaahirPeserta";
import { DEFAULT_THRESHOLD_PCT, getAttendanceThresholdPct } from "./queries";

export const metadata = { title: "Daftar Peserta" };
export const dynamic = "force-dynamic";

export default async function PesertaPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { program } = await params;
  const sp = await searchParams;
  const fokus = parsePesertaFokus(sp.fokus);
  // `?batch=semua` menggabungkan seluruh batch sekeluarga (hits-regular/-apr/-jan).
  const semuaBatch = (Array.isArray(sp.batch) ? sp.batch[0] : sp.batch) === "semua";
  const programRow = await getProgram(program);

  // Program Maahir tidak punya cermin tilawah: `getPesertaDirectory()` membaca
  // `students_sync`, dan sync Maahir tidak pernah menulis ke sana (0 baris per 7
  // Sep 2026). Rosternya ada di `maahir_sync`, jadi layarnya dibaca dari sana —
  // percabangan `dataSourceType` yang sudah diputuskan spesifikasi desain, cara
  // yang sama dengan cabang HKM di bawah.
  if (programRow?.dataSourceType === "maahir_api") {
    return <MaahirPeserta program={program} namaProgram={programRow.name} />;
  }

  // Berkah-backed programs (HKM) keep their own participant model (setoran
  // pages, not presensi), so reuse the HKM participant table there.
  if (programRow?.dataSourceType === "berkah_api") {
    const data = await getHkmDashboardData(program);
    if (!data) {
      return (
        <main className="mx-auto max-w-6xl px-4 py-8">
          <EmptyState title="Data HKM belum tersedia" description="Jalankan sync HKM lebih dulu." />
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-20 font-bold tracking-[-0.01em]">Daftar Peserta</h1>
            <p className="mt-1 text-14 text-ink-muted">
              {data.participants.length} peserta terdaftar pada program ini.
            </p>
          </div>
          <Button asChild variant="secondary">
            <a href={`/api/reports/${program}/hkm-participant`}>
              <Download /> Export xlsx
            </a>
          </Button>
        </div>
        <HkmParticipants
          program={program}
          rows={data.participants}
          targetPages={data.target.targetPages}
          mode={data.mode}
          monthLabelText={monthLabel(data.month)}
        />
      </main>
    );
  }

  const [dir, lastSync, siblings, thresholdPct] = await Promise.all([
    semuaBatch ? getPesertaDirectorySemuaBatch(program) : getPesertaDirectory(program),
    getLastSync(program),
    getBatchSiblings(program, { halaqahCount: true }),
    programRow
      ? getAttendanceThresholdPct(programRow.id)
      : Promise.resolve(DEFAULT_THRESHOLD_PCT),
  ]);

  if (!dir) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-14 text-ink-muted">Program tidak ditemukan.</p>
      </main>
    );
  }

  const batchQ = semuaBatch ? "batch=semua" : "";
  const fokusHref = (f: PesertaFokus) =>
    `/${program}/peserta?${batchQ ? `${batchQ}&` : ""}fokus=${f}#daftar-peserta`;
  const tanpaFokusHref = `/${program}/peserta${batchQ ? `?${batchQ}` : ""}#daftar-peserta`;

  const aktif = dir.rows.filter((r) => r.statusCode == null || r.statusCode === 1);
  const keluar = dir.rows.length - aktif.length;
  const halaqahCount = new Set(
    dir.rows.map((r) => r.halaqahId).filter((id): id is number => id != null),
  ).size;

  /*
   * Angka utama halaman ini adalah kehadiran peserta, bukan cacah pesertanya:
   * "1119 peserta" tidak bisa dibaca bagus atau buruk, "82,4% dari ambang 70%"
   * bisa. Rata-rata per ORANG (bukan per presensi) atas peserta aktif yang sudah
   * punya angka — peserta yang keluar membawa Alfa selamanya dan akan menyeret
   * angka ini turun tanpa ada yang bisa ditindaklanjuti.
   */
  const dinilai = aktif.filter((r) => r.attendanceRate != null);
  const avgKehadiran =
    dinilai.length > 0
      ? dinilai.reduce((n, r) => n + (r.attendanceRate as number), 0) / dinilai.length
      : null;

  /*
   * Semua chip pengecualian dihitung atas peserta AKTIF saja, sama seperti
   * tampilan awal tabel di bawahnya — kalau tidak, chip menjanjikan 40 baris
   * lalu tabel hanya memperlihatkan 12 karena yang lain sudah keluar.
   */
  const bawahAmbang = dinilai.filter((r) => (r.attendanceRate as number) < thresholdPct).length;
  const tanpaHalaqah = aktif.filter((r) => r.halaqahId == null).length;
  const tanpaWa = aktif.filter((r) => !r.phone).length;

  const support: KpiSupport[] = [
    {
      label: "Peserta aktif",
      value: aktif.length,
      hint: `dari ${dir.rows.length} terdaftar`,
      href: tanpaFokusHref,
    },
    { label: "Halaqah", value: halaqahCount },
    {
      label: "Keluar",
      value: keluar,
      href: keluar > 0 ? fokusHref("keluar") : undefined,
    },
  ];

  // Nol tidak dirender sama sekali (KpiStrip yang membuangnya), jadi bar tidak
  // pernah memakai tempat untuk mengatakan "tidak ada apa-apa di sini".
  const issues: KpiIssue[] = [
    {
      label: `peserta < ${thresholdPct}%`,
      value: bawahAmbang,
      href: fokusHref("bawah-target"),
      tone: "danger",
    },
    { label: "belum punya halaqah", value: tanpaHalaqah, href: fokusHref("tanpa-halaqah") },
    { label: "tanpa nomor WA", value: tanpaWa, href: fokusHref("tanpa-wa") },
  ];

  return (
    // Halaman tabel: lebar penuh (dibatasi 1600px agar tidak melebar liar di
    // layar ultra-wide). Teks pengantar tetap dikurung agar enak dibaca.
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-20 font-bold tracking-[-0.01em]">Daftar Peserta</h1>
          <p className="mt-1 text-14 text-ink-muted">
            Seluruh peserta {dir.programName} beserta kontak, penempatan halaqah, dan kehadirannya.
          </p>
        </div>
        <PesertaHeaderActions
          program={program}
          exportHref={`/api/reports/${program}/peserta-list${batchQ ? `?${batchQ}` : ""}`}
          syncAt={lastSync?.finishedAt ?? null}
          syncFailed={lastSync?.lastStatus === "failed"}
          syncRunning={!!lastSync?.running}
        />
      </div>

      <BatchSwitcher siblings={siblings} page="peserta" semua={semuaBatch} />

      {dir.rows.length === 0 ? (
        <EmptyState
          title="Belum ada peserta tersinkron"
          description="Jalankan sync untuk program ini lebih dulu."
        />
      ) : (
        <>
          <KpiStrip
            hero={{
              label: "Rata² kehadiran peserta aktif",
              value: avgKehadiran == null ? "—" : avgKehadiran.toFixed(1),
              unit: avgKehadiran == null ? undefined : "%",
              progress: avgKehadiran ?? undefined,
              target: thresholdPct,
              href: `/${program}/kehadiran`,
            }}
            support={support}
            issues={issues}
            allClearText="Semua peserta aktif punya halaqah, nomor WA, dan kehadiran di atas ambang."
          />

          <PesertaTable
            program={program}
            rows={dir.rows}
            fokus={fokus}
            tanpaFokusHref={tanpaFokusHref}
            thresholdPct={thresholdPct}
            showKeluarga={programRow?.dataSourceType === "mabni_api"}
          />
        </>
      )}
    </main>
  );
}
