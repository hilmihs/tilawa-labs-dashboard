"use client";

import * as React from "react";
import Link from "next/link";
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
import {
  filterSpRows,
  formatTanggal,
  SP_FILTER_LABEL,
  type SpBaris,
  type SpFilter,
} from "./view-model";

// Konstanta level modul: peta ini jadi dependensi `useMemo` di useTableSort —
// objek baru tiap render akan mengurutkan ulang seluruh tabel tanpa alasan.
const ACCESSORS: SortAccessors<SpBaris> = {
  name: (r) => r.name,
  kelas: (r) => r.kelasName,
  hadir: (r) => r.hadir,
  terlambat: (r) => r.terlambat,
  izin: (r) => r.izin,
  sakit: (r) => r.sakit,
  alpa: (r) => r.alpa,
  sp: (r) => r.sp,
  spKotor: (r) => r.spKotor,
  pemutihan: (r) => r.pemutihan,
};

const FILTERS: SpFilter[] = ["semua", "sp3", "sp2", "sp1", "diputihkan"];

function spTone(level: number) {
  return level >= 3 ? "danger" : level === 2 ? "warning" : level === 1 ? "info" : "success";
}

/**
 * Tabel SP kumulatif. Penyaringan dan pengurutan murni di klien: 82 baris, dan
 * satu putaran ke server hanya akan menarik payload yang sama persis.
 *
 * Dua kolom SP sengaja berdampingan — `sp` (sesudah pemutihan, yang berlaku)
 * dan `spKotor` (sebelum pemutihan, riwayatnya). Baris yang pernah diputihkan
 * diberi latar dan badge sendiri supaya tidak terbaca sebagai orang yang
 * SP-nya turun begitu saja.
 */
export function SpTable({ rows, program }: { rows: SpBaris[]; program: string }) {
  const [filter, setFilter] = React.useState<SpFilter>("semua");
  const filtered = React.useMemo(() => filterSpRows(rows, filter), [rows, filter]);
  const { rows: sorted, sort, toggle } = useTableSort(filtered, ACCESSORS);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ value: f, label: SP_FILTER_LABEL[f] }))}
        />
        <p className="text-12 text-ink-muted">
          {sorted.length} dari {rows.length} baris
        </p>
      </div>

      {/* Kepala menempel: 82 baris nama tanpa kepala yang menetap tidak terbaca.
          `maxHeight` yang memberi `sticky` sesuatu untuk ditempeli. */}
      <TableWrap maxHeight="70vh">
        <Table>
          <THead sticky>
            <TR>
              <SortTH sortKey="name" sort={sort} onSort={toggle}>
                Nama
              </SortTH>
              <SortTH sortKey="kelas" sort={sort} onSort={toggle}>
                Kelas
              </SortTH>
              <SortTH sortKey="hadir" sort={sort} onSort={toggle} className="text-right">
                H
              </SortTH>
              <SortTH sortKey="terlambat" sort={sort} onSort={toggle} className="text-right">
                T
              </SortTH>
              <SortTH sortKey="izin" sort={sort} onSort={toggle} className="text-right">
                I
              </SortTH>
              <SortTH sortKey="sakit" sort={sort} onSort={toggle} className="text-right">
                S
              </SortTH>
              <SortTH sortKey="alpa" sort={sort} onSort={toggle} className="text-right">
                A
              </SortTH>
              <SortTH sortKey="sp" sort={sort} onSort={toggle} className="text-right">
                SP berlaku
              </SortTH>
              <SortTH sortKey="spKotor" sort={sort} onSort={toggle} className="text-right">
                SP kotor
              </SortTH>
              <TH>Penetapan terakhir</TH>
              <SortTH sortKey="pemutihan" sort={sort} onSort={toggle} className="text-right">
                Pemutihan
              </SortTH>
            </TR>
            <TR>
              <TH className="pt-0 text-11 font-normal text-ink-faint" colSpan={7}>
                Hitungan kumulatif sejak awal program.
              </TH>
              <TH className="pt-0 text-right text-11 font-normal text-ink-faint">
                sesudah pemutihan
              </TH>
              <TH className="pt-0 text-right text-11 font-normal text-ink-faint">
                sebelum pemutihan
              </TH>
              <TH className="pt-0" colSpan={2} />
            </TR>
          </THead>
          <TBody zebra>
            {sorted.length === 0 && (
              <TR>
                <TD colSpan={11} className="py-6 text-center text-14 text-ink-muted">
                  Tidak ada baris pada saringan ini.
                </TD>
              </TR>
            )}
            {sorted.map((r) => (
              <TR
                key={r.anggotaId}
                className={
                  r.pemutihan > 0 ? "bg-emerald-50/60 dark:bg-emerald-950/20" : undefined
                }
              >
                <TD className="font-medium">
                  <Link
                    href={`/${program}/peserta/${encodeURIComponent(r.anggotaId)}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {r.name}
                  </Link>
                  {r.pemutihan > 0 && (
                    <Badge tone="success" className="ml-2">
                      diputihkan
                    </Badge>
                  )}
                </TD>
                <TD className="text-ink-muted">{r.kelasName}</TD>
                <TD numeric>{r.hadir}</TD>
                <TD numeric>{r.terlambat}</TD>
                <TD numeric>{r.izin}</TD>
                <TD numeric>{r.sakit}</TD>
                <TD numeric>
                  {r.alpa > 0 ? <span className="text-danger">{r.alpa}</span> : r.alpa}
                </TD>
                <TD className="text-right">
                  <Badge tone={spTone(r.sp)}>{r.sp === 0 ? "bersih" : `SP ${r.sp}`}</Badge>
                </TD>
                <TD numeric className="font-mono text-ink-muted">
                  {r.turunKarenaPemutihan ? (
                    <span className="line-through decoration-neutral-400">{r.spKotor}</span>
                  ) : (
                    r.spKotor
                  )}
                </TD>
                <TD className="text-12 text-ink-muted">
                  {r.penetapanTerakhir ? (
                    <span
                      title={r.penetapan
                        .map((p) => `SP ${p.level} · ${formatTanggal(p.tanggal)} · ${p.pemicu}`)
                        .join("\n")}
                    >
                      SP {r.penetapanTerakhir.level} · {formatTanggal(r.penetapanTerakhir.tanggal)}
                      <span className="text-ink-faint"> · {r.penetapanTerakhir.pemicu}</span>
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </TD>
                <TD numeric>
                  {r.pemutihan > 0 ? (
                    <span
                      title={r.diputihkan
                        .map((p) => `${p.month} · ${p.alasan} (${p.oleh})`)
                        .join("\n")}
                    >
                      {r.pemutihan}×
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}
