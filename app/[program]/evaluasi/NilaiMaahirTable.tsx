"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { SortTH, Table, TableWrap, TBody, TD, TH, THead, TR, useTableSort, type SortAccessors } from "@/components/ui/table";
import { hanyaDraft, JENIS_RAPOT_LABEL, type PesertaNilai, type SkorJenis } from "@/lib/insights/evaluasi/maahir-view-model";

type Saring = "semua" | "lulus" | "tidak" | "tanpa_rapot" | "draft";

const SARING: { value: Saring; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "lulus", label: "Rapot lulus" },
  { value: "tidak", label: "Rapot tidak lulus" },
  { value: "tanpa_rapot", label: "Belum ada rapot" },
  { value: "draft", label: "Hanya draft" },
];

function cocok(p: PesertaNilai, s: Saring): boolean {
  if (s === "semua") return true;
  if (s === "tanpa_rapot") return p.rapot.length === 0;
  if (s === "draft") return hanyaDraft(p);
  if (s === "tidak") return p.rapot.some((r) => r.lulus === false);
  return p.rapot.length > 0 && p.rapot.every((r) => r.lulus === true);
}

const ACCESSORS: SortAccessors<PesertaNilai> = {
  peserta: (r) => r.nama,
  halaqah: (r) => r.halaqah,
  qn: (r) => r.qn.rata,
  pb: (r) => r.pb.rata,
  ujian: (r) => r.ujian.terakhir,
  absen: (r) => r.tidakHadir,
  periode: (r) => r.sesiDiPeriode,
};

/**
 * Skor 0–100 dari Maahir: makin besar makin baik (kebalikan dari hitungan lahn).
 * Angka yang ikut memakai sesi draft diberi tanda `*` — masih bisa diubah pengajar.
 */
function Skor({ s }: { s: SkorJenis }) {
  if (s.sesi === 0 || s.rata == null) return <span className="text-ink-faint">—</span>;
  return (
    <span title={`${s.sesi} sesi${s.draft ? ` (${s.draft} masih draft)` : ""} · terakhir ${s.terakhir ?? "—"}`}>
      <span className={s.rata < 65 ? "text-danger" : undefined}>{s.rata.toLocaleString("id-ID")}</span>
      {s.draft > 0 && <span className="text-warn">*</span>}
      <span className="ml-1 text-11 text-ink-faint">×{s.sesi}</span>
    </span>
  );
}

export function NilaiMaahirTable({
  rows,
  kodePeserta,
  tampilPeriode = false,
}: {
  rows: PesertaNilai[];
  kodePeserta: Record<number, string>;
  /** Laporan bulanan: kolom "Sesi di periode" (nilai pada sesi yang dibuat di rentang laporan). */
  tampilPeriode?: boolean;
}) {
  const [saring, setSaring] = React.useState<Saring>("semua");
  const [cari, setCari] = React.useState("");
  const filtered = React.useMemo(() => {
    const q = cari.trim().toLowerCase();
    return rows.filter((r) => cocok(r, saring) && (!q || (r.nama ?? "").toLowerCase().includes(q) || (r.halaqah ?? "").toLowerCase().includes(q)));
  }, [rows, saring, cari]);
  const { rows: sorted, sort, toggle } = useTableSort(filtered, ACCESSORS, { key: "halaqah", dir: "asc" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl size="sm" value={saring} onChange={setSaring} options={SARING} />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama / halaqah"
            className="h-8 w-full rounded-md border border-neutral-300 bg-transparent px-2 text-12 sm:w-56 dark:border-neutral-700"
          />
        </div>
        <p className="text-12 text-ink-muted">
          {sorted.length} dari {rows.length} peserta · <span className="text-warn">*</span> memuat sesi draft
        </p>
      </div>
      <TableWrap maxHeight="70vh">
        <Table>
          <THead sticky>
            <TR>
              <SortTH sortKey="peserta" sort={sort} onSort={toggle}>Peserta</SortTH>
              <SortTH sortKey="halaqah" sort={sort} onSort={toggle}>Halaqah</SortTH>
              <SortTH sortKey="qn" sort={sort} onSort={toggle} className="text-right">Rata² QN</SortTH>
              <SortTH sortKey="pb" sort={sort} onSort={toggle} className="text-right">Rata² PB</SortTH>
              <SortTH sortKey="ujian" sort={sort} onSort={toggle} className="text-right">Ujian terakhir</SortTH>
              {tampilPeriode && <SortTH sortKey="periode" sort={sort} onSort={toggle} className="text-right">Sesi di periode</SortTH>}
              <SortTH sortKey="absen" sort={sort} onSort={toggle} className="text-right">Tak hadir</SortTH>
              <TH>Rapot</TH>
            </TR>
          </THead>
          <TBody zebra>
            {sorted.length === 0 && (
              <TR>
                <TD colSpan={tampilPeriode ? 8 : 7} className="py-6 text-center text-14 text-ink-muted">Tidak ada peserta pada saringan ini.</TD>
              </TR>
            )}
            {sorted.map((r) => {
              const kode = r.tilawahUserId != null ? kodePeserta[r.tilawahUserId] : undefined;
              return (
                <TR key={r.pesertaId}>
                  <TD className="font-medium">
                    {r.nama ?? <span className="text-ink-faint">({r.pesertaId})</span>}
                    {kode && <span className="ml-2 text-11 text-ink-faint">{kode}</span>}
                  </TD>
                  <TD className="text-12 text-ink-muted">
                    {r.halaqah ?? "—"}
                    {r.pengajar && <div className="text-11 text-ink-faint">{r.pengajar}</div>}
                  </TD>
                  <TD numeric><Skor s={r.qn} /></TD>
                  <TD numeric><Skor s={r.pb} /></TD>
                  <TD numeric>
                    {r.ujian.terakhir == null ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      <>
                        <span className={r.ujian.terakhir < 65 ? "text-danger" : undefined}>{r.ujian.terakhir}</span>
                        {r.ujian.draft > 0 && <span className="text-warn">*</span>}
                      </>
                    )}
                  </TD>
                  {tampilPeriode && <TD numeric>{r.sesiDiPeriode || <span className="text-ink-faint">0</span>}</TD>}
                  <TD numeric>{r.tidakHadir ? <span className="text-ink-muted">{r.tidakHadir}</span> : <span className="text-ink-faint">0</span>}</TD>
                  <TD>
                    {r.rapot.length === 0 ? (
                      <span className="text-11 text-ink-faint">belum terbit</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.rapot.map((x) => (
                          <Badge key={x.jenis} tone={x.lulus === true ? "success" : x.lulus === false ? "danger" : "neutral"}>
                            {JENIS_RAPOT_LABEL[x.jenis] ?? x.jenis} {x.nilaiAkhir ?? "—"}
                          </Badge>
                        ))}
                      </div>
                    )}
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
