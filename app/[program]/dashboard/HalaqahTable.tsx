"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { HalaqahRow } from "@/lib/insights/halaqah";
import { genderLabel } from "@/lib/programs/config";
import { SegmentedControl } from "@/components/ui/segmented";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AttendanceHeatmap, AttendanceLegend } from "@/components/ui/attendance-heatmap";
import type { StatusTone } from "@/lib/ui/status";

/** Derive the health pill (Aman / Perhatian / Kritis) from a halaqah's rate. */
function condition(avgRate: number | null, threshold: number): { tone: StatusTone; label: string } {
  if (avgRate == null) return { tone: "neutral", label: "—" };
  if (avgRate < threshold) return { tone: "danger", label: "Kritis" };
  if (avgRate < threshold + 10) return { tone: "warning", label: "Perhatian" };
  return { tone: "success", label: "Aman" };
}

type SortKey =
  | "name"
  | "pengajar"
  | "level"
  | "gender"
  | "type"
  | "jadwal"
  | "studentCount"
  | "avgRate"
  | "recordedMeetings"
  | "dueTanpaPresensi"
  | "belowCount";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; num?: boolean }[] = [
  { key: "name", label: "Halaqah", align: "left" },
  { key: "pengajar", label: "Pengajar", align: "left" },
  { key: "level", label: "Level", align: "left" },
  { key: "gender", label: "Jenis", align: "left" },
  { key: "type", label: "Tipe", align: "left" },
  { key: "jadwal", label: "Jadwal", align: "left" },
  { key: "studentCount", label: "Peserta", align: "right", num: true },
  { key: "avgRate", label: "Rata² hadir", align: "right", num: true },
  { key: "recordedMeetings", label: "Pertemuan", align: "right", num: true },
  { key: "dueTanpaPresensi", label: "Belum presensi", align: "right", num: true },
  { key: "belowCount", label: "< ambang", align: "right", num: true },
];

const TYPE_LABEL: Record<string, string> = { offline: "Offline", online: "Online", hybrid: "Hybrid" };
/*
 * Earth-tone type pills (design 1c): Offline moss, Online slate, Hybrid ochre —
 * the same -100/-700 pairs as the status chips, so they read as one family.
 */
const TYPE_CLASS: Record<string, string> = {
  offline: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300",
  online: "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300",
  hybrid: "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300",
};

