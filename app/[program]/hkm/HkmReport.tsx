"use client";

import { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TableWrap,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  SortTH,
  useTableSort,
  type SortAccessors,
} from "@/components/ui/table";
import { HkmParticipants } from "./HkmParticipants";
import { monthLabel, monthRangeLabel } from "@/lib/insights/hkm";
import { teacherPct } from "@/lib/reports/teacher-attendance";
import type { HitsRow } from "@/lib/reports/queries";
import type { HkmDashboardData, HkmParticipantRow } from "./queries";

type RekapRow = {
  halaqah: string;
  gender: string;
  count: number;
  avgCapaian: number;
  tercapai: number;
  underperform: number;
  khatam: number;
};

type UnderRow = HkmParticipantRow & { gap: number };

// Module-level so their identity is stable across renders (see useTableSort).
const UNDER_SORT: SortAccessors<UnderRow> = {
  nama: (r) => r.nama,
  halaqah: (r) => r.halaqah,
  realisasi: (r) => r.mRealisasi,
  gap: (r) => r.gap,
  capaian: (r) => r.mCapaian,
};

const REKAP_SORT: SortAccessors<RekapRow> = {
  halaqah: (r) => r.halaqah,
  gender: (r) => r.gender,
  count: (r) => r.count,
  avgCapaian: (r) => r.avgCapaian,
  tercapai: (r) => r.tercapai,
  underperform: (r) => r.underperform,
  khatam: (r) => r.khatam,
};

