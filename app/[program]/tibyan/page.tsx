/**
 * /[program]/tibyan — rekap kehadiran At-Tibyan, cermin dari route
 * `rekap/tibyan` (docs/API-PUBLIC.md §9). Semua angka sudah jadi dari upstream;
 * halaman ini mengurutkan dan memformat, tidak menghitung ulang.
 *
 * Rute ini hanya berlaku untuk program ber-`dataSourceType = 'maahir_api'`;
 * untuk program lain `notFound()` — halaman kosong bertuliskan "belum ada data"
 * di program tilawah akan dibaca sebagai kehadiran nol, bukan sebagai rute yang
 * memang tidak berlaku di sana.
 */
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Sparkline } from "@/components/ui/sparkline";
import { SyncStatus } from "@/components/ui/sync-status";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import { periodLabel, readTibyan } from "@/lib/maahir/rekap";
import { getProgram } from "@/lib/programs/resolve";
import { PeriodePicker, type PeriodePilihan } from "./PeriodePicker";
import { isRouteForbidden } from "./scope";
import {
  distribusiRows,
  formatTanggal,
  perhatianAnggotaRows,
  perhatianKelasRows,
  rankingRows,
  trendChart,
} from "./view-model";

export const metadata = { title: "At-Tibyan" };
// Baca DB tiap request — angkanya berubah setiap sync Maahir jalan.
export const dynamic = "force-dynamic";

function GenderBadge({ gender }: { gender: "ikhwan" | "akhwat" }) {
  return (
    <Badge tone={gender === "ikhwan" ? "info" : "indigo"}>
      {gender === "ikhwan" ? "Ikhwan" : "Akhwat"}
    </Badge>
  );
}

/** Bar persen + angkanya. `null` = belum ada sesi, dirender sebagai teks —
 *  bar sepanjang nol akan terbaca sebagai "tidak ada yang hadir". */
