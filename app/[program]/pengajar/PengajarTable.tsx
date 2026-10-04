"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { PengajarRow } from "@/lib/directory/queries";
import { genderLabel } from "@/lib/programs/config";
import { normalizePhone } from "@/lib/wa";
import { PENGAJAR_FOKUS_LABEL, type PengajarFokus } from "./fokus";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

type SortKey =
  | "pengajar"
  | "batch"
  | "halaqahCount"
  | "studentCount"
  | "avgRate"
  | "recordedMeetings"
  | "dueTanpaPresensi";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "pengajar", label: "Pengajar", align: "left" },
  // Hanya tampil pada `?batch=semua` — lihat `columns` di bawah.
  { key: "batch", label: "Batch", align: "left" },
  { key: "halaqahCount", label: "Halaqah", align: "right" },
  { key: "studentCount", label: "Peserta", align: "right" },
  { key: "avgRate", label: "Rata² hadir", align: "right" },
  { key: "recordedMeetings", label: "Pertemuan terisi", align: "right" },
  { key: "dueTanpaPresensi", label: "Belum presensi", align: "right" },
];

function cmp(a: unknown, b: unknown): number {
  const an = a == null;
  const bn = b == null;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * `fokus` datang dari query param `?fokus=…`, dipakai chip KPI di kepala halaman
 * supaya angkanya menuju barisnya sendiri dan bukan jalan buntu. Sengaja prop,
 * bukan state: navigasi dari KPI me-render ulang halaman, jadi prop selalu ikut
 * sedangkan `useState` akan tertinggal basi.
 */
const FOKUS_LABEL = PENGAJAR_FOKUS_LABEL;

export function PengajarTable({
  program,
  rows,
  fokus,
  tanpaFokusHref,
  thresholdPct = 70,
}: {
  program: string;
  rows: PengajarRow[];
  fokus?: PengajarFokus;
  tanpaFokusHref?: string;
  /** Ambang kehadiran program — warna merah kolom rata² dan fokus "bawah-target". */
  thresholdPct?: number;
}) {
  const [q, setQ] = useState("");
  const [gender, setGender] = useState<"all" | "1" | "2">("all");
  const [sortKey, setSortKey] = useState<SortKey>("pengajar");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [open, setOpen] = useState<string | null>(null);

  // Kolom Batch cuma bermakna saat barisnya datang dari lebih dari satu batch.
  // Satu pengajar bisa muncul di dua batch, jadi kunci baris ikut slug programnya.
  const showBatch = rows.some((r) => r.batch);
  const columns = useMemo(
    () => (showBatch ? COLUMNS : COLUMNS.filter((c) => c.key !== "batch")),
    [showBatch],
  );
  const rowKey = (r: PengajarRow) => `${r.programSlug ?? program}|${r.pengajar}`;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (gender !== "all" && !r.genders.includes(Number(gender))) return false;
      if (fokus === "belum-presensi" && r.dueTanpaPresensi === 0) return false;
      if (fokus === "tanpa-wa" && r.phone) return false;
      if (fokus === "bawah-target" && !(r.avgRate != null && r.avgRate < thresholdPct)) {
        return false;
      }
      if (needle === "") return true;
      return (
        r.pengajar.toLowerCase().includes(needle) ||
        r.halaqah.some((h) => (h.name ?? "").toLowerCase().includes(needle))
      );
    });
    const sorted = [...base].sort((x, y) => cmp(x[sortKey], y[sortKey]));
    return dir === "asc" ? sorted : sorted.reverse();
  }, [rows, q, gender, sortKey, dir, fokus, thresholdPct]);

  const tanpaWa = filtered.filter((r) => !r.phone).length;

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(key === "pengajar" ? "asc" : "desc");
    }
  }

  return (
    <div id="daftar-pengajar" className="space-y-3 scroll-mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari pengajar atau halaqah…"
          className="w-full px-2 py-1.5 sm:w-72"
        />
        <SegmentedControl<"all" | "1" | "2">
          options={[
            { value: "all", label: "Semua" },
            { value: "1", label: "Ikhwan" },
            { value: "2", label: "Akhwat" },
          ]}
          value={gender}
          onChange={setGender}
        />
        {fokus && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-11 text-warn dark:border-amber-500/30 dark:bg-amber-500/10">
            {FOKUS_LABEL[fokus]}
            {tanpaFokusHref && (
              <Link href={tanpaFokusHref} className="font-medium hover:underline" title="Hapus saringan">
                ×
              </Link>
            )}
          </span>
        )}
        <span className="text-12 text-ink-muted">
          {filtered.length} pengajar
          {tanpaWa > 0 ? ` · ${tanpaWa} tanpa nomor WA` : ""} · klik baris untuk lihat halaqahnya
        </span>
      </div>

      <TableWrap maxHeight="70vh">
        <Table>
          <THead sticky>
            <TR>
              {columns.map((c) => (
                <TH
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`cursor-pointer select-none hover:text-primary ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="ml-1 text-primary">{dir === "asc" ? "▲" : "▼"}</span>
                  )}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {filtered.map((r) => {
              const wa = normalizePhone(r.phone);
              const key = rowKey(r);
              const expanded = open === key;
              return (
                <Fragment key={key}>
                  <TR
                    onClick={() => setOpen(expanded ? null : key)}
                    className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                  >
                    <TD className="font-medium">
                      <span className="mr-1 text-ink-faint">{expanded ? "▾" : "▸"}</span>
                      {r.pengajar}
                      {wa ? (
                        <a
                          href={`https://wa.me/${wa}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={r.phone ?? undefined}
                          className="ml-2 text-11 font-normal text-ok hover:underline"
                        >
                          WA
                        </a>
                      ) : (
                        // Dulu ini kalimat melayang di atas filter ("N pengajar
                        // belum punya nomor WA"); chip di barisnya menunjukkan
                        // pengajar yang mana tanpa menambah satu baris teks.
                        <span
                          title="Nomor WA belum tersinkron — tombol WA tidak aktif untuk pengajar ini."
                          className="ml-2 rounded border border-amber-300/70 px-1.5 py-0.5 text-11 font-normal text-warn dark:border-amber-500/30"
                        >
                          tanpa WA
                        </span>
                      )}
                      <div className="text-11 font-normal text-ink-muted">
                        {[
                          r.genders.map(genderLabel).join(" · "),
                          r.levels.join(" · "),
                        ]
                          .filter(Boolean)
                          .join(" — ") || "—"}
                      </div>
                    </TD>
                    {showBatch && <TD className="text-12 text-ink-muted">{r.batch ?? "—"}</TD>}
                    <TD className="text-right tabular-nums">{r.halaqahCount}</TD>
                    <TD className="text-right tabular-nums">{r.studentCount}</TD>
                    <TD className="text-right tabular-nums">
                      {r.avgRate != null ? (
                        <span className={r.avgRate < thresholdPct ? "font-semibold text-danger" : ""}>
                          {r.avgRate.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="text-right tabular-nums text-ink-muted">
                      {r.recordedMeetings}/{r.totalMeetings}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {r.dueTanpaPresensi > 0 ? (
                        <span className="font-medium text-warn">{r.dueTanpaPresensi}</span>
                      ) : (
                        "0"
                      )}
                    </TD>
                  </TR>
                  {expanded &&
                    r.halaqah.map((h) => (
                      <TR key={h.halaqahId} className="text-ink-muted">
                        <TD className="pl-10">
                          <Link
                            href={`/${r.programSlug ?? program}/halaqah/${h.halaqahId}`}
                            className="text-primary hover:underline"
                          >
                            {h.name ?? "-"}
                          </Link>
                          <div className="text-11 text-ink-muted">
                            {[h.level, h.jadwal].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </TD>
                        {showBatch && <TD />}
                        <TD />
                        <TD className="text-right tabular-nums">{h.studentCount}</TD>
                        <TD className="text-right tabular-nums">
                          {h.avgRate != null ? `${h.avgRate.toFixed(1)}%` : "—"}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {h.recordedMeetings}/{h.totalMeetings}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {h.dueTanpaPresensi > 0 ? (
                            <span className="text-warn">{h.dueTanpaPresensi}</span>
                          ) : (
                            "0"
                          )}
                        </TD>
                      </TR>
                    ))}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <TR>
                <TD colSpan={columns.length} className="px-3 py-6 text-center text-ink-muted">
                  Tidak ada pengajar untuk filter ini.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}
