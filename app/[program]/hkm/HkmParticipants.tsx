"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SegmentedControl } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/ui/empty-state";
import type { StatusTone } from "@/lib/ui/status";
import { HKM_STATUS_LABEL } from "@/lib/insights/hkm/status";
import type { HkmParticipantRow, HkmMode } from "./queries";

const CATEGORY_TONE: Record<string, StatusTone> = {
  "Khatam 3x+": "indigo",
  "Khatam 2x": "indigo",
  "Khatam 1x": "teal",
  "Sudah Mencapai Target": "success",
  "Belum Mencapai Target": "warning",
  "Belum Sama Sekali": "danger",
  Tercapai: "success",
  "Belum Tercapai": "warning",
  "Tidak Aktif": "danger",
};

type GenderFilter = "all" | "Ikhwan" | "Akhwat";

// Module-level: useTableSort memoises on this object's identity.
const BULANAN_SORT: SortAccessors<HkmParticipantRow> = {
  nama: (r) => r.nama,
  halaqah: (r) => r.halaqah,
  realisasi: (r) => r.mRealisasi,
  capaian: (r) => r.mCapaian,
  hariAktif: (r) => r.mActiveDays,
  kategori: (r) => r.mCategory,
};

const KUMULATIF_SORT: SortAccessors<HkmParticipantRow> = {
  nama: (r) => r.nama,
  halaqah: (r) => r.halaqah,
  mulai: (r) => r.firstDate,
  avgPerDay: (r) => r.avgPerDay,
  juz: (r) => r.cumulativeJuz,
  realisasi: (r) => r.cumulativePages,
  streak: (r) => r.streakDays,
  kategori: (r) => r.category,
};

/**
 * Cuti peserta stay in the table (they are still enrolled) but carry a badge so
 * a low number reads as "sedang cuti", not as "lalai". Aktif needs no badge.
 */
function StatusChip({ row }: { row: HkmParticipantRow }) {
  if (row.status === "aktif") return null;
  return (
    <Badge tone="neutral" className="ml-1.5" title={row.statusNote ?? undefined}>
      {HKM_STATUS_LABEL[row.status]}
    </Badge>
  );
}

