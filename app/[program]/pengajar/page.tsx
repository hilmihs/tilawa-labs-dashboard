import { getProgram } from "@/lib/programs/resolve";
import { getPengajarDirectory } from "@/lib/directory/queries";
import { getPengajarDirectorySemuaBatch } from "@/lib/directory/semua-batch";
import { getBatchSiblings } from "@/lib/programs/families";
import { getLastSync } from "@/lib/sync/last-sync";
import { getHkmDashboardData } from "../hkm/queries";
import { canonicalPengajar, getTeacherPhone } from "@/lib/hkm/teacher-phones";
import { normalizePhone } from "@/lib/wa";
import { KpiStrip, type KpiIssue } from "@/components/ui/kpi-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { BatchSwitcher } from "../BatchSwitcher";
import { PengajarActions } from "./PengajarActions";
import { PengajarTable } from "./PengajarTable";
import { parsePengajarFokus, type PengajarFokus } from "./fokus";
import { MatrixTab } from "./MatrixTab";
import {
  bulanPilihan,
  loadMatrix,
  resolveBulan,
  getAttendanceThresholdPct,
  DEFAULT_THRESHOLD_PCT,
} from "./queries";

/**
 * Halaman tabel: lebar penuh dengan pagar 1600px, bukan `max-w-6xl`. Di layar
 * 1513px nama pengajar patah tiga baris sementara ~300px kanan menganggur.
 * Teks penjelasan tetap dibatasi supaya barisnya tidak jadi selebar layar.
 */
const SHELL = "mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8";

export const metadata = { title: "Daftar Pengajar" };
export const dynamic = "force-dynamic";

