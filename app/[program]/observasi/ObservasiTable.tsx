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
  filterBaris,
  FILTER_AWAL,
  kodeHint,
  kondisiTone,
  tabayyunTerbuka,
  tabayyunTone,
  tanggalDariStamp,
  tanggalPendek,
  type ObservasiBaris,
  type ObservasiFilter,
} from "./view-model";

/**
 * Konstanta level modul: peta ini jadi dependensi `useMemo` di `useTableSort`,
 * dan objek baru tiap render akan mengurutkan ulang seluruh tabel tanpa alasan.
 */
const ACCESSORS: SortAccessors<ObservasiBaris> = {
  tanggal: (r) => r.tanggal,
  halaqah: (r) => r.halaqahNama,
  pengajar: (r) => r.pengajarNama,
  pertemuan: (r) => r.pertemuanNo,
  kondisi: (r) => r.kondisi,
  latihan: (r) => r.statusLatihan,
  pelanggaran: (r) => r.pelanggaran.length,
  tabayyun: (r) => r.tabayyun.length,
  menit: (r) => r.menitHutang,
};

const TINDAK_LANJUT_OPSI = [
  { value: "semua" as const, label: "Semua baris" },
  { value: "hanya" as const, label: "Punya pelanggaran/tabayyun" },
];

/** Em dash — dipakai untuk "tidak ada", tidak pernah diganti angka 0. */
function Kosong() {
  return <span className="text-ink-faint">—</span>;
}

/** Kode enum apa adanya; tooltip hanya kalau kepanjangannya memang diketahui. */
function Kode({ kode }: { kode: string | null }) {
  if (!kode) return <Kosong />;
  const hint = kodeHint(kode);
  return <span title={hint ?? undefined}>{kode}</span>;
}

/**
 * Tabel catatan observasi harian. Penyaringan dan pengurutan murni di klien:
 * satu bulan satu program hanya ratusan baris, dan satu putaran ke server hanya
 * akan menarik payload yang sama persis.
 *
 * Tidak ada kolom persentase, rata-rata, atau peringkat di sini — layar ini
 * mencacah catatan mentah; angka disiplin resmi ada di tab Disiplin.
 */