function PersenBar({ persen }: { persen: number | null }) {
  if (persen == null) {
    return <span className="text-xs text-ink-faint">belum ada sesi</span>;
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800">
        <div
          className={
            persen >= 80 ? "h-full bg-emerald-500" : persen >= 60 ? "h-full bg-amber-500" : "h-full bg-red-500"
          }
          style={{ width: `${Math.max(0, Math.min(100, persen))}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono tabular-nums">{persen}%</span>
    </div>
  );
}

export default async function TibyanPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<{ bulan?: string }>;
}) {
  const { program: slug } = await params;
  const sp = await searchParams;
  const programRow = await getProgram(slug);
  if (programRow?.dataSourceType !== "maahir_api") notFound();

  // Dua bulan yang memang ditarik sync (`maahirRekapPulls`). Dipanggil dengan
  // helper yang sama seperti penulisnya supaya kunci `periode`-nya pasti cocok.
  const [bulanBerjalan, bulanLalu] = rekapMonths();
  const pilihan: PeriodePilihan = sp.bulan === "lalu" ? "lalu" : "berjalan";
  const bulan = pilihan === "lalu" ? bulanLalu : bulanBerjalan;

  const [read, forbidden] = await Promise.all([
    readTibyan(bulan),
    isRouteForbidden(programRow.id, "rekap/tibyan"),
  ]);

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-20 font-bold tracking-[-0.01em]">At-Tibyan</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Rekap kehadiran kelas At-Tibyan, diambil jadi dari lapisan rekap Maahir.
        </p>
      </div>
      <PeriodePicker value={pilihan} />
    </div>
  );

  if (!read) {
    return (
      <main className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
        {header}
        {forbidden ? (
          <EmptyState
            title="Scope rekap At-Tibyan belum diberikan"
            description="API key kita dijawab 403 forbidden_scope untuk route rekap/tibyan, jadi angkanya tidak pernah sampai ke sini. Mintakan scope 'maahir' ke pengelola API Maahir — ini bukan berarti kehadirannya nol."
          />
        ) : (
          <EmptyState
            title="Periode ini belum pernah ditarik"
            description="Belum ada baris rekap/tibyan untuk periode ini di maahir_rekap. Jalankan sync Maahir lebih dulu; kosong di sini berarti belum ditarik, bukan kehadiran nol."
          />
        )}
      </main>
    );
  }

  const { payload, meta, fetchedAt } = read;
  const label = periodLabel(meta);
  const ranking = rankingRows(payload.ranking);
  const { rows: distribusi, total: totalCatatan } = distribusiRows(payload.distribusi);
  const chart = trendChart(payload.trend);
  const anggotaPerhatian = perhatianAnggotaRows(payload.perhatian.anggota);
  const kelasPerhatian = perhatianKelasRows(payload.perhatian.kelas);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      {header}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span>
          Periode{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {label ?? "tidak disebut upstream"}
          </span>
        </span>
        <span aria-hidden>·</span>
        {/* Angka lama tetap ditampilkan saat sync terakhir gagal; cap ini yang
            memberi tahu seberapa lama angkanya sudah menganggur — warnanya
            mengikuti ambang usia, bukan merah tanpa syarat. */}
        <SyncStatus at={fetchedAt} prefix="Terakhir ditarik" />
        {meta.dari_cache && <Badge tone="neutral">dari cache upstream</Badge>}
      </div>

      {/* Kehadiran adalah satu-satunya angka yang menentukan tindakan di layar
          ini; sesi dan anggota cuma ukuran kohortnya. "Kelas di bawah target"
          turun jadi chip masalah — nol tidak dirender sama sekali. */}
      <KpiStrip
        hero={{
          label: "Kehadiran keseluruhan",
          value: payload.kpi.overallPersen,
          unit: "%",
        }}
        support={[
          { label: "Sesi", value: payload.kpi.totalSesi, hint: "dalam periode" },
          { label: "Anggota", value: payload.kpi.totalAnggota, hint: `${ranking.length} kelas` },
        ]}
        issues={[
          {
            label: "kelas di bawah target",
            value: payload.kpi.kelasDiBawahTarget,
            tone: "warning",
          },
        ]}
        allClearText="Aman — semua kelas di atas target"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tren harian</CardTitle>
            <p className="text-xs text-ink-muted">Persen kehadiran per tanggal sesi.</p>
          </CardHeader>
          <CardContent>
            {chart ? (
              <>
                <Sparkline points={chart.points} stroke="#4e8c66" height={56} />
                <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
                  <span>
                    {formatTanggal(chart.awal.tanggal, false)} · {chart.awal.persen}%
                  </span>
                  <span className="text-ink-faint">
                    min {chart.min}% · maks {chart.max}%
                  </span>
                  <span>
                    {formatTanggal(chart.akhir.tanggal, false)} · {chart.akhir.persen}%
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-muted">
                Belum cukup titik untuk digambar — periode ini baru punya{" "}
                {payload.trend.length} sesi tercatat.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribusi kehadiran</CardTitle>
            <p className="text-xs text-ink-muted">
              {totalCatatan > 0
                ? `${totalCatatan} catatan presensi dalam periode.`
                : "Belum ada catatan presensi dalam periode."}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {distribusi.map((d) => (
              <div key={d.kode} className="flex items-center gap-3 text-sm">
                <Badge tone={d.tone} className="w-24 justify-center">
                  {d.kode} · {d.label}
                </Badge>
                <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className="h-full bg-neutral-400 dark:bg-neutral-500"
                    style={{ width: `${d.share ?? 0}%` }}
                  />
                </div>
                <span className="w-10 text-right font-mono tabular-nums">{d.jumlah}</span>
                <span className="w-12 text-right font-mono text-xs tabular-nums text-ink-faint">
                  {d.share == null ? "—" : `${d.share.toFixed(0)}%`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Ranking kelas</h2>
        <TableWrap maxHeight="70vh">
          <Table>
            <THead sticky>
              <TR>
                <TH className="w-10 text-right">#</TH>
                <TH>Kelas</TH>
                <TH>Gender</TH>
                <TH className="text-right">Anggota</TH>
                <TH className="text-right">Kehadiran</TH>
              </TR>
            </THead>
            <TBody>
              {ranking.map((r) => (
                <TR key={r.kelasId}>
                  <TD className="text-right font-mono text-xs tabular-nums text-ink-faint">
                    {r.peringkat ?? "—"}
                  </TD>
                  <TD className="font-medium">{r.kelasName}</TD>
                  <TD>
                    <GenderBadge gender={r.gender} />
                  </TD>
                  <TD className="text-right tabular-nums">{r.anggota}</TD>
                  <TD className="text-right">
                    <PersenBar persen={r.persen} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-2 lg:col-span-2">
          <h2 className="text-sm font-semibold">
            Anggota perlu perhatian{" "}
            <span className="font-normal text-ink-faint">({anggotaPerhatian.length})</span>
          </h2>
          {anggotaPerhatian.length === 0 ? (
            <EmptyState tone="success" title="Tidak ada anggota yang perlu ditindak" />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Nama</TH>
                    <TH>Kelas</TH>
                    <TH>Gender</TH>
                    <TH className="text-right">Alpa beruntun</TH>
                    <TH className="text-right">Kehadiran</TH>
                  </TR>
                </THead>
                <TBody>
                  {anggotaPerhatian.map((a) => (
                    <TR key={a.anggotaId}>
                      <TD className="font-medium">{a.name}</TD>
                      <TD className="text-ink-muted">{a.kelasName}</TD>
                      <TD>
                        <GenderBadge gender={a.gender} />
                      </TD>
                      <TD className="text-right">
                        <Badge tone={a.alphaBeruntun >= 3 ? "danger" : "warning"}>
                          {a.alphaBeruntun}×
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <PersenBar persen={a.persen} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Kelas di bawah target{" "}
            <span className="font-normal text-ink-faint">({kelasPerhatian.length})</span>
          </h2>
          {kelasPerhatian.length === 0 ? (
            <EmptyState tone="success" title="Semua kelas di atas target" />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Kelas</TH>
                    <TH className="text-right">Kehadiran</TH>
                  </TR>
                </THead>
                <TBody>
                  {kelasPerhatian.map((k) => (
                    <TR key={`${k.kelasName}-${k.gender}`}>
                      <TD>
                        <div className="font-medium">{k.kelasName}</div>
                        <div className="mt-0.5">
                          <GenderBadge gender={k.gender} />
                        </div>
                      </TD>
                      <TD className="text-right align-top">
                        <PersenBar persen={k.persen} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </section>
      </div>
    </main>
  );
}