/** HKM pengajar recap: setoran-based, so the columns are juz/target, not presensi. */
async function HkmPengajar({ program }: { program: string }) {
  const data = await getHkmDashboardData(program);
  if (!data) {
    return (
      <main className={SHELL}>
        <EmptyState title="Data HKM belum tersedia" description="Jalankan sync HKM lebih dulu." />
      </main>
    );
  }

  // Which halaqah each teacher holds — halaqahLeaderboard carries the pengajar.
  const halaqahOf = new Map<string, string[]>();
  for (const h of data.halaqahLeaderboard) {
    const key = canonicalPengajar(h.pengajar);
    halaqahOf.set(key, [...(halaqahOf.get(key) ?? []), h.key]);
  }

  return (
    <main className={SHELL}>
      <div className="max-w-2xl">
        <h1 className="text-20 font-bold tracking-[-0.01em]">Daftar Pengajar</h1>
        <p className="mt-1 text-14 text-ink-muted">
          {data.pengajarLeaderboard.length} pengajar · capaian setoran peserta binaannya.
        </p>
      </div>
      <TableWrap maxHeight="70vh">
        <Table>
          <THead sticky>
            <TR>
              <TH>Pengajar</TH>
              <TH>Halaqah</TH>
              <TH className="text-right">Peserta</TH>
              <TH className="text-right">Rata² juz</TH>
              <TH className="text-right">Capai target</TH>
              <TH className="text-right">Belum target</TH>
              <TH className="text-right">Khatam</TH>
            </TR>
          </THead>
          <TBody>
            {data.pengajarLeaderboard.map((p) => {
              const name = canonicalPengajar(p.key);
              const wa = normalizePhone(getTeacherPhone(name));
              return (
                <TR key={p.key}>
                  <TD className="font-medium">
                    {name}
                    {wa ? (
                      <a
                        href={`https://wa.me/${wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-11 font-normal text-ok hover:underline"
                      >
                        WA
                      </a>
                    ) : (
                      <span className="ml-2 text-11 font-normal text-ink-faint">nomor belum ada</span>
                    )}
                  </TD>
                  <TD className="text-14 text-ink-muted">
                    {(halaqahOf.get(name) ?? []).join(", ") || "—"}
                  </TD>
                  <TD className="text-right tabular-nums">{p.count}</TD>
                  <TD className="text-right tabular-nums">{p.avgJuz.toFixed(1)}</TD>
                  <TD className="text-right tabular-nums">{p.onTargetPct.toFixed(0)}%</TD>
                  <TD className="text-right tabular-nums">
                    {p.behindCount > 0 ? (
                      <span className="text-warn">{p.behindCount}</span>
                    ) : (
                      "0"
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{p.khatamCount}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableWrap>
    </main>
  );
}

export default async function PengajarPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<{ bulan?: string; fokus?: string; batch?: string }>;
}) {
  const { program } = await params;
  const { bulan: bulanParam, fokus: fokusParam, batch: batchParam } = await searchParams;
  // `?batch=semua` menggabungkan seluruh batch sekeluarga (hits-regular/-apr/-jan).
  const semuaBatch = batchParam === "semua";
  const programRow = await getProgram(program);

  if (programRow?.dataSourceType === "berkah_api") {
    return <HkmPengajar program={program} />;
  }

  // Matrix skill only exists for the HITS programs pinned to a Maahir batch;
  // `loadMatrix` answers "tanpa-pin" for everyone else and the tab stays hidden.
  const bulan = resolveBulan(bulanParam);
  const [dir, lastSync, siblings, matrix, thresholdPct] = await Promise.all([
    semuaBatch ? getPengajarDirectorySemuaBatch(program) : getPengajarDirectory(program),
    getLastSync(program),
    getBatchSiblings(program, { halaqahCount: true }),
    loadMatrix(programRow?.config, bulan),
    programRow
      ? getAttendanceThresholdPct(programRow.id)
      : Promise.resolve(DEFAULT_THRESHOLD_PCT),
  ]);

  if (!dir) {
    return (
      <main className={SHELL}>
        <p className="text-14 text-ink-muted">Program tidak ditemukan.</p>
      </main>
    );
  }

  const totalPeserta = dir.rows.reduce((n, r) => n + r.studentCount, 0);
  const totalGap = dir.rows.reduce((n, r) => n + r.dueTanpaPresensi, 0);
  const terisi = dir.rows.reduce((n, r) => n + r.recordedMeetings, 0);

  /*
   * Angka utama halaman pengajar: kepatuhan presensi, bukan cacah pengajar.
   *
   * Penyebutnya SENGAJA bukan `totalMeetings` — itu memuat pertemuan yang belum
   * terjadi, jadi program yang baru berjalan separuh akan terbaca "50% patuh"
   * padahal tidak ada yang tertinggal. Yang sudah jatuh tempo = pertemuan yang
   * sudah ada presensinya + pertemuan lewat yang belum disentuh.
   *
   * Ambangnya ambang program yang sama yang dipakai laporan bulanan sebagai
   * "ambang pengajar" pada rasio mengajar, supaya layar dan xlsx tidak berbeda.
   */
  const jatuhTempo = terisi + totalGap;
  const kepatuhan = jatuhTempo > 0 ? (terisi / jatuhTempo) * 100 : null;

  const bawahAmbang = dir.rows.filter(
    (r) => r.avgRate != null && r.avgRate < thresholdPct,
  ).length;
  const tanpaWa = dir.rows.filter((r) => !r.phone).length;

  // Setiap chip KPI menyaring tabel di halaman ini lewat `?fokus=…`, bukan jalan
  // buntu; `bulan` ikut supaya tab Matrix tidak lompat balik ke bulan berjalan.
  const fokus = parsePengajarFokus(fokusParam);
  const hrefFokus = (f?: PengajarFokus) => {
    const q = new URLSearchParams();
    if (bulanParam) q.set("bulan", bulanParam);
    if (semuaBatch) q.set("batch", "semua");
    if (f) q.set("fokus", f);
    const s = q.toString();
    return `/${program}/pengajar${s ? `?${s}` : ""}#daftar-pengajar`;
  };
  const tanpaFokusHref = hrefFokus();

  const issues: KpiIssue[] = [
    {
      label: "pertemuan belum dipresensi",
      value: totalGap,
      href: hrefFokus("belum-presensi"),
    },
    {
      label: `pengajar rata² < ${thresholdPct}%`,
      value: bawahAmbang,
      href: hrefFokus("bawah-target"),
      tone: "danger",
    },
    { label: "pengajar tanpa nomor WA", value: tanpaWa, href: hrefFokus("tanpa-wa") },
  ];

  return (
    <main className={SHELL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-20 font-bold tracking-[-0.01em]">Daftar Pengajar</h1>
          <p className="mt-1 text-14 text-ink-muted">
            Seluruh pengajar {dir.programName}, halaqah yang diampu, dan kondisi presensinya.
          </p>
        </div>
        <PengajarActions
          program={program}
          exportHref={`/api/reports/${program}/pengajar-list${semuaBatch ? "?batch=semua" : ""}`}
          syncAt={lastSync?.finishedAt ?? null}
          syncFailed={lastSync?.lastStatus === "failed"}
          syncRunning={!!lastSync?.running}
        />
      </div>

      <BatchSwitcher siblings={siblings} page="pengajar" semua={semuaBatch} />

      {dir.rows.length === 0 ? (
        <EmptyState
          title="Belum ada pengajar tersinkron"
          description="Jalankan sync untuk program ini lebih dulu."
        />
      ) : (
        <>
          <KpiStrip
            hero={{
              label: "Kepatuhan presensi",
              value: kepatuhan == null ? "—" : kepatuhan.toFixed(1),
              unit: kepatuhan == null ? undefined : "%",
              progress: kepatuhan ?? undefined,
              target: thresholdPct,
              href: hrefFokus("belum-presensi"),
            }}
            support={[
              { label: "Pengajar", value: dir.rows.length, href: tanpaFokusHref },
              {
                label: "Halaqah diampu",
                value: dir.rows.reduce((n, r) => n + r.halaqahCount, 0),
              },
              {
                label: "Peserta dibina",
                value: totalPeserta,
                hint: "lihat daftar peserta",
                href: `/${program}/peserta${semuaBatch ? "?batch=semua" : ""}`,
              },
            ]}
            issues={issues}
            allClearText="Semua pertemuan yang jatuh tempo sudah dipresensi."
          />

          {/* Catatan "belum punya nomor WA" tidak lagi melayang di atas filter —
              baris pengajarnya sendiri yang memakai chip. */}
          <PengajarTable
            program={program}
            rows={dir.rows}
            fokus={fokus}
            tanpaFokusHref={tanpaFokusHref}
            thresholdPct={thresholdPct}
          />
        </>
      )}

      {matrix.state !== "tanpa-pin" && (
        <MatrixTab program={program} data={matrix} bulan={bulan} pilihan={bulanPilihan()} />
      )}
    </main>
  );
}