/** Indonesian decimal comma: 58,3 — matches the hero rate above the table. */
const PCT = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-ink-faint">—</span>;
  const cls = TYPE_CLASS[type] ?? "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
  return (
    <span className={`inline-block whitespace-nowrap rounded-[5px] px-1.5 py-0.5 text-11 font-semibold ${cls}`}>
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

function cmp(a: unknown, b: unknown): number {
  const an = a == null;
  const bn = b == null;
  if (an && bn) return 0;
  if (an) return 1; // nulls last
  if (bn) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Which slice of the table a KPI drill-down asked for (`?filter=`). */
export type HalaqahFocus = "belum" | "kritis" | null;

const FOCUS_LABEL: Record<"belum" | "kritis", string> = {
  belum: "halaqah dengan pertemuan belum dipresensi",
  kritis: "halaqah di bawah ambang",
};

export function HalaqahTable({
  program,
  rows,
  threshold = 70,
  focus = null,
  clearHref,
}: {
  program: string;
  rows: HalaqahRow[];
  threshold?: number;
  /**
   * Drill-down from the KPI strip. Read straight from the prop (not copied into
   * state) so a second click on the same link — a soft navigation that only
   * changes the query — still re-filters the table.
   */
  focus?: HalaqahFocus;
  /** Where "tampilkan semua" goes: this page without `?filter=`. */
  clearHref?: string;
}) {
  const [genderFilter, setGenderFilter] = useState<"all" | "1" | "2">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("avgRate");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // Only worth a filter when the program actually mixes offline/online/hybrid.
  const typeOptions = useMemo(
    () => [...new Set(rows.map((r) => r.type).filter((t): t is string => !!t))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let base = genderFilter === "all" ? rows : rows.filter((r) => String(r.gender) === genderFilter);
    if (typeFilter !== "all") base = base.filter((r) => r.type === typeFilter);
    if (focus === "belum") base = base.filter((r) => r.dueTanpaPresensi > 0);
    if (focus === "kritis") base = base.filter((r) => r.avgRate != null && r.avgRate < threshold);
    const sorted = [...base].sort((x, y) => cmp(x[sortKey], y[sortKey]));
    return dir === "asc" ? sorted : sorted.reverse();
  }, [rows, genderFilter, typeFilter, focus, threshold, sortKey, dir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(
          key === "name" || key === "pengajar" || key === "level" || key === "jadwal" || key === "type"
          ? "asc"
          : "desc",
      );
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<"all" | "1" | "2">
          options={[
            { value: "all", label: "Semua" },
            { value: "1", label: "Ikhwan" },
            { value: "2", label: "Akhwat" },
          ]}
          value={genderFilter}
          onChange={setGenderFilter}
        />
        {typeOptions.length > 1 && (
          <SegmentedControl<string>
            options={[
              { value: "all", label: "Semua tipe" },
              ...typeOptions.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t })),
            ]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        )}
        <span className="text-12 tabular-nums text-ink-muted">{filtered.length} halaqah</span>
        {focus && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border border-brand-bronze/50 bg-accent px-2.5 py-1 text-12 text-accent-foreground">
            Difilter: {FOCUS_LABEL[focus]}
            {focus === "kritis" && <> ({threshold}%)</>}
            {clearHref && (
              <Link href={clearHref} className="font-medium underline underline-offset-2">
                tampilkan semua
              </Link>
            )}
          </span>
        )}
      </div>

      {/* Capped height + sticky head: 128 rows scroll past the header otherwise,
          and a column of bare percentages means nothing without its name. */}
      <TableWrap maxHeight="70vh">
        <Table>
          <THead sticky>
            <TR>
              {COLUMNS.map((c) => (
                <TH
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`cap cursor-pointer select-none whitespace-nowrap text-[10px] font-bold hover:text-foreground ${
                    c.align === "right" ? "text-right" : "text-left"
                  } ${sortKey === c.key ? "text-foreground" : ""}`}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="ml-1 text-brand-bronze dark:text-brand-gold">{dir === "asc" ? "▲" : "▼"}</span>
                  )}
                </TH>
              ))}
              <TH className="cap whitespace-nowrap text-center text-[10px] font-bold">P1–P8</TH>
              <TH className="cap whitespace-nowrap text-[10px] font-bold">Kondisi</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((h) => (
              <TR
                key={`${h.programSlug ?? program}-${h.halaqahId}`}
                className="hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
              >
                <TD className="whitespace-nowrap font-semibold">
                  <Link
                    href={`/${h.programSlug ?? program}/halaqah/${h.halaqahId}`}
                    className="text-primary hover:underline"
                    /* Nama asli upstream disimpan di title: nama tampil lebih
                       mudah dibaca, tapi koordinator masih perlu menemukan
                       kelas yang sama di mabni. */
                    title={h.namaAsli && h.namaAsli !== h.name ? `In the boarding CMS: ${h.namaAsli}` : undefined}
                  >
                    {h.name ?? "-"}
                  </Link>
                  {h.batch && <div className="text-11 font-normal text-ink-muted">{h.batch}</div>}
                </TD>
                <TD className="whitespace-nowrap">{h.pengajar ?? "-"}</TD>
                <TD>{h.level ?? "-"}</TD>
                <TD>{genderLabel(h.gender)}</TD>
                <TD>
                  <TypeBadge type={h.type} />
                </TD>
                <TD className="whitespace-nowrap text-12 text-ink-muted">{h.jadwal ?? "—"}</TD>
                <TD className="text-right tabular-nums">{h.studentCount}</TD>
                <TD className="text-right tabular-nums">
                  {h.avgRate != null ? (
                    <span className={h.avgRate < threshold ? "font-bold text-red-600 dark:text-red-400" : ""}>
                      {PCT.format(h.avgRate)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="text-right tabular-nums text-ink-muted">
                  {h.recordedMeetings}/{h.totalMeetings}
                </TD>
                <TD className="text-right tabular-nums">
                  {h.dueTanpaPresensi > 0 ? (
                    <span className="font-bold text-amber-600 dark:text-amber-400">{h.dueTanpaPresensi}</span>
                  ) : (
                    "0"
                  )}
                </TD>
                <TD className="text-right tabular-nums">
                  {h.belowCount > 0 ? (
                    <span className="text-red-600 dark:text-red-400">{h.belowCount}</span>
                  ) : (
                    "0"
                  )}
                </TD>
                <TD className="text-center">
                  {h.meetings.length > 0 ? (
                    <AttendanceHeatmap cells={h.meetings} />
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </TD>
                <TD>
                  {(() => {
                    const c = condition(h.avgRate, threshold);
                    return (
                      <Badge tone={c.tone} className="cap whitespace-nowrap text-[9.5px] font-bold">
                        {c.label}
                      </Badge>
                    );
                  })()}
                </TD>
              </TR>
            ))}
            {filtered.length === 0 && (
              <TR>
                <TD colSpan={COLUMNS.length + 2} className="px-3 py-6 text-center text-ink-muted">
                  Tidak ada halaqah untuk filter ini.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </TableWrap>
      {/* Outside the scroll box: a footer that scrolls away is a footer nobody reads. */}
      <div className="cap flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-11 font-semibold text-ink-faint">
        <span className="tabular-nums">
          {filtered.length} / {rows.length} halaqah
        </span>
        <AttendanceLegend />
      </div>
    </div>
  );
}