export function HkmParticipants({
  program,
  rows,
  targetPages,
  mode,
  monthLabelText,
}: {
  program: string;
  rows: HkmParticipantRow[];
  targetPages: number;
  mode: HkmMode;
  monthLabelText: string;
}) {
  const [gender, setGender] = useState<GenderFilter>("all");
  const [category, setCategory] = useState<string>("all");
  const [q, setQ] = useState("");

  const catOf = (r: HkmParticipantRow) => (mode === "bulanan" ? r.mCategory : r.category);

  const categories = useMemo(() => {
    const set = new Set(rows.map(catOf));
    return ["all", ...Array.from(set)];
  }, [rows, mode]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (gender === "all" || r.gender === gender) &&
        (category === "all" || catOf(r) === category) &&
        (needle === "" || r.nama.toLowerCase().includes(needle) || (r.halaqah ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, gender, category, q, mode]);

  // One hook per table shape: the two modes sort on different columns, and a
  // shared sort state would keep a key the other table cannot resolve.
  const bulanan = useTableSort(filtered, BULANAN_SORT);
  const kumulatif = useTableSort(filtered, KUMULATIF_SORT);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink-muted">
          Daftar peserta ({filtered.length}/{rows.length})
          {mode === "bulanan" && <span className="text-ink-faint"> · {monthLabelText}</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            value={gender}
            onChange={(v) => setGender(v as GenderFilter)}
            options={[
              { value: "all", label: "Semua" },
              { value: "Ikhwan", label: "Ikhwan" },
              { value: "Akhwat", label: "Akhwat" },
            ]}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-transparent px-2.5 py-1 text-xs dark:border-neutral-700"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Semua kategori" : c}
              </option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama/halaqah…"
            className="rounded-lg border border-neutral-300 bg-transparent px-2.5 py-1 text-xs dark:border-neutral-700"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Tidak ada peserta yang cocok"
          description="Longgarkan saringan gender, kategori, atau kata kunci — atau jalankan sync kalau rosternya memang belum masuk."
        />
      ) : mode === "bulanan" ? (
        <TableWrap maxHeight="70vh">
          <Table>
            <THead sticky>
              <TR>
                <SortTH sortKey="nama" sort={bulanan.sort} onSort={bulanan.toggle}>Nama</SortTH>
                <SortTH sortKey="halaqah" sort={bulanan.sort} onSort={bulanan.toggle}>Halaqah</SortTH>
                <SortTH sortKey="realisasi" sort={bulanan.sort} onSort={bulanan.toggle} className="text-right">
                  Realisasi/Target
                </SortTH>
                <SortTH sortKey="capaian" sort={bulanan.sort} onSort={bulanan.toggle} className="text-right">
                  Capaian
                </SortTH>
                <SortTH sortKey="hariAktif" sort={bulanan.sort} onSort={bulanan.toggle} className="text-right">
                  Hari aktif
                </SortTH>
                <SortTH sortKey="kategori" sort={bulanan.sort} onSort={bulanan.toggle}>Kategori</SortTH>
              </TR>
            </THead>
            {/* Enam sampai delapan kolom: zebra menahan mata di barisnya. */}
            <TBody zebra>
              {bulanan.rows.map((r) => (
                <TR key={r.participantId}>
                  <TD className="font-medium">
                    <Link href={`/${program}/hkm/${r.participantId}`} className="hover:underline">
                      {r.nama}
                    </Link>
                    <StatusChip row={r} />
                  </TD>
                  <TD className="text-ink-muted">
                    {r.halaqah ?? "—"}
                    {r.pengajar && <span className="block text-xs text-ink-faint">{r.pengajar}</span>}
                  </TD>
                  <TD className="text-right tabular-nums">
                    <span className={r.mRealisasi >= r.mTarget ? "text-ok" : "text-warn"}>
                      {r.mRealisasi}
                    </span>
                    <span className="text-ink-faint"> / {r.mTarget}</span>
                  </TD>
                  <TD className="text-right font-medium tabular-nums">
                    <span className={r.mCapaian >= 100 ? "text-ok" : r.mCapaian > 0 ? "text-warn" : "text-danger"}>
                      {r.mCapaian}%
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums">{r.mActiveDays}</TD>
                  <TD>
                    <Badge tone={CATEGORY_TONE[r.mCategory]}>{r.mCategory}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      ) : (
        <TableWrap maxHeight="70vh">
          <Table>
            <THead sticky>
              <TR>
                <SortTH sortKey="nama" sort={kumulatif.sort} onSort={kumulatif.toggle}>Nama</SortTH>
                <SortTH sortKey="halaqah" sort={kumulatif.sort} onSort={kumulatif.toggle}>Halaqah</SortTH>
                <SortTH sortKey="mulai" sort={kumulatif.sort} onSort={kumulatif.toggle} className="text-right">
                  Mulai
                </SortTH>
                <SortTH sortKey="avgPerDay" sort={kumulatif.sort} onSort={kumulatif.toggle} className="text-right">
                  Rata²/hari
                </SortTH>
                <SortTH sortKey="juz" sort={kumulatif.sort} onSort={kumulatif.toggle} className="text-right">
                  Juz
                </SortTH>
                <SortTH sortKey="realisasi" sort={kumulatif.sort} onSort={kumulatif.toggle} className="text-right">
                  Realisasi/Target
                </SortTH>
                <SortTH sortKey="streak" sort={kumulatif.sort} onSort={kumulatif.toggle} className="text-right">
                  Streak
                </SortTH>
                <SortTH sortKey="kategori" sort={kumulatif.sort} onSort={kumulatif.toggle}>Kategori</SortTH>
              </TR>
            </THead>
            {/* Enam sampai delapan kolom: zebra menahan mata di barisnya. */}
            <TBody zebra>
              {kumulatif.rows.map((r) => (
                <TR key={r.participantId}>
                  <TD className="font-medium">
                    <Link href={`/${program}/hkm/${r.participantId}`} className="hover:underline">
                      {r.nama}
                    </Link>
                    {!r.matched && <span className="ml-1 text-xs text-amber-500" title="email master tidak cocok dengan user internal">⚠</span>}
                    <StatusChip row={r} />
                  </TD>
                  <TD className="text-ink-muted">
                    {r.halaqah ?? "—"}
                    {r.pengajar && <span className="block text-xs text-ink-faint">{r.pengajar}</span>}
                  </TD>
                  <TD className="text-right text-ink-muted tabular-nums">{r.firstDate ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{r.avgPerDay}</TD>
                  <TD className="text-right font-medium tabular-nums">{r.cumulativeJuz}</TD>
                  <TD className="text-right tabular-nums">
                    <span className={r.cumulativePages >= targetPages ? "text-ok" : "text-warn"}>
                      {r.cumulativePages}
                    </span>
                    <span className="text-ink-faint"> / {r.targetPages}</span>
                  </TD>
                  <TD className="text-right tabular-nums">{r.streakDays > 0 ? `🔥 ${r.streakDays}` : "—"}</TD>
                  <TD>
                    <Badge tone={CATEGORY_TONE[r.category]}>{r.category}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </section>
  );
}