export function HkmReport({
  program,
  data,
  teacher = null,
}: {
  program: string;
  data: HkmDashboardData;
  /** KESELURUHAN row of the presensi program's recap; null when unreadable. */
  teacher?: HitsRow | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rows = data.participants;

  const underperformers = useMemo<UnderRow[]>(
    () =>
      rows
        .filter((r) => r.mCategory !== "Tercapai")
        .map((r) => ({ ...r, gap: Math.max(0, Math.round(r.mTarget - r.mRealisasi)) }))
        .sort((a, b) => b.gap - a.gap),
    [rows],
  );

  const rekap = useMemo<RekapRow[]>(() => {
    const groups = new Map<string, HkmParticipantRow[]>();
    for (const r of rows) {
      const key = `${r.halaqah ?? "—"}||${r.gender}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
    }
    return [...groups.entries()]
      .map(([key, arr]) => {
        const [halaqah, gender] = key.split("||");
        return {
          halaqah,
          gender,
          count: arr.length,
          avgCapaian: arr.length ? round1(arr.reduce((s, r) => s + r.mCapaian, 0) / arr.length) : 0,
          tercapai: arr.filter((r) => r.mCategory === "Tercapai").length,
          underperform: arr.filter((r) => r.mCategory !== "Tercapai").length,
          khatam: arr.filter((r) => r.khatamCount >= 1).length,
        };
      })
      .sort((a, b) => a.halaqah.localeCompare(b.halaqah) || a.gender.localeCompare(b.gender));
  }, [rows]);

  const onTargetPct = data.monthlyKpis.total
    ? Math.round((100 * data.monthlyKpis.tercapai) / data.monthlyKpis.total)
    : 0;

  const under = useTableSort(underperformers, UNDER_SORT, { key: "gap", dir: "desc" });
  const rekapSorted = useTableSort(rekap, REKAP_SORT);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-20 font-bold tracking-[-0.01em]">Laporan Tilawah HKM</h1>
          <p className="mt-1 text-14 text-ink-muted">
            Rekap bulanan {monthLabel(data.month)} · target {data.monthTargetPages} hal/peserta.
          </p>
          {/* Definisi jendela bulan laporan: penting sekali, dibaca sekali. */}
          <details className="mt-1 text-12 text-ink-muted">
            <summary className="cursor-pointer font-medium">Rentang bulan laporan</summary>
            <p className="mt-1.5">
              {monthRangeLabel(data.month)} — bulan laporan berjalan dari tanggal 28 bulan
              sebelumnya sampai 27 bulan berjalan.
            </p>
          </details>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={data.month}
            onChange={(e) => router.push(`${pathname}?month=${e.target.value}`)}
            className="rounded-lg border border-neutral-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-neutral-700"
          >
            {data.monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/reports/${program}/hkm-monthly?month=${data.month}`}>Export xlsx</a>
          </Button>
          {/* Koordinator's sheet: setoran + presensi HKM in one workbook. */}
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/reports/${program}/hkm-bulanan-gabungan?month=${data.month}`}>
              Export xlsx · presensi + setoran
            </a>
          </Button>
        </div>
      </div>

      {/* Satu angka yang menentukan bulan ini, tiga angka ukuran, sisanya chip
          masalah — bukan enam kotak berbobot sama seperti sebelumnya. */}
      <KpiStrip
        hero={{
          label: `Rata² capaian ${monthLabel(data.month)}`,
          value: data.monthlyKpis.avgCapaian,
          unit: "%",
          target: 100,
        }}
        support={[
          {
            label: "Peserta",
            value: data.monthlyKpis.total,
            hint: `${onTargetPct}% on-target`,
          },
          { label: "Total halaman", value: data.monthlyKpis.totalPages },
          teacher && teacher.teacherIdeal > 0
            ? {
                label: "Kehadiran pengajar",
                value: `${(teacherPct(teacher.teacherReal, teacher.teacherIdeal) ?? 0).toFixed(2)}%`,
                hint: `${teacher.teacherReal} dari ${teacher.teacherIdeal} pertemuan`,
              }
            : {
                label: "Khatam kumulatif",
                value: data.kpis.sudahKhatam,
                hint: `${data.kpis.avgJuz} juz rata²`,
              },
        ]}
        issues={[{ label: "belum capai target", value: underperformers.length, tone: "warning" }]}
        allClearText="Aman — semua peserta mencapai target bulan ini"
      />

      {/* Underperformers */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-ink-muted">
          Belum capai target bulan ini ({underperformers.length}) — realisasi di bawah target
        </h2>
        {underperformers.length === 0 ? (
          <EmptyState
            tone="success"
            title="Semua peserta mencapai target"
            description="Peserta yang realisasinya di bawah target bulan ini akan muncul di sini, diurutkan dari yang kekurangannya paling besar."
          />
        ) : (
          <TableWrap maxHeight="70vh">
            <Table>
              <THead sticky>
                <TR>
                  <SortTH sortKey="nama" sort={under.sort} onSort={under.toggle}>Nama</SortTH>
                  <SortTH sortKey="halaqah" sort={under.sort} onSort={under.toggle}>Halaqah</SortTH>
                  <SortTH sortKey="realisasi" sort={under.sort} onSort={under.toggle} className="text-right">
                    Realisasi/Target
                  </SortTH>
                  <SortTH sortKey="gap" sort={under.sort} onSort={under.toggle} className="text-right">
                    Kurang
                  </SortTH>
                  <SortTH sortKey="capaian" sort={under.sort} onSort={under.toggle} className="text-right">
                    Capaian
                  </SortTH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody zebra>
                {under.rows.map((r) => (
                  <TR key={r.participantId}>
                    <TD className="font-medium">{r.nama}</TD>
                    <TD className="text-ink-muted">
                      {r.halaqah ?? "—"}
                      {r.pengajar && <span className="block text-xs text-ink-faint">{r.pengajar}</span>}
                    </TD>
                    <TD className="text-right tabular-nums">
                      <span className="text-warn">{r.mRealisasi}</span>
                      <span className="text-ink-faint"> / {r.mTarget}</span>
                    </TD>
                    <TD className="text-right font-medium tabular-nums text-danger">{r.gap}</TD>
                    <TD className="text-right tabular-nums">{r.mCapaian}%</TD>
                    <TD className="text-right">
                      {r.phone && (
                        <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer" className="text-ok hover:underline">
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

      {/* Rekap per halaqah × gender */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-ink-muted">Rekap per halaqah × jenis</h2>
        <TableWrap maxHeight="70vh">
          <Table>
            <THead sticky>
              <TR>
                <SortTH sortKey="halaqah" sort={rekapSorted.sort} onSort={rekapSorted.toggle}>Halaqah</SortTH>
                <SortTH sortKey="gender" sort={rekapSorted.sort} onSort={rekapSorted.toggle}>Jenis</SortTH>
                <SortTH sortKey="count" sort={rekapSorted.sort} onSort={rekapSorted.toggle} className="text-right">
                  Peserta
                </SortTH>
                <SortTH sortKey="avgCapaian" sort={rekapSorted.sort} onSort={rekapSorted.toggle} className="text-right">
                  Rata² capaian
                </SortTH>
                <SortTH sortKey="tercapai" sort={rekapSorted.sort} onSort={rekapSorted.toggle} className="text-right">
                  Tercapai
                </SortTH>
                <SortTH sortKey="underperform" sort={rekapSorted.sort} onSort={rekapSorted.toggle} className="text-right">
                  Belum tercapai
                </SortTH>
                <SortTH sortKey="khatam" sort={rekapSorted.sort} onSort={rekapSorted.toggle} className="text-right">
                  Khatam
                </SortTH>
              </TR>
            </THead>
            {/* Tujuh kolom: zebra menjaga baris tetap terbaca. */}
            <TBody zebra>
              {rekapSorted.rows.map((r, i) => (
                <TR key={i}>
                  <TD className="font-medium">{r.halaqah}</TD>
                  <TD className="text-ink-muted">{r.gender}</TD>
                  <TD className="text-right tabular-nums">{r.count}</TD>
                  <TD className="text-right tabular-nums">{r.avgCapaian}%</TD>
                  <TD className="text-right tabular-nums text-ok">{r.tercapai}</TD>
                  <TD className="text-right tabular-nums">
                    {r.underperform > 0 ? <span className="text-warn">{r.underperform}</span> : "0"}
                  </TD>
                  <TD className="text-right tabular-nums">{r.khatam}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </section>

      {/* Detail per peserta */}
      <HkmParticipants
        program={program}
        rows={rows}
        targetPages={data.target.targetPages}
        mode="bulanan"
        monthLabelText={monthLabel(data.month)}
      />
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
