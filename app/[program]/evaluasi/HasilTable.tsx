"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  SortTH,
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useTableSort,
  type SortAccessors,
} from "@/components/ui/table";
import { attendanceStatus } from "@/lib/ui/status";
import {
  filterHasil,
  formatTanggal,
  verdictOf,
  HASIL_FILTER,
  HASIL_FILTER_LABEL,
  type HasilBaris,
  type HasilFilter,
  type Verdict,
} from "@/lib/insights/evaluasi/view-model";

// Konstanta modul: peta ini masuk ke dependensi `useMemo` di dalam
// `useTableSort`, jadi objek baru tiap render akan mengurutkan ulang percuma.
const ACCESSORS: SortAccessors<HasilBaris> = {
  peserta: (r) => r.peserta,
  halaqah: (r) => r.halaqah,
  pengajar: (r) => r.pengajar,
  ujian: (r) => r.ujian,
  tanggal: (r) => r.tanggal,
  jaliy: (r) => r.lahnJaliy,
  khofiy: (r) => r.lahnKhofiy,
  hasil: (r) => verdictOf(r),
};

const VERDICT_BADGE: Record<Verdict, { label: string; tone: "success" | "danger" | "neutral" }> = {
  lulus: { label: "Lulus", tone: "success" },
  tidak: { label: "Tidak lulus", tone: "danger" },
  belum: { label: "Belum dinilai", tone: "neutral" },
};

/** Kehadiran pada pertemuan ujian — ikut ditampilkan karena verdict upstream
 *  memang bersandar padanya, jadi "tidak lulus" harus bisa ditelusuri. */
function StatusSel({ status }: { status: number | null }) {
  if (status == null) return <span className="text-11 text-ink-faint">tanpa presensi</span>;
  const s = attendanceStatus[status];
  if (!s) return <span className="text-12 text-ink-muted">kode {status}</span>;
  return <span className="text-12 text-ink-muted">{s.name}</span>;
}

/** Angka lahn; kosong ditulis sebagai "—" karena 0 kesalahan adalah nilai
 *  terbaik yang mungkin, dan menggambarnya sebagai 0 akan membalik artinya. */
function LahnSel({ value, tebal }: { value: number | null; tebal?: boolean }) {
  if (value == null) return <span className="text-ink-faint">—</span>;
  if (value === 0) return <span className="text-ok">0</span>;
  return <span className={tebal && value >= 5 ? "text-danger" : undefined}>{value}</span>;
}

/**
 * Tabel hasil ujian per peserta. Penyaringan dan pengurutan sepenuhnya di klien
 * — jumlah barisnya ratusan, bukan ribuan, dan satu putaran ke server hanya akan
 * menarik payload yang sama.
 */
export function HasilTable({
  rows,
  initialFilter = "semua",
}: {
  rows: HasilBaris[];
  initialFilter?: HasilFilter;
}) {
  const [filter, setFilter] = React.useState<HasilFilter>(initialFilter);
  const filtered = React.useMemo(() => filterHasil(rows, filter), [rows, filter]);
  const { rows: sorted, sort, toggle } = useTableSort(filtered, ACCESSORS, {
    key: "tanggal",
    dir: "desc",
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={filter}
          onChange={setFilter}
          options={HASIL_FILTER.map((f) => ({ value: f, label: HASIL_FILTER_LABEL[f] }))}
        />
        <p className="text-12 text-ink-muted">
          {sorted.length} dari {rows.length} baris
        </p>
      </div>

      {/* Kepala menempel butuh wadah bergulir vertikal untuk ditempeli — karena
          itu `maxHeight` dan `sticky` selalu berpasangan. */}
      <TableWrap maxHeight="70vh">
        <Table>
          <THead sticky>
            <TR>
              <SortTH sortKey="peserta" sort={sort} onSort={toggle}>
                Peserta
              </SortTH>
              <SortTH sortKey="halaqah" sort={sort} onSort={toggle}>
                Halaqah
              </SortTH>
              <SortTH sortKey="pengajar" sort={sort} onSort={toggle}>
                Pengajar
              </SortTH>
              <SortTH sortKey="ujian" sort={sort} onSort={toggle}>
                Ujian
              </SortTH>
              <SortTH sortKey="tanggal" sort={sort} onSort={toggle}>
                Tanggal
              </SortTH>
              <TH>Kehadiran</TH>
              <SortTH sortKey="jaliy" sort={sort} onSort={toggle} className="text-right">
                Lahn jaliy
              </SortTH>
              <SortTH sortKey="khofiy" sort={sort} onSort={toggle} className="text-right">
                Lahn khofiy
              </SortTH>
              <SortTH sortKey="hasil" sort={sort} onSort={toggle}>
                Hasil
              </SortTH>
            </TR>
            <TR>
              <TH className="pt-0 text-11 font-normal text-ink-faint" colSpan={6}>
                Satu baris = satu peserta pada satu pertemuan ujian.
              </TH>
              <TH className="pt-0 text-right text-11 font-normal text-ink-faint">
                kesalahan fatal
              </TH>
              <TH className="pt-0 text-right text-11 font-normal text-ink-faint">
                kesalahan halus
              </TH>
              <TH className="pt-0" />
            </TR>
          </THead>
          <TBody zebra>
            {sorted.length === 0 && (
              <TR>
                <TD colSpan={9} className="py-6 text-center text-14 text-ink-muted">
                  Tidak ada baris pada saringan ini.
                </TD>
              </TR>
            )}
            {sorted.map((r) => {
              const v = verdictOf(r);
              const badge = VERDICT_BADGE[v];
              return (
                <TR key={`${r.jadwalId}-${r.presensiId ?? r.halaqahUserId}`}>
                  <TD className="font-medium">
                    {r.peserta ?? (
                      <span
                        className="text-ink-faint"
                        title={`halaqah_user_id ${r.halaqahUserId ?? "?"} tidak ketemu di students_sync`}
                      >
                        (nama belum tersinkron)
                      </span>
                    )}
                    {r.userCode && <span className="ml-2 text-11 text-ink-faint">{r.userCode}</span>}
                  </TD>
                  <TD className="text-12 text-ink-muted">{r.halaqah ?? "—"}</TD>
                  <TD className="text-12 text-ink-muted">{r.pengajar ?? "—"}</TD>
                  <TD className="text-12">
                    {r.ujian ?? "—"}
                    {r.level && <span className="ml-2 text-11 text-ink-faint">{r.level}</span>}
                  </TD>
                  <TD className="text-12 text-ink-muted">{formatTanggal(r.tanggal)}</TD>
                  <TD>
                    <StatusSel status={r.status} />
                  </TD>
                  <TD numeric>
                    <LahnSel value={r.lahnJaliy} tebal />
                  </TD>
                  <TD numeric>
                    <LahnSel value={r.lahnKhofiy} />
                  </TD>
                  <TD>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}
