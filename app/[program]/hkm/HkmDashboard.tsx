import Link from "next/link";
import { Button } from "@/components/ui/button";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SyncBar } from "../SyncBar";
import { getLastSync, lastSyncLabel } from "@/lib/sync/last-sync";
import { Badge } from "@/components/ui/badge";
import { getHkmDashboardData, type HkmMode } from "./queries";
import { monthLabel, HKM_STATUS_LABEL } from "@/lib/insights/hkm";
import { HkmParticipants } from "./HkmParticipants";
import { HkmViewControls } from "./HkmViewControls";
import { TrendChart } from "./TrendChart";
import { RemindButton } from "./RemindButton";

export async function HkmDashboard({
  program,
  mode,
  month,
  embedded = false,
}: {
  program: string;
  mode?: HkmMode;
  month?: string;
  /**
   * Rendered as the "Setoran Tilawah" half of the one HKM page: a section, not
   * a <main>, and no sync bar — the page header's bar refreshes presensi and
   * setoran together.
   */
  embedded?: boolean;
}) {
  const [data, lastSync] = await Promise.all([
    getHkmDashboardData(program, { mode, month }),
    getLastSync(program),
  ]);
  const sync = lastSyncLabel(lastSync);

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-6 py-8">
        <EmptyState title="Program bukan sumber HKM CMS" description="dataSourceType harus 'berkah_api'." />
      </main>
    );
  }

  const { kpis, target, reconciliation } = data;
  const Wrapper = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
  const rc =
    reconciliation.unmatchedPulled.length +
    reconciliation.noEmailMasters.length +
    reconciliation.noDataMasters.length;

  return (
    // Daftar peserta + perlu perhatian. Papan peringkat per halaqah/pengajar
    // dibuang atas permintaan pemilik (23 Sep 2026); datanya tetap dipakai
    // halaman Pengajar.
    <Wrapper id="setoran" className={embedded ? "space-y-6 scroll-mt-6" : "mx-auto w-full max-w-[1600px] px-6 py-8 space-y-6"}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Heading className="text-20 font-bold tracking-[-0.01em]">
            {embedded ? "Setoran Tilawah" : "Monitoring Tilawah HKM"}
          </Heading>
          <p className="mt-1 text-14 text-ink-muted">
            {data.mode === "bulanan" ? (
              <>
                Mode <b>Bulanan</b> — {monthLabel(data.month)}, target {data.monthTargetPages} hal
                per peserta.
              </>
            ) : (
              <>
                Mode <b>Kumulatif</b> — per {data.period.endDate}, target {target.targetPages} hal /{" "}
                {target.targetJuz} juz.
              </>
            )}
          </p>
          {/* Rincian sumber dan angka acuan dilipat: yang dibaca tiap hari cuma
              mode dan targetnya. */}
          <details className="text-12 text-ink-muted">
            <summary className="cursor-pointer font-medium">Dari mana angkanya?</summary>
            <p className="mt-1.5">
              Ditarik dari cms.example.com (user internal), dengan target{" "}
              {target.pagesPerDay} halaman/hari. Master peserta yang dipantau:{" "}
              {data.participantMasterCount} orang.
            </p>
          </details>
          <HkmViewControls mode={data.mode} month={data.month} monthOptions={data.monthOptions} />
        </div>
        <div className="flex flex-col items-end gap-2">
          {!embedded && <SyncBar program={program} label={sync.text} tone={sync.tone} />}
          {/* Export murah dan bisa diulang — sekunder, dan tidak boleh tampil
              sekuat tombol tarik-ulang penuh di SyncBar di atasnya. */}
          <div className="flex gap-2">
            <Button asChild variant="secondary" size="xs">
              <a href={`/api/reports/${program}/hkm-participant`}>Export xlsx · rekap</a>
            </Button>
            <Button asChild variant="secondary" size="xs">
              <a href={`/api/reports/${program}/hkm-belum-target`}>Export xlsx · belum target</a>
            </Button>
          </div>
        </div>
      </div>

      {/* Master kosong juga dilaporkan walau the partner system sudah tertarik: tanpa master
          tidak ada satu peserta pun yang dihitung, dan halaman ini dulu justru
          menampilkan "Aman" di atas 0 peserta. */}
      {(!data.hasData || data.participantMasterCount === 0) && (
        <Alert variant="warning">
          {data.hasData ? "Akun dan riwayat baca the partner system sudah tertarik, tetapi belum ada peserta yang dipantau." : "Belum ada data tilawah tersinkron."}{" "}
          {data.participantMasterCount > 0 ? (
            <>
              <b>{data.participantMasterCount} peserta master</b> sudah diimpor — klik{" "}
              <b>Refresh sekarang</b> untuk menarik progres tilawah dari HKM CMS.
            </>
          ) : (
            <>
              Master peserta masih kosong. Klik <b>Refresh sekarang</b>: sync mengisinya dari
              roster presensi HKM, atau unggah master di Admin → Pengguna.
            </>
          )}
        </Alert>
      )}

      {/*
       * Dulu enam sampai tujuh kotak sejajar berbobot sama, beberapa di
       * antaranya nol permanen. Sekarang: satu angka yang menentukan, dua-tiga
       * angka ukuran, dan sisanya chip masalah yang hilang sendiri ketika nol —
       * dengan satu baris "aman" kalau memang tidak ada apa-apa.
       */}
      {data.mode === "bulanan" ? (
        <KpiStrip
          hero={{
            label: `Rata² capaian ${monthLabel(data.month)}`,
            value: data.monthlyKpis.avgCapaian,
            unit: "%",
            target: 100,
          }}
          support={[
            { label: "Peserta", value: data.monthlyKpis.total },
            { label: "Tercapai", value: data.monthlyKpis.tercapai },
            {
              label: "Total halaman",
              value: data.monthlyKpis.totalPages,
              hint: `target ${data.monthTargetPages} hal/peserta`,
            },
          ]}
          issues={[
            { label: "belum tercapai", value: data.monthlyKpis.belumTercapai, tone: "warning" },
            { label: "tidak aktif", value: data.monthlyKpis.tidakAktif, tone: "danger" },
          ]}
          allClearText={kpis.total > 0 ? "Aman — semua peserta mencapai target bulan ini" : undefined}
        />
      ) : (
        <KpiStrip
          hero={{
            label: "Rata² juz per peserta",
            value: kpis.avgJuz,
            unit: "juz",
          }}
          support={[
            { label: "Peserta", value: kpis.total },
            { label: "Sudah khatam", value: kpis.sudahKhatam },
            {
              label: "Sudah target",
              value: kpis.sudahTarget,
              hint: `${kpis.totalPages} hal total`,
            },
          ]}
          issues={[
            { label: "belum target", value: kpis.belumTarget, tone: "warning" },
            { label: "belum mulai", value: kpis.belumMulai, tone: "danger" },
            { label: "perlu perhatian", value: kpis.atRisk, tone: "danger" },
          ]}
          allClearText={kpis.total > 0 ? "Aman — semua peserta sudah mulai dan on-target" : undefined}
        />
      )}

      {/* Trend (cumulative only) */}
      {data.mode === "kumulatif" && data.trend.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-ink-muted">Tren tilawah kohort (rata² juz per hari)</h2>
          <TrendChart data={data.trend} />
        </section>
      )}

      {/* Participants (client-filtered) */}
      <HkmParticipants
        program={program}
        rows={data.participants}
        targetPages={target.targetPages}
        mode={data.mode}
        monthLabelText={monthLabel(data.month)}
      />

      {/* At-risk */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-ink-muted">
            Peserta perlu perhatian ({data.atRisk.length})
          </h2>
          <RemindButton program={program} count={data.atRisk.filter((r) => r.phone).length} />
        </div>
        {data.atRisk.length === 0 ? (
          <EmptyState
            tone="success"
            title="Tidak ada peserta yang perlu perhatian"
            description="Peserta yang tertinggal jauh dari target atau lama tidak setor muncul di sini beserta tautan WA-nya."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Nama</TH>
                  <TH>Halaqah</TH>
                  <TH className="text-right">Juz</TH>
                  <TH>Alasan</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {data.atRisk.map((r) => (
                  <TR key={r.participantId}>
                    <TD className="font-medium">
                      <Link href={`/${program}/hkm/${r.participantId}`} className="hover:underline">
                        {r.nama}
                      </Link>
                    </TD>
                    <TD className="text-ink-muted">{r.halaqah ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{r.cumulativeJuz}</TD>
                    <TD className="text-ink-muted">{r.riskReasons.join("; ")}</TD>
                    <TD className="text-right">
                      {r.phone && (
                        <a
                          href={`https://wa.me/${r.phone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ok hover:underline"
                        >
                          WA
                        </a>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </section>

      {/* Off the roster — recorded, not monitored */}
      {data.nonAktif.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-ink-muted">
            Peserta non-aktif ({data.nonAktif.length})
          </h2>
          <p className="text-xs text-ink-faint">
            Tidak dihitung dalam KPI, target, maupun daftar perlu perhatian. Datanya tetap tersimpan.
          </p>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Nama</TH>
                  <TH>Halaqah</TH>
                  <TH>Status</TH>
                  <TH>Keterangan</TH>
                  <TH className="text-right">Sejak</TH>
                </TR>
              </THead>
              <TBody>
                {data.nonAktif.map((r) => (
                  <TR key={`${r.nama}-${r.halaqah ?? ""}`}>
                    <TD className="font-medium">{r.nama}</TD>
                    <TD className="text-ink-muted">{r.halaqah ?? "—"}</TD>
                    <TD>
                      <Badge tone={r.status === "wafat" ? "neutral" : "warning"}>
                        {HKM_STATUS_LABEL[r.status]}
                      </Badge>
                    </TD>
                    <TD className="text-ink-muted">{r.statusNote ?? "—"}</TD>
                    <TD className="text-right text-ink-muted tabular-nums">
                      {r.statusChangedAt ? r.statusChangedAt.slice(0, 10) : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </section>
      )}

      {/* Reconciliation / data quality */}
      {rc > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-ink-muted">Kualitas data ({rc})</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            <ReconList
              title={`Internal tak terdaftar (${reconciliation.unmatchedPulled.length})`}
              hint="user internal di HKM CMS tapi tidak ada di master HKM"
              items={reconciliation.unmatchedPulled.map((u) => u.name ?? u.email ?? "?")}
            />
            <ReconList
              title={`Master tanpa email (${reconciliation.noEmailMasters.length})`}
              hint="tidak bisa join ke data live sampai email diisi"
              items={reconciliation.noEmailMasters.map((m) => `${m.nama} · ${m.halaqah ?? "?"}`)}
            />
            <ReconList
              title={`Master tanpa data (${reconciliation.noDataMasters.length})`}
              hint="punya email tapi belum ada tilawah tercatat"
              items={reconciliation.noDataMasters.map((m) => `${m.nama} · ${m.halaqah ?? "?"}`)}
            />
          </div>
          {reconciliation.lowConfidence.length > 0 && (
            <p className="text-xs text-ink-faint">
              {reconciliation.lowConfidence.length} baris master hasil fuzzy-match (confidence &lt; 1.0) — perlu verifikasi manual.
            </p>
          )}
        </section>
      )}
    </Wrapper>
  );
}

function ReconList({ title, hint, items }: { title: string; hint: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-card p-4 dark:border-neutral-800">
      <div className="text-sm font-medium">{title}</div>
      <div className="mb-2 text-xs text-ink-faint">{hint}</div>
      {items.length === 0 ? (
        <div className="text-xs text-ink-faint">—</div>
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs text-ink-muted">
          {items.slice(0, 100).map((it, i) => (
            <li key={i}>{it}</li>
          ))}
          {items.length > 100 && <li className="text-ink-faint">…dan {items.length - 100} lagi</li>}
        </ul>
      )}
    </div>
  );
}