export function ObservasiTable({
  rows,
  kondisiOpsi,
  program,
}: {
  rows: ObservasiBaris[];
  /** Nilai `kondisi` yang benar-benar muncul di data — termasuk yang belum dikenal. */
  kondisiOpsi: string[];
  program: string;
}) {
  const [filter, setFilter] = React.useState<ObservasiFilter>(FILTER_AWAL);
  const filtered = React.useMemo(() => filterBaris(rows, filter), [rows, filter]);
  const { rows: sorted, sort, toggle } = useTableSort(filtered, ACCESSORS);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            value={filter.kondisi}
            onChange={(kondisi) => setFilter((f) => ({ ...f, kondisi }))}
            options={[
              { value: "semua", label: "Semua kondisi" },
              ...kondisiOpsi.map((k) => ({ value: k, label: k })),
            ]}
          />
          <SegmentedControl
            size="sm"
            value={filter.hanyaTindakLanjut ? "hanya" : "semua"}
            onChange={(v) => setFilter((f) => ({ ...f, hanyaTindakLanjut: v === "hanya" }))}
            options={TINDAK_LANJUT_OPSI}
          />
        </div>
        <p className="text-12 text-ink-muted tabular-nums">
          {sorted.length} dari {rows.length} catatan
        </p>
      </div>

      {/* Kepala menempel: daftar tanggal tanpa kepala yang menetap tidak terbaca. */}
      <TableWrap maxHeight="70vh">
        <Table>
          <THead sticky>
            <TR>
              <SortTH sortKey="tanggal" sort={sort} onSort={toggle}>
                Tanggal
              </SortTH>
              <SortTH sortKey="halaqah" sort={sort} onSort={toggle}>
                Halaqah
              </SortTH>
              <SortTH sortKey="pengajar" sort={sort} onSort={toggle}>
                Pengajar
              </SortTH>
              <SortTH sortKey="pertemuan" sort={sort} onSort={toggle} className="text-right">
                Pertemuan
              </SortTH>
              <SortTH sortKey="kondisi" sort={sort} onSort={toggle}>
                Kondisi
              </SortTH>
              <SortTH sortKey="latihan" sort={sort} onSort={toggle}>
                Latihan
              </SortTH>
              <SortTH sortKey="pelanggaran" sort={sort} onSort={toggle}>
                Pelanggaran
              </SortTH>
              <SortTH sortKey="tabayyun" sort={sort} onSort={toggle}>
                Tabayyun
              </SortTH>
              <SortTH sortKey="menit" sort={sort} onSort={toggle} className="text-right">
                Hutang
              </SortTH>
            </TR>
            <TR>
              <TH className="pt-0 text-11 font-normal text-ink-faint" colSpan={6}>
                Catatan mentah ketua kelas, apa adanya.
              </TH>
              <TH className="pt-0 text-11 font-normal text-ink-faint" colSpan={2}>
                kode Maahir, tanpa kepanjangan yang dikarang
              </TH>
              <TH className="pt-0 text-right text-11 font-normal text-ink-faint">menit</TH>
            </TR>
          </THead>
          <TBody zebra>
            {sorted.length === 0 && (
              <TR>
                <TD colSpan={9} className="py-6 text-center text-14 text-ink-muted">
                  Tidak ada catatan pada saringan ini.
                </TD>
              </TR>
            )}
            {sorted.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap tabular-nums">{tanggalPendek(r.tanggal)}</TD>
                <TD className="font-medium">
                  {r.halaqahNama == null ? (
                    // Halaqah-nya tidak ada di cermin hits/halaqah — barisnya
                    // tetap tampil, idnya yang jadi penanda.
                    <span className="font-mono text-12 text-ink-faint" title={r.halaqahId}>
                      halaqah tak dikenal
                    </span>
                  ) : r.tilawahHalaqahId != null ? (
                    <Link
                      href={`/${program}/halaqah/${r.tilawahHalaqahId}`}
                      className="underline decoration-neutral-300 underline-offset-2 hover:decoration-current"
                    >
                      {r.halaqahNama}
                    </Link>
                  ) : (
                    // Nama tidak ketemu / bertabrakan di halaqah_sync: teks
                    // biasa, bukan tautan tebakan.
                    <span>{r.halaqahNama}</span>
                  )}
                  {r.level && <span className="ml-2 text-11 text-ink-faint">{r.level}</span>}
                </TD>
                <TD className="text-ink-muted">{r.pengajarNama ?? <Kosong />}</TD>
                <TD numeric>{r.pertemuanNo ?? <Kosong />}</TD>
                <TD>
                  {r.kondisi ? (
                    <Badge tone={kondisiTone(r.kondisi)} title={kodeHint(r.kondisi) ?? undefined}>
                      {r.kondisi}
                    </Badge>
                  ) : (
                    <Kosong />
                  )}
                </TD>
                {/* status_latihan null pada ~6% baris: em dash, tidak pernah 0. */}
                <TD className="text-12 text-ink-muted">
                  <Kode kode={r.statusLatihan} />
                </TD>
                <TD className="text-12">
                  {r.pelanggaran.length === 0 ? (
                    <Kosong />
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.pelanggaran.map((p) => (
                        <Badge
                          key={p.id}
                          tone="warning"
                          title={
                            [kodeHint(p.jenis), p.menit == null ? null : `${p.menit} menit`]
                              .filter(Boolean)
                              .join(" · ") || undefined
                          }
                        >
                          {p.jenis ?? "tanpa jenis"}
                          {p.menit != null && (
                            <span className="ml-1 tabular-nums">{p.menit}′</span>
                          )}
                        </Badge>
                      ))}
                    </span>
                  )}
                </TD>
                <TD className="text-12">
                  {r.tabayyun.length === 0 ? (
                    <Kosong />
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.tabayyun.map((t) => (
                        <Badge
                          key={t.id}
                          tone={tabayyunTone(t.status)}
                          title={[
                            t.kondisi ? `kondisi ${t.kondisi}` : null,
                            t.deadline_at ? `tenggat ${tanggalDariStamp(t.deadline_at)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        >
                          {t.status ?? "tanpa status"}
                          {tabayyunTerbuka(t) && t.deadline_at && (
                            <span className="ml-1 tabular-nums">
                              {tanggalDariStamp(t.deadline_at)}
                            </span>
                          )}
                        </Badge>
                      ))}
                    </span>
                  )}
                </TD>
                {/* Tidak ada baris bermenit → em dash. `0` di sini akan berarti
                    "hutangnya nol menit", dan itu klaim yang berbeda. */}
                <TD numeric>
                  {r.menitHutang == null ? (
                    <Kosong />
                  ) : (
                    <span className={r.menitHutang > 0 ? "text-warn" : undefined}>
                      {r.menitHutang}
                    </span>
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
