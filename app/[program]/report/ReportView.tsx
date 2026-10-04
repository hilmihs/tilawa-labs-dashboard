"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarRange,
  Download,
  SearchX,
  Users,
} from "lucide-react";
import {
  fetchParticipantReport,
  fetchTeacherReport,
  fetchHitsMonthlyReport,
  fetchExitedParticipants,
  forceFillMeeting,
  setCorrectionHandled,
  type ForceFillOutcome,
} from "./actions";
import type {
  ParticipantReport,
  ParticipantSegment,
  TeacherReport,
  TeacherRow,
  TeacherConfirmation,
  TeacherHalaqah,
  TeacherMeeting,
  HitsMonthlyReport,
  HitsBlock,
  HitsRow,
  ExitedParticipant,
  GuruCheckinBlock,
  GuruCheckinSegment,
} from "@/lib/reports/queries";
import type { BatchOption } from "@/lib/reports/scope";
import { HasilUjianTab } from "./HasilUjianTab";
import { KBA_SLUGS } from "@/lib/reports/kba-blocks";
import { teacherPct } from "@/lib/reports/teacher-attendance";
import type { ReportFormat } from "@/lib/programs/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { toneBadgeClass, type StatusTone } from "@/lib/ui/status";
import { waLink } from "@/lib/wa";

/** WA reminder for a halaqah's still-unconfirmed (belum) meetings, or null. */
function reminderWaLink(
  pengajar: string,
  halaqah: string,
  meetings: TeacherMeeting[],
  phone: string | null,
): string | null {
  const belum = meetings.filter((m) => !m.done && m.confStatus == null);
  if (belum.length === 0) return null;
  const list = belum.map((m) => `- Pertemuan ${m.order ?? "?"} (${fmtDate(m.date)})`).join("\n");
  const msg =
    `Assalamu'alaikum Ustadz/ah ${pengajar}, presensi halaqah ${halaqah} belum lengkap.\n\n` +
    `Pertemuan yang belum diisi:\n${list}\n\n` +
    `Mohon dilengkapi di cms.tilawalabs.demo. Jazaakumullahu khairan.`;
  return waLink(phone, msg);
}

const GENDER = (g: number | null) => (g === 1 ? "Ikhwan" : g === 2 ? "Akhwat" : "-");
const shortLvl = (l: string | null) =>
  !l ? "-" : /dasar/i.test(l) ? "Dasar" : /lanjutan/i.test(l) ? "Lanjutan" : l.replace(/^HITS\s+/i, "");
const TIPE = (t: string | null) =>
  t === "offline" ? "Offline" : t === "online" ? "Online" : t === "hybrid" ? "Hybrid" : "(tanpa tipe)";
/**
 * A null `jenis` is NOT a third cadence. The recap left-joins halaqah_sync, so
 * null is what a peserta with `students_sync.halaqah_id IS NULL` yields: no
 * halaqah means no kelas to read `jenis_pertemuan` (nor gender, nor level) from.
 * Verified on mabni — every null-jenis row is exactly an unplaced peserta. It is
 * a data-hygiene item for a coordinator to clear, so it must never be titled
 * like a cohort ("(tanpa jenis pertemuan)" read as one, and got asked about).
 */
const UNPLACED_LABEL = "Belum ditempatkan di halaqah";
/** Why the pengajar/check-in rows are dashes in that block, in one line. */
const UNPLACED_NOTE =
  "Tanpa halaqah tidak ada pertemuan terjadwal, jadi kehadiran pengajar, hari efektif, terlambat dan alpa tidak bisa dihitung — bukan nol, memang tidak ada.";
/** Meeting cadence, as the coordinators say it. Mabni-only; null elsewhere. */
const JENIS = (j: string | null) =>
  j === "yaumi" ? "Yaumi (harian)" : j === "usbui" ? "Usbu'iy (pekanan)" : UNPLACED_LABEL;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

const REASON_LABEL: Record<string, string> = {
  izin: "Izin",
  sakit: "Sakit",
  badal: "Digantikan badal",
  libur: "Libur",
  kegiatan: "Kegiatan lain",
  lainnya: "Lainnya",
};
function reasonLabel(code: string | null, text: string | null): string {
  const base = code ? (REASON_LABEL[code] ?? code) : "-";
  return text ? `${base} — ${text}` : base;
}

function DateRange({
  start,
  end,
  setStart,
  setEnd,
}: {
  start: string;
  end: string;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="date"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="w-auto px-2 py-1.5"
      />
      <ArrowRight className="size-4 text-neutral-400" />
      <Input
        type="date"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="w-auto px-2 py-1.5"
      />
    </div>
  );
}

/**
 * Bordered block standing in for the report itself.
 *
 * Before this, a tab that had never been run was ~70% empty black: no frame, no
 * copy, no hint that a button had to be pressed. The block is deliberately tall
 * (min-h) so it OCCUPIES the space the tables will take rather than floating in
 * the void, and the primary action is repeated inside it — the whole point is
 * that the next step is obvious without hunting back up to the toolbar.
 */
function ReportPlaceholder({
  icon,
  title,
  description,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  /** Secondary line: what the table will contain, or how to widen the search. */
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 px-6 py-12 text-center dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-neutral-300 text-ink-faint dark:border-neutral-700">
        {icon}
      </div>
      <div className="text-14 font-semibold text-foreground">{title}</div>
      <p className="mt-1.5 max-w-md text-14 text-ink-muted">{description}</p>
      {hint && <p className="mt-2 max-w-lg text-12 text-ink-faint">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type ShownRange = { start: string; end: string };

/**
 * Toolbar footnote: which range is on screen, and whether the pickers have since
 * moved away from it. Without this the tab silently shows September while the
 * inputs read October.
 */
function RangeStatus({ shown, stale }: { shown: ShownRange | null; stale: boolean }) {
  if (!shown) return null;
  const range = `${fmtDate(shown.start)} – ${fmtDate(shown.end)}`;
  return (
    <p
      className={`text-12 ${stale ? "text-warn" : "text-ink-muted"}`}
      aria-live="polite"
    >
      {stale
        ? `Rentang diubah — tekan Tampilkan untuk memperbarui. Yang tampil: ${range}.`
        : `Menampilkan ${range}.`}
    </p>
  );
}

/** One skeleton cell, sized to the 20px line box of a real `TD` so the swap to
 * the loaded table shifts nothing. */
function SkelBar({ className }: { className?: string }) {
  return <Skeleton className={`my-0.5 h-4 ${className ?? ""}`} />;
}

/**
 * Table-shaped loading state: same TableWrap frame, same header strip, same cell
 * padding as the report it stands in for, so the page does not jump when the
 * server action returns.
 */
function TableSkeleton({
  cols,
  rows = 8,
  label,
}: {
  cols: number;
  rows?: number;
  label: string;
}) {
  const idx = (n: number) => Array.from({ length: n }, (_, i) => i);
  return (
    <TableWrap role="status" aria-label={label} aria-busy="true">
      <Table>
        <THead>
          <TR>
            {idx(cols).map((c) => (
              <TH key={c}>
                <SkelBar className={c === 0 ? "w-40" : "ml-auto w-16"} />
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {idx(rows).map((r) => (
            <TR key={r}>
              {idx(cols).map((c) => (
                <TD key={c}>
                  <SkelBar
                    className={c === 0 ? (r % 3 === 0 ? "w-56" : "w-44") : "ml-auto w-12"}
                  />
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
      <span className="sr-only">{label}</span>
    </TableWrap>
  );
}

/** Filter each teacher's halaqah to one gender and recompute their subtotals.
 * Split at halaqah granularity so a badal spanning both genders shows in each. */
function teachersForGender(teachers: TeacherRow[], g: number | null): TeacherRow[] {
  const out: TeacherRow[] = [];
  for (const t of teachers) {
    const halaqah = t.halaqah.filter((h) => h.gender === g);
    if (halaqah.length === 0) continue;
    const sum = (f: (h: TeacherHalaqah) => number) => halaqah.reduce((n, h) => n + f(h), 0);
    out.push({
      ...t,
      halaqah,
      totalReal: sum((h) => h.real),
      totalIdeal: sum((h) => h.ideal),
      totalConfirmedAbsent: sum((h) => h.confirmedAbsent),
      totalTaughtNotInput: sum((h) => h.taughtNotInput),
      totalConfirmedTaught: sum((h) => h.confirmedTaught),
      totalResolved: sum((h) => h.resolved),
      totalUnsolved: sum((h) => h.unsolved),
    });
  }
  return out;
}

/** Human date+time for a sign-off timestamp, WIB. */
function fmtStamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const day = wib.getUTCDate();
  const month = MONTHS_SHORT[wib.getUTCMonth()];
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  const mm = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${hh}.${mm}`;
}

/**
 * Did this teacher sign off on their recap via the WA magic link?
 *
 * "Belum" is the load-bearing state: without an explicit sign-off row, a teacher
 * whose month was already complete looks identical to one who never opened the
 * link — and only the second needs chasing before the lock.
 */
function ConfirmationCell({
  confirmation,
  onToggleHandled,
  busy,
}: {
  confirmation: TeacherConfirmation | null;
  onToggleHandled?: (resolved: boolean) => void;
  busy?: boolean;
}) {
  if (!confirmation) {
    return <span className="text-xs text-neutral-500">Belum konfirmasi</span>;
  }
  const stamp = fmtStamp(confirmation.confirmedAt);
  if (confirmation.verdict === "tepat") {
    return (
      <span className="text-xs whitespace-nowrap text-emerald-700 dark:text-emerald-400">
        ✓ Data tepat{stamp ? ` · ${stamp}` : ""}
        {confirmation.answered > 0 ? ` · ${confirmation.answered} dijawab` : ""}
      </span>
    );
  }
  // A correction that has been acted on must leave the queue, or the list stops
  // distinguishing "nobody has looked at this" from "already fixed this morning".
  if (confirmation.resolvedAt) {
    return (
      <span className="text-xs text-neutral-500">
        <span className="text-emerald-700 dark:text-emerald-400">✓ Koreksi ditindaklanjuti</span>
        {` · ${fmtStamp(confirmation.resolvedAt)}`}
        {onToggleHandled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggleHandled(false)}
            className="ml-2 underline underline-offset-2 hover:text-neutral-700 disabled:opacity-50 dark:hover:text-neutral-300"
            title={confirmation.resolvedBy ? `Ditandai oleh ${confirmation.resolvedBy}` : undefined}
          >
            buka lagi
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="text-xs text-amber-700 dark:text-amber-400">
      <span className="whitespace-nowrap">
        ⚑ Ada koreksi{stamp ? ` · ${stamp}` : ""}
        {confirmation.disputed > 0
          ? ` · ${confirmation.disputed} pertemuan dilaporkan tidak sesuai`
          : ""}
      </span>
      {onToggleHandled && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleHandled(true)}
          className="ml-2 rounded border border-amber-400 px-1.5 py-0.5 whitespace-nowrap hover:bg-amber-50 disabled:opacity-50 dark:hover:bg-amber-950"
        >
          {busy ? "…" : "Tandai selesai"}
        </button>
      )}
    </span>
  );
}

/** Resolved / Unsolved cell: how many gap meetings got a confirmation vs still open. */
function ResolvedCell({ resolved, unsolved }: { resolved: number; unsolved: number }) {
  return (
    <TD className="text-right tabular-nums whitespace-nowrap">
      <span className="text-emerald-600">{resolved}</span>
      <span className="text-neutral-400"> / </span>
      <span className={unsolved > 0 ? "font-medium text-amber-600" : "text-neutral-500"}>
        {unsolved}
      </span>
    </TD>
  );
}

/** One teacher-recap table (used per gender). Grand totals computed from the
 * passed teachers so each gender table sums independently. */
function TeacherTable({
  teachers,
  onForceFill,
  onToggleHandled,
  busyGuruId,
}: {
  teachers: TeacherRow[];
  onForceFill?: (m: TeacherMeeting) => void;
  onToggleHandled?: (guruIds: number[], resolved: boolean) => void;
  busyGuruId?: number | null;
}) {
  const gReal = teachers.reduce((n, t) => n + t.totalReal + t.totalConfirmedTaught, 0);
  const gIdeal = teachers.reduce((n, t) => n + t.totalIdeal, 0);
  const gResolved = teachers.reduce((n, t) => n + t.totalResolved, 0);
  const gUnsolved = teachers.reduce((n, t) => n + t.totalUnsolved, 0);

  // Once a correction is marked selesai, its meeting chips + catatan are just
  // noise in a queue the coordinator is trying to shrink. Fold them away by
  // default; keep a per-teacher peek toggle so "selesai" is never a locked door.
  const [peeked, setPeeked] = useState<Set<number>>(new Set());
  const togglePeek = (i: number) =>
    setPeeked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    // Tall enough to scroll inside itself, which is what `sticky` needs to stick
    // against. Without the max-height the column names scrolled away after the
    // third pengajar and the numbers lost their labels.
    <TableWrap maxHeight="75vh">
      <Table>
        <THead sticky>
          <TR>
            <TH>Pengajar / Halaqah</TH>
            <TH>Program</TH>
            <TH className="text-right">Real</TH>
            <TH className="text-right">Ideal</TH>
            <TH className="text-right">Belum</TH>
            <TH className="text-right">Resolved / Unsolved</TH>
            <TH>Konfirmasi pengajar</TH>
            <TH className="text-right">Reminder</TH>
          </TR>
        </THead>
        <TBody>
          {teachers.map((t, i) => {
            // "Solved" = coordinator marked the correction ditindaklanjuti.
            // Details stay hidden while solved unless this row is peeked open.
            const solved = !!t.confirmation?.resolvedAt;
            const showDetails = !solved || peeked.has(i);
            return (
            <Fragment key={i}>
              <TR className="bg-neutral-50 font-semibold dark:bg-neutral-900">
                <TD>
                  {t.pengajar}
                  {solved && (
                    <button
                      type="button"
                      onClick={() => togglePeek(i)}
                      className="ml-2 text-xs font-normal text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300"
                    >
                      {showDetails ? "sembunyikan rincian" : "tampilkan rincian"}
                    </button>
                  )}
                  {t.totalConfirmedAbsent > 0 && (
                    <Badge tone="danger" className="ml-2">
                      {t.totalConfirmedAbsent} dikonfirmasi tidak mengajar
                    </Badge>
                  )}
                  {t.totalTaughtNotInput > 0 && (
                    <Badge tone="warning" className="ml-2">
                      {t.totalTaughtNotInput} klaim ngajar (belum input)
                    </Badge>
                  )}
                  {t.totalConfirmedTaught > 0 && (
                    <Badge tone="teal" className="ml-2">
                      {t.totalConfirmedTaught} mengajar (kendala sistem)
                    </Badge>
                  )}
                </TD>
                <TD></TD>
                <TD className="text-right tabular-nums">
                  {t.totalReal + t.totalConfirmedTaught}
                </TD>
                <TD className="text-right tabular-nums">{t.totalIdeal}</TD>
                <TD className="text-right tabular-nums">
                  {t.totalIdeal - t.totalReal - t.totalConfirmedTaught > 0 ? (
                    <span className="text-amber-600">
                      {t.totalIdeal - t.totalReal - t.totalConfirmedTaught}
                    </span>
                  ) : (
                    "0"
                  )}
                </TD>
                <ResolvedCell resolved={t.totalResolved} unsolved={t.totalUnsolved} />
                <TD>
                  <ConfirmationCell
                    confirmation={t.confirmation}
                    busy={busyGuruId != null && t.guruIds.includes(busyGuruId)}
                    onToggleHandled={
                      onToggleHandled && t.guruIds.length > 0
                        ? (resolved) => onToggleHandled(t.guruIds, resolved)
                        : undefined
                    }
                  />
                </TD>
                <TD></TD>
              </TR>
              {showDetails && t.confirmation && t.confirmation.notes.length > 0 && (
                <TR>
                  <TD colSpan={8} className="pt-0 pb-2 pl-8">
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      <div className="mb-1 font-medium">
                        Catatan dari pengajar
                        {t.confirmation.notes.length > 1
                          ? ` (${t.confirmation.notes.length}, terbaru di atas)`
                          : ""}
                      </div>
                      <ul className="space-y-2">
                        {t.confirmation.notes.map((note, ni) => (
                          <li
                            key={ni}
                            className="whitespace-pre-wrap border-l-2 border-amber-400/60 pl-2"
                          >
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </TD>
                </TR>
              )}
              {t.halaqah.map((h, hi) => (
                <Fragment key={hi}>
                  <TR className="text-neutral-600 dark:text-neutral-400">
                    <TD className="pl-8">
                      {h.halaqah}
                      {h.asBadal && (
                        <Badge tone="info" className="ml-2">
                          badal{h.mainTeacher ? ` · utama: ${h.mainTeacher}` : ""}
                        </Badge>
                      )}
                    </TD>
                    <TD>{h.program}</TD>
                    <TD className="text-right tabular-nums">{h.real + h.confirmedTaught}</TD>
                    <TD className="text-right tabular-nums">{h.ideal}</TD>
                    <TD className="text-right tabular-nums">
                      {h.ideal - h.real - h.confirmedTaught > 0 ? (
                        <span className="text-amber-600">
                          {h.ideal - h.real - h.confirmedTaught}
                        </span>
                      ) : (
                        "0"
                      )}
                    </TD>
                    <ResolvedCell resolved={h.resolved} unsolved={h.unsolved} />
                    <TD></TD>
                    <TD className="text-right">
                      {(() => {
                        const href = reminderWaLink(t.pengajar, h.halaqah, h.meetings, h.guruPhone);
                        return href ? (
                          <Button asChild variant="success" size="sm" className="shrink-0">
                            <a href={href} target="_blank" rel="noopener noreferrer">
                              WA
                            </a>
                          </Button>
                        ) : null;
                      })()}
                    </TD>
                  </TR>
                  {showDetails && h.meetings.length > 0 && (
                    <TR>
                      <TD colSpan={8} className="pt-0 pb-2 pl-8">
                        <div className="flex flex-wrap items-center gap-1 pt-1.5">
                          <span className="mr-1 text-xs text-neutral-500">
                            {h.real + h.confirmedTaught}/{h.ideal} sudah
                          </span>
                          {h.meetings.map((m, mi) => {
                            // done → hijau; diisi koordinator → indigo; kendala sistem → teal;
                            // tidak_mengajar dikonfirmasi → merah;
                            // klaim ngajar belum input → biru; belum + tak konfirmasi → abu.
                            // A disputed meeting is still "done" upstream, so it
                            // must not read as a plain green tick — the whole
                            // point is that the teacher says the green is wrong.
                            const tone: StatusTone = m.confStatus === "data_tidak_sesuai"
                              ? "warning"
                              : m.done
                              ? "success"
                              : m.confStatus === "diisi_koordinator"
                                ? "indigo"
                                : m.confStatus === "mengajar_kendala_sistem"
                                  ? "teal"
                                  : m.confStatus === "tidak_mengajar"
                                    ? "danger"
                                    : m.confStatus === "mengajar_belum_input"
                                      ? "info"
                                      : "neutral";
                            const cls = toneBadgeClass[tone];
                            const sym = m.confStatus === "data_tidak_sesuai"
                              ? "⚑"
                              : m.done
                              ? "✓"
                              : m.confStatus === "diisi_koordinator"
                                ? "✓ᴷ"
                                : m.confStatus === "mengajar_kendala_sistem"
                                  ? "✓~"
                                  : m.confStatus === "tidak_mengajar"
                                    ? "✕"
                                    : m.confStatus === "mengajar_belum_input"
                                      ? "◔"
                                      : "✗";
                            const state = m.confStatus === "data_tidak_sesuai"
                              ? `pengajar melaporkan catatan ini TIDAK SESUAI — mohon dicek${m.reasonText ? `: ${m.reasonText}` : " (tanpa keterangan)"}`
                              : m.done
                              ? "sudah"
                              : m.confStatus === "diisi_koordinator"
                                ? "diisi koordinator (mengajar)"
                                : m.confStatus === "mengajar_kendala_sistem"
                                  ? `mengajar, kendala sistem${m.reasonText ? ` (${m.reasonText})` : ""}`
                                  : m.confStatus === "tidak_mengajar"
                                    ? `tidak mengajar (${reasonLabel(m.reasonCode, m.reasonText)})`
                                    : m.confStatus === "mengajar_belum_input"
                                      ? "mengajar, belum input"
                                      : "belum";
                            const chipCls = `rounded-md px-1.5 py-0.5 text-xs tabular-nums ${cls}`;
                            const title = `Pertemuan ${m.order ?? "?"} · ${fmtDate(m.date)} · ${state}`;
                            // EVERY meeting is clickable for a coordinator — including a
                            // plain upstream-green one. A teacher who taps "Mulai kelas"
                            // by accident leaves a Selesai behind that only a coordinator
                            // can take back, and until this was clickable the recap had no
                            // way to say "this green is wrong".
                            const editable = Boolean(onForceFill);
                            if (editable) {
                              const hint = m.confStatus != null
                                ? "klik untuk ubah status"
                                : m.done
                                  ? "klik untuk koreksi (mis. kepencet Mulai kelas)"
                                  : "klik untuk isi manual";
                              return (
                                <button
                                  key={mi}
                                  type="button"
                                  onClick={() => onForceFill!(m)}
                                  title={`${title} · ${hint}`}
                                  className={`${chipCls} cursor-pointer hover:ring-2 hover:ring-blue-400`}
                                >
                                  {m.order ?? "?"} {sym}
                                </button>
                              );
                            }
                            return (
                              <span key={mi} title={title} className={chipCls}>
                                {m.order ?? "?"} {sym}
                              </span>
                            );
                          })}
                        </div>
                        {h.confirmedAbsent > 0 && (
                          <ul className="mt-1.5 space-y-0.5 text-xs text-red-700 dark:text-red-300">
                            {h.meetings
                              .filter((m) => m.confStatus === "tidak_mengajar")
                              .map((m, ri) => (
                                <li key={ri}>
                                  P{m.order ?? "?"} ({fmtDate(m.date)}):{" "}
                                  {reasonLabel(m.reasonCode, m.reasonText)}
                                </li>
                              ))}
                          </ul>
                        )}
                      </TD>
                    </TR>
                  )}
                </Fragment>
              ))}
            </Fragment>
            );
          })}
          <TR className="border-t-2 border-neutral-300 font-semibold dark:border-neutral-700">
            <TD>Total</TD>
            <TD></TD>
            <TD className="text-right tabular-nums">{gReal}</TD>
            <TD className="text-right tabular-nums">{gIdeal}</TD>
            <TD className="text-right tabular-nums">{gIdeal - gReal}</TD>
            <ResolvedCell resolved={gResolved} unsolved={gUnsolved} />
            <TD></TD>
          </TR>
        </TBody>
      </Table>
    </TableWrap>
  );
}

// ── HITS coordinator recap ───────────────────────────────────────────────
const pctText = (v: number | null) => (v == null ? "-" : `${v.toFixed(2)}%`);
/** Row label. Gender is null for halaqah with no enrolled peserta to read it from. */
const pesertaLabel = (g: number | null) =>
  g === 1 ? "Ikhwan" : g === 2 ? "Akhwat" : "(tanpa peserta terdaftar)";

/** One (tipe × level) table: Ikhwan / Akhwat rows, closed by the block Total. */
function HitsBlockTable({
  title,
  rows,
  total,
  emphasis = false,
}: {
  title: string;
  rows: HitsRow[];
  total: HitsRow;
  emphasis?: boolean;
}) {
  return (
    <TableWrap>
      <div
        className={`border-b border-neutral-200 px-3 py-2 text-sm font-semibold dark:border-neutral-800 ${
          emphasis ? "bg-neutral-100 dark:bg-neutral-900" : ""
        }`}
      >
        {title}
      </div>
      <Table>
        <THead>
          <TR>
            <TH className="w-10">No</TH>
            <TH>Peserta</TH>
            <TH className="text-right">Peserta aktif</TH>
            <TH className="text-right">Kehadiran Peserta</TH>
            <TH className="text-right">Peserta Keluar</TH>
            <TH className="text-right">Keberlangsungan Kelas</TH>
            <TH className="text-right">Kehadiran Pengajar</TH>
            <TH className="text-right">Absensi pengajar Di bawah Target</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r, i) => (
            <TR key={i}>
              <TD className="tabular-nums">{i + 1}</TD>
              <TD>{pesertaLabel(r.gender)}</TD>
              <TD className="text-right tabular-nums">{r.aktif}</TD>
              <TD className="text-right tabular-nums">{pctText(r.kehadiranPct)}</TD>
              <TD className="text-right tabular-nums">{r.keluar}</TD>
              <TD className="text-right tabular-nums">{pctText(r.keberlangsunganPct)}</TD>
              <TD className="text-right tabular-nums">{pctText(teacherPct(r.teacherReal, r.teacherIdeal))}</TD>
              <TD className="text-right tabular-nums">{r.pengajarDiBawahTarget}</TD>
            </TR>
          ))}
          <TR className="bg-neutral-50 font-medium dark:bg-neutral-900">
            <TD />
            <TD className="font-semibold">Total</TD>
            <TD className="text-right tabular-nums">{total.aktif}</TD>
            <TD className="text-right tabular-nums">{pctText(total.kehadiranPct)}</TD>
            <TD className="text-right tabular-nums">{total.keluar}</TD>
            <TD className="text-right tabular-nums">{pctText(total.keberlangsunganPct)}</TD>
            <TD className="text-right tabular-nums">{pctText(teacherPct(total.teacherReal, total.teacherIdeal))}</TD>
            <TD className="text-right tabular-nums">{total.pengajarDiBawahTarget}</TD>
          </TR>
        </TBody>
      </Table>
    </TableWrap>
  );
}

function blockTitle(b: HitsBlock): string {
  return `${TIPE(b.type)} · ${b.level ? shortLvl(b.level) : "(tanpa level)"}`;
}

function HitsRecap({ rep }: { rep: HitsMonthlyReport }) {
  if (rep.blocks.length === 0) {
    return <p className="text-sm text-neutral-500">Tidak ada peserta atau pertemuan pada periode ini.</p>;
  }
  return (
    <div className="space-y-4">
      {rep.blocks.map((b) => (
        <HitsBlockTable key={blockTitle(b)} title={blockTitle(b)} rows={b.rows} total={b.total} />
      ))}
      <HitsBlockTable
        title="KESELURUHAN"
        rows={[]}
        total={rep.overall}
        emphasis
      />
      <p className="text-xs text-neutral-500">
        Peserta aktif dihitung pada akhir periode (peserta yang keluar setelahnya tetap terhitung
        aktif). Keberlangsungan = pertemuan terlaksana ÷ terjadwal. Kehadiran Pengajar = pertemuan
        diajar ÷ terjadwal (badal dihitung hadir), sampai hari ini. Kolom pengajar mencacah pengajar
        dengan rasio mengajar di bawah {rep.thresholdPct}% — satu pengajar dihitung sekali, jadi
        baris Total bisa lebih kecil dari jumlah barisnya.
      </p>
    </div>
  );
}

/**
 * Batch picker for the participant tab. Pills navigate: a specific batch goes to
 * that batch's own report URL, "Semua batch" to `?batch=all` on the family's
 * newest slug — so the combined view is one stable link no matter which batch
 * the coordinator started from. Only the participant tab is scoped; the teacher
 * recap stays cross-program by design.
 */
function BatchPicker({ options }: { options: BatchOption[] }) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-neutral-500">Batch:</span>
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.current ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            o.current
              ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-200"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

const BUCKET_LABEL: Record<string, string> = {
  dikeluarkan: "Dikeluarkan",
  mengundurkan: "Mengundurkan diri / sakit / kerjaan",
  tidakAktif: "Tidak aktif",
  tidakAdaStatus: "Tidak ada status",
};

/**
 * Closing section of the participant tab: everyone behind the Keluar / Tidak
 * Aktif counters, with the reason their teacher typed upstream and the date they
 * left. Open by default — the whole point is to read the reasons without
 * hunting; the disclosure is there to fold a long list away, not to hide it.
 *
 * Rows the report's Keluar column actually counts (deactivated inside the
 * period) render plain; older exits stay visible but badged, so the list and the
 * counter never appear to disagree.
 */
function ExitedList({
  rows,
  showBatch,
  loading,
}: {
  rows: ExitedParticipant[] | null;
  showBatch: boolean;
  loading: boolean;
}) {
  if (loading) return <p className="text-sm text-neutral-500">Memuat alasan peserta keluar…</p>;
  if (!rows) return null;
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">Tidak ada peserta keluar / non-aktif.</p>;
  }
  const inPeriod = rows.filter((r) => r.inPeriod).length;
  return (
    <details open className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">
        Alasan peserta keluar / non-aktif ({rows.length})
        <span className="ml-2 font-normal text-neutral-500">
          {inPeriod} keluar dalam periode ini
        </span>
      </summary>
      <TableWrap className="border-0" maxHeight="60vh">
        <Table>
          <THead sticky>
            <TR>
              <TH>Nama</TH>
              {showBatch && <TH>Batch</TH>}
              <TH>Halaqah</TH>
              <TH>Status</TH>
              <TH>Alasan</TH>
              <TH className="whitespace-nowrap">Tanggal keluar</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r, i) => (
              <TR key={i} className={r.inPeriod ? "" : "text-neutral-500"}>
                <TD>
                  {r.name ?? "-"}
                  {!r.inPeriod && (
                    <Badge tone="neutral" className="ml-2">
                      di luar periode
                    </Badge>
                  )}
                </TD>
                {showBatch && <TD className="whitespace-nowrap">{r.batchLabel || "-"}</TD>}
                <TD>
                  {r.halaqah ?? "-"}
                  <span className="ml-1 text-xs text-neutral-500">
                    {GENDER(r.gender)} · {shortLvl(r.level)}
                  </span>
                </TD>
                <TD className="whitespace-nowrap">{BUCKET_LABEL[r.bucket] ?? r.bucket}</TD>
                <TD>{r.reason?.trim() ? r.reason : <span className="text-neutral-400">(tanpa alasan)</span>}</TD>
                <TD className="whitespace-nowrap tabular-nums">{fmtDate(r.exitedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </details>
  );
}

/** Per-batch KESELURUHAN rows under a combined HITS recap. */
function HitsPerBatchTable({ rep }: { rep: HitsMonthlyReport }) {
  if (rep.perBatch.length === 0) return null;
  return (
    <TableWrap>
      <div className="border-b border-neutral-200 px-3 py-2 text-sm font-semibold dark:border-neutral-800">
        Rincian per batch
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Batch</TH>
            <TH className="text-right">Peserta aktif</TH>
            <TH className="text-right">Kehadiran Peserta</TH>
            <TH className="text-right">Peserta Keluar</TH>
            <TH className="text-right">Keberlangsungan Kelas</TH>
            <TH className="text-right">Kehadiran Pengajar</TH>
            <TH className="text-right">Absensi pengajar Di bawah Target</TH>
          </TR>
        </THead>
        <TBody>
          {rep.perBatch.map((b) => (
            <TR key={b.slug}>
              <TD>{b.label}</TD>
              <TD className="text-right tabular-nums">{b.figures.aktif}</TD>
              <TD className="text-right tabular-nums">{pctText(b.figures.kehadiranPct)}</TD>
              <TD className="text-right tabular-nums">{b.figures.keluar}</TD>
              <TD className="text-right tabular-nums">{pctText(b.figures.keberlangsunganPct)}</TD>
              <TD className="text-right tabular-nums">
                {pctText(teacherPct(b.figures.teacherReal, b.figures.teacherIdeal))}
              </TD>
              <TD className="text-right tabular-nums">{b.figures.pengajarDiBawahTarget}</TD>
            </TR>
          ))}
          <TR className="bg-neutral-50 font-medium dark:bg-neutral-900">
            <TD className="font-semibold">Gabungan</TD>
            <TD className="text-right tabular-nums">{rep.overall.aktif}</TD>
            <TD className="text-right tabular-nums">{pctText(rep.overall.kehadiranPct)}</TD>
            <TD className="text-right tabular-nums">{rep.overall.keluar}</TD>
            <TD className="text-right tabular-nums">{pctText(rep.overall.keberlangsunganPct)}</TD>
            <TD className="text-right tabular-nums">
              {pctText(teacherPct(rep.overall.teacherReal, rep.overall.teacherIdeal))}
            </TD>
            <TD className="text-right tabular-nums">{rep.overall.pengajarDiBawahTarget}</TD>
          </TR>
        </TBody>
      </Table>
      <p className="border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800">
        Baris Gabungan dihitung ulang dari data mentah semua batch, bukan penjumlahan baris di
        atasnya — persentase tidak bisa dirata-rata, dan satu pengajar yang mengajar di dua batch
        hanya dihitung sekali.
      </p>
    </TableWrap>
  );
}

type StatusRow = {
  label: string;
  get: (s: ParticipantSegment) => string | number;
  /**
   * Bucket that only fills once the upstream source actually records a status.
   * Until then it is a row of zeros across every column, so hide it rather than
   * make the reader scan four empty lines to learn nothing.
   */
  hideWhenEmpty?: (s: ParticipantSegment) => number;
};

const STATUS_ROWS: StatusRow[] = [
  { label: "Kehadiran peserta", get: (s) => pctText(s.kehadiranPct) },
  { label: "Kehadiran pengajar", get: (s) => pctText(s.teacherPct) },
  { label: "Peserta aktif", get: (s) => s.aktif },
  { label: "Peserta Tidak Aktif", get: (s) => s.tidakAktif, hideWhenEmpty: (s) => s.tidakAktif },
  { label: "Dikeluarkan", get: (s) => s.dikeluarkan, hideWhenEmpty: (s) => s.dikeluarkan },
  {
    label: "Sakit/kerjaan/mengundurkan diri",
    get: (s) => s.mengundurkan,
    hideWhenEmpty: (s) => s.mengundurkan,
  },
  {
    label: "Tidak ada Status",
    get: (s) => s.tidakAdaStatus,
    hideWhenEmpty: (s) => s.tidakAdaStatus,
  },
  { label: "Total", get: (s) => s.total },
];

/**
 * Teacher check-in rows, in guru-days: a teacher scheduled on 8 recorded days
 * contributes 8 to "Hari efektif belajar". Only rendered for a program whose
 * source has daily teacher check-in (mabni).
 */
const CHECKIN_ROWS: [string, (s: GuruCheckinSegment) => string | number][] = [
  ["Hari efektif belajar (hari-guru)", (s) => s.hariEfektif],
  ["Terlambat", (s) => s.telat],
  ["Alpa", (s) => s.alpa],
];

/**
 * Status buckets × (gender × level) for one set of segments. `title` labels the
 * block when the report is split by meeting cadence; `footer` carries the recap
 * line, shown only when there is a single block to sum up.
 */
function ParticipantStatusTable({
  segs,
  title,
  footer,
  checkin,
  unplaced = false,
}: {
  segs: ParticipantSegment[];
  title?: string;
  footer?: React.ReactNode;
  /** Teacher check-in rows; omitted for programs with no /absensi-guru source. */
  checkin?: GuruCheckinBlock | null;
  /**
   * Peserta with no halaqah at all. Painted amber and flagged rather than
   * styled like the cadence blocks — it is a list to empty, not a cohort to
   * read, and the two look identical unless the block says so itself.
   */
  unplaced?: boolean;
}) {
  if (segs.length === 0) return null;
  const count = segs.reduce((n, s) => n + s.total, 0);
  return (
    <TableWrap
      className={
        unplaced
          ? "border-amber-300 bg-amber-50/50 dark:border-amber-900/70 dark:bg-amber-950/20"
          : undefined
      }
    >
      {title && (
        <div
          className={
            unplaced
              ? "flex flex-wrap items-center gap-2 border-b border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-900/70 dark:text-amber-200"
              : "border-b border-neutral-200 px-3 py-2 text-sm font-semibold dark:border-neutral-800"
          }
        >
          {unplaced && <AlertTriangle className="size-4 shrink-0" aria-hidden />}
          <span>{title}</span>
          {unplaced && <Badge tone="warning">{count} peserta</Badge>}
        </div>
      )}
      <Table>
        <THead>
          <TR>
            <TH>Status Peserta</TH>
            {segs.map((s, i) => (
              <TH key={i} className="text-right">
                {unplaced ? "Tanpa halaqah" : `${GENDER(s.gender)} · ${shortLvl(s.level)}`}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {STATUS_ROWS.slice(0, -1)
            .filter((row) => !row.hideWhenEmpty || segs.some((s) => row.hideWhenEmpty!(s) > 0))
            .map((row, ri) => (
              <TR key={`s${ri}`}>
                <TD>{row.label}</TD>
                {segs.map((s, i) => (
                  <TD key={i} className="text-right tabular-nums">
                    {row.get(s)}
                  </TD>
                ))}
              </TR>
            ))}
          {checkin &&
            CHECKIN_ROWS.map(([label, get], ri) => (
              <TR key={`c${ri}`}>
                <TD>{label}</TD>
                {segs.map((s, i) => {
                  const cs = checkin.segments.find(
                    (x) => x.jenis === s.jenis && x.gender === s.gender && x.level === s.level,
                  );
                  return (
                    <TD key={i} className="text-right tabular-nums">
                      {cs ? get(cs) : "-"}
                    </TD>
                  );
                })}
              </TR>
            ))}
          <TR className="font-medium bg-neutral-50 dark:bg-neutral-900">
            <TD className="font-semibold">Total</TD>
            {segs.map((s, i) => (
              <TD key={i} className="text-right tabular-nums">
                {s.total}
              </TD>
            ))}
          </TR>
        </TBody>
      </Table>
      {footer && (
        <div className="border-t border-neutral-200 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          {footer}
        </div>
      )}
    </TableWrap>
  );
}

/** Footer of the unplaced block: what the dashes mean, and where to fix it. */
function UnplacedNote({ program }: { program: string }) {
  return (
    <p className="text-xs text-amber-700 dark:text-amber-300">
      {UNPLACED_NOTE}{" "}
      <Link href={`/${program}/peserta`} className="underline underline-offset-2">
        Buka daftar peserta
      </Link>{" "}
      untuk melihat namanya (KPI “Belum punya halaqah”) lalu tempatkan di halaqah.
    </p>
  );
}

/**
 * Yaumi vs usbu'iy vs combined. Mabni reuses the same level names across both
 * cadences, so this is the only place the two are put side by side on equal
 * footing — the tables above are deliberately kept apart.
 */
function JenisRecapTable({ rep }: { rep: ParticipantReport }) {
  // Hanya jenis pertemuan yang sungguh ada. Baris tanpa halaqah dulu muncul di
  // sini sebagai jenis ketiga berwarna amber, padahal ia bukan kadensi —
  // sekarang ia jadi daftar tunggu di bawah laporan.
  const jenis = rep.byJenis.filter((j) => j.jenis != null);
  if (jenis.length <= 1) return null;
  // `rep.total` masih menghitung peserta tanpa halaqah, jadi Gabungan lebih
  // besar daripada jumlah baris di atasnya. Selisih itu disebutkan, bukan
  // dibiarkan tak terjelaskan — dan bukan pula ditambal dengan angka karangan.
  const tunggu = rep.total.total - jenis.reduce((n, j) => n + j.total, 0);
  return (
    <TableWrap>
      <div className="border-b border-neutral-200 px-3 py-2 text-sm font-medium dark:border-neutral-800">
        Rata² kehadiran per jenis pertemuan
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Jenis pertemuan</TH>
            <TH className="text-right">Rata² kehadiran</TH>
            <TH className="text-right">Kehadiran pengajar</TH>
            <TH className="text-right">Peserta aktif</TH>
            <TH className="text-right">Total peserta</TH>
          </TR>
        </THead>
        <TBody>
          {jenis.map((j) => (
            <TR key={j.jenis ?? "-"}>
              <TD>{JENIS(j.jenis)}</TD>
              <TD className="text-right tabular-nums">{pctText(j.kehadiranPct)}</TD>
              <TD className="text-right tabular-nums">{pctText(j.teacherPct)}</TD>
              <TD className="text-right tabular-nums">{j.aktif}</TD>
              <TD className="text-right tabular-nums">{j.total}</TD>
            </TR>
          ))}
          <TR className="bg-neutral-50 font-medium dark:bg-neutral-900">
            <TD className="font-semibold">
              Gabungan
              {tunggu > 0 && (
                <span className="ml-1 text-xs font-normal text-neutral-500">
                  termasuk {tunggu} di daftar tunggu
                </span>
              )}
            </TD>
            <TD className="text-right tabular-nums">{pctText(rep.total.keaktifanPct)}</TD>
            <TD className="text-right tabular-nums">{pctText(rep.total.teacherPct)}</TD>
            <TD className="text-right tabular-nums">{rep.total.aktif}</TD>
            <TD className="text-right tabular-nums">{rep.total.total}</TD>
          </TR>
        </TBody>
      </Table>
    </TableWrap>
  );
}

/** Per-batch totals under a combined default-format participant report. */
function ParticipantPerBatchTable({ rep }: { rep: ParticipantReport }) {
  if (rep.perBatch.length === 0) return null;
  return (
    <TableWrap>
      <div className="border-b border-neutral-200 px-3 py-2 text-sm font-semibold dark:border-neutral-800">
        Rincian per batch
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Batch</TH>
            <TH className="text-right">Rata² kehadiran</TH>
            <TH className="text-right">Kehadiran pengajar</TH>
            <TH className="text-right">Peserta aktif</TH>
            <TH className="text-right">Tidak aktif</TH>
            <TH className="text-right">Total terdaftar</TH>
          </TR>
        </THead>
        <TBody>
          {rep.perBatch.map((b) => (
            <TR key={b.slug}>
              <TD>{b.label}</TD>
              <TD className="text-right tabular-nums">{pctText(b.figures.keaktifanPct)}</TD>
              <TD className="text-right tabular-nums">{pctText(b.figures.teacherPct)}</TD>
              <TD className="text-right tabular-nums">{b.figures.aktif}</TD>
              <TD className="text-right tabular-nums">
                {b.figures.total - b.figures.aktif}
              </TD>
              <TD className="text-right tabular-nums">{b.figures.total}</TD>
            </TR>
          ))}
          <TR className="bg-neutral-50 font-medium dark:bg-neutral-900">
            <TD className="font-semibold">Gabungan</TD>
            <TD className="text-right tabular-nums">{pctText(rep.total.keaktifanPct)}</TD>
            <TD className="text-right tabular-nums">{pctText(rep.total.teacherPct)}</TD>
            <TD className="text-right tabular-nums">{rep.total.aktif}</TD>
            <TD className="text-right tabular-nums">{rep.total.total - rep.total.aktif}</TD>
            <TD className="text-right tabular-nums">{rep.total.total}</TD>
          </TR>
        </TBody>
      </Table>
    </TableWrap>
  );
}

/**
 * Teacher tab, grouped by the halaqah's side. The null bucket is NOT a third
 * side: it is a halaqah whose gender could not be derived at all (neither the
 * pengajar's own account nor a single enrolled peserta carries one). Same
 * amber, data-hygiene treatment as the unplaced-peserta block above — "Tanpa
 * jenis" read like a category and hid the fact that something needs fixing.
 */
const GENDER_SECTIONS: { g: number | null; label: string; hygiene?: string }[] = [
  { g: 1, label: "Ikhwan" },
  { g: 2, label: "Akhwat" },
  {
    g: null,
    label: "Gender halaqah belum terdeteksi",
    hygiene:
      "Halaqah ini tidak punya sinyal gender — akun pengajarnya kosong dan rosternya belum berisi peserta ber-gender. Lengkapi datanya agar masuk ke Ikhwan/Akhwat.",
  },
];

const FORCE_REASONS = [
  { code: "izin", label: "Izin" },
  { code: "sakit", label: "Sakit" },
  { code: "badal", label: "Digantikan badal" },
  { code: "libur", label: "Libur / tanggal merah" },
  { code: "kegiatan", label: "Ada kegiatan lain" },
  { code: "lainnya", label: "Lainnya" },
];

/** How the meeting's existing teacher mark reads in the modal, so the
 * coordinator sees what they are about to override. null = nothing marked yet. */
function confStatusSummary(m: TeacherMeeting): string | null {
  switch (m.confStatus) {
    case "data_tidak_sesuai":
      return `Pengajar melaporkan data pertemuan ini TIDAK SESUAI${m.reasonText ? `: “${m.reasonText}”` : " (tanpa keterangan)"}`;
    case "tidak_mengajar":
      return `Pengajar mengonfirmasi TIDAK mengajar (${reasonLabel(m.reasonCode, m.reasonText)})`;
    case "mengajar_belum_input":
      return "Pengajar mengaku mengajar tapi belum input presensi";
    case "mengajar_kendala_sistem":
      return `Pengajar mengaku mengajar, kendala sistem${m.reasonText ? ` (${m.reasonText})` : ""}`;
    case "diisi_koordinator":
      return "Sudah ditandai mengajar oleh koordinator";
    default:
      return null;
  }
}

/**
 * A server action that REJECTS (rather than returning `{ok:false}`) turned into a
 * frozen UI before: the state flag it set on the way in never got cleared. Every
 * call site now catches and runs this, so the failure at least says something.
 *
 * Next.js answers a request carrying an action id its build no longer knows with
 * a plain "Failed to find Server Action" — which happens to every tab left open
 * across a deploy or a dev rebuild, and no amount of clicking in that tab fixes
 * it. That case gets an explicit "reload" instruction instead of the raw text.
 */
function actionErrorMessage(e: unknown, aksi: "menyimpan" | "memuat" = "menyimpan"): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/Server Action|Failed to find/i.test(raw)) {
    return "Aplikasi baru diperbarui, jadi halaman ini sudah usang. Muat ulang halaman (F5) lalu ulangi.";
  }
  return `Gagal ${aksi}: ${raw}. Coba lagi, atau muat ulang halaman kalau tetap gagal.`;
}

/** Coordinator override modal for one meeting. Mark taught, mark not taught with
 * a reason, or — when the teacher already marked it (e.g. a "data tidak sesuai"
 * dispute) — clear that mark. All are recorded on the teacher's behalf (audited). */
function ForceFillModal({
  meeting,
  onClose,
  onDone,
}: {
  meeting: TeacherMeeting;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState("izin");
  const [reasonText, setReasonText] = useState("");
  const marked = confStatusSummary(meeting);

  async function submit(outcome: ForceFillOutcome) {
    setPending(true);
    setErr(null);
    try {
      const res = await forceFillMeeting(
        meeting.programId,
        meeting.jadwalId,
        outcome,
        outcome === "tidak_mengajar" ? reasonCode : undefined,
        outcome === "tidak_mengajar" ? reasonText : undefined,
      );
      if (res.ok) {
        onDone();
        onClose();
        return;
      }
      setErr(res.error);
    } catch (e) {
      // A rejected server action used to leave `pending` stuck true: every
      // button disabled, no message, dialog frozen — the "stuck di pop up"
      // report. The usual cause is a stale action id (the page was open across
      // a deploy or dev rebuild), which no retry inside this tab can fix.
      setErr(actionErrorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-md space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">
          {marked ? "Ubah status pertemuan" : meeting.done ? "Koreksi pertemuan" : "Isi manual pertemuan"}
        </div>
        <p className="text-sm text-neutral-500">
          Pertemuan {meeting.order ?? "?"} · {fmtDate(meeting.date)}. Ditandai atas nama pengajar
          oleh koordinator.
        </p>
        {marked && (
          <Alert variant="warning">
            <span className="text-sm">Status sekarang: {marked}</span>
          </Alert>
        )}
        {/* A green meeting the teacher never disputed: say plainly what the system
            believes, so marking it not-taught is a deliberate override and not a
            surprise. This is the "kepencet Mulai kelas" case. */}
        {meeting.done && !marked && (
          <Alert variant="warning">
            <span className="text-sm">
              Sistem mencatat pertemuan ini SUDAH diajar (Selesai di CMS). Menandai tidak
              mengajar akan menimpa catatan itu: pertemuan keluar dari hitungan Real dan
              berubah merah.
            </span>
          </Alert>
        )}
        {err && <Alert variant="danger">{err}</Alert>}
        {/* Nothing to add when the meeting is already taught and unmarked — the only
            useful action there is the override below. */}
        {(!meeting.done || marked) && (
          <Button className="w-full" disabled={pending} onClick={() => submit("mengajar")}>
            Tandai mengajar (dihitung)
          </Button>
        )}
        <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="text-sm font-medium">
            {meeting.done && !marked ? "Tandai tidak mengajar" : "Atau tandai tidak mengajar"}
          </div>
          <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {FORCE_REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </Select>
          <Input
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            maxLength={500}
            placeholder="Keterangan (opsional)"
          />
          <Button
            variant="destructive"
            className="w-full"
            disabled={pending}
            onClick={() => submit("tidak_mengajar")}
          >
            Tandai tidak mengajar
          </Button>
        </div>
        {marked && (
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => submit("batal")}
            title="Hapus tanda pengajar, kembalikan ke status asal dari sistem"
          >
            Hapus tanda pengajar (kembalikan ke asal)
          </Button>
        )}
        <Button variant="ghost" className="w-full" disabled={pending} onClick={onClose}>
          Batal
        </Button>
      </Card>
    </div>
  );
}

export function ReportView({
  program,
  defaults,
  reportFormat = "default",
  batchOptions = [],
  batch,
  punyaHasilUjian = false,
}: {
  program: string;
  defaults: { pStart: string; pEnd: string; tStart: string; tEnd: string };
  /** "hits" swaps the participant tab for the coordinator recap. */
  reportFormat?: ReportFormat;
  /** Batch pills for the participant tab; empty for single-batch programs. */
  batchOptions?: BatchOption[];
  /** "all" = read every batch of the family combined. */
  batch?: string;
  /** Program punya nilai (Maahir Evaluasi Halaqah / ujian tilawah) → tab "Hasil Ujian". */
  punyaHasilUjian?: boolean;
}) {
  const [tab, setTab] = useState<"peserta" | "pengajar" | "ujian">("peserta");
  const isHits = reportFormat === "hits";
  const isCombined = batchOptions.some((o) => o.current && o.combined);

  // participant
  const [pStart, setPStart] = useState(defaults.pStart);
  const [pEnd, setPEnd] = useState(defaults.pEnd);
  const [pRep, setPRep] = useState<ParticipantReport | null>(null);
  const [hRep, setHRep] = useState<HitsMonthlyReport | null>(null);
  const [exited, setExited] = useState<ExitedParticipant[] | null>(null);
  const [pLoading, setPLoading] = useState(false);

  // teacher
  const [tStart, setTStart] = useState(defaults.tStart);
  const [tEnd, setTEnd] = useState(defaults.tEnd);
  const [tRep, setTRep] = useState<TeacherReport | null>(null);
  const [tLoading, setTLoading] = useState(false);
  // Why a load/write failed. Without these the only symptom of a rejected action
  // was a button that stayed busy forever.
  const [pErr, setPErr] = useState<string | null>(null);
  const [tErr, setTErr] = useState<string | null>(null);
  // Coordinator force-fill: the gap meeting a coordinator clicked to fill manually.
  const [forceTarget, setForceTarget] = useState<TeacherMeeting | null>(null);
  /**
   * The range each tab is actually SHOWING, or null while it has never been run.
   *
   * `pRep === null` used to mean two different things — "you haven't pressed
   * Tampilkan" and "the query came back empty" — and the page said nothing for
   * either. Keeping the shown range separate from the pickers also lets the
   * toolbar admit when the dates were edited but not yet applied.
   */
  const [pShown, setPShown] = useState<ShownRange | null>(null);
  const [tShown, setTShown] = useState<ShownRange | null>(null);
  // Which teacher's correction is mid-write, so only that row shows a busy state.
  const [handlingGuruId, setHandlingGuruId] = useState<number | null>(null);

  /**
   * Mark a teacher's correction handled (or re-open it) and refresh the table.
   *
   * A teacher can hold two CMS accounts, and the sign-off belongs to whichever
   * one submitted; writing to all of their ids is cheaper and safer than guessing
   * which, since a no-op update on the other id changes nothing.
   */
  async function toggleHandled(guruIds: number[], resolved: boolean) {
    setHandlingGuruId(guruIds[0] ?? null);
    setTErr(null);
    try {
      // The range on screen, not the pickers: dates edited but not yet applied
      // must not silently swap the table for another month.
      const range = tShown ?? { start: tStart, end: tEnd };
      for (const id of guruIds) {
        await setCorrectionHandled(id, range.start, range.end, resolved);
      }
      setTRep(await fetchTeacherReport(range.start, range.end));
    } catch (e) {
      setTErr(actionErrorMessage(e));
    } finally {
      setHandlingGuruId(null);
    }
  }

  async function loadP() {
    setPLoading(true);
    setPErr(null);
    try {
      const [rep, keluar] = await Promise.all([
        isHits
          ? fetchHitsMonthlyReport(program, pStart, pEnd, batch)
          : fetchParticipantReport(program, pStart, pEnd, batch),
        fetchExitedParticipants(program, pStart, pEnd, batch),
      ]);
      if (isHits) setHRep(rep as HitsMonthlyReport | null);
      else setPRep(rep as ParticipantReport | null);
      setExited(keluar);
      setPShown({ start: pStart, end: pEnd });
    } catch (e) {
      setPErr(actionErrorMessage(e, "memuat"));
    } finally {
      setPLoading(false);
    }
  }
  async function loadT() {
    setTLoading(true);
    setTErr(null);
    try {
      setTRep(await fetchTeacherReport(tStart, tEnd));
      setTShown({ start: tStart, end: tEnd });
    } catch (e) {
      setTErr(actionErrorMessage(e, "memuat"));
    } finally {
      setTLoading(false);
    }
  }

  /**
   * Re-read the teacher report after a coordinator edit WITHOUT the loading state.
   * loadT() swaps the tables for a skeleton, which collapses the page and throws
   * the coordinator back to the top after every single note — on a list of ~100
   * teachers that meant scrolling down again each time. Here the old tables stay
   * mounted (scroll position and expanded rows survive) until the new data lands.
   */
  async function refreshT() {
    const range = tShown ?? { start: tStart, end: tEnd };
    setTErr(null);
    try {
      setTRep(await fetchTeacherReport(range.start, range.end));
    } catch (e) {
      setTErr(actionErrorMessage(e, "memuat"));
    }
  }

  const segs = pRep?.segments ?? [];
  const splitByJenis = (pRep?.byJenis.length ?? 0) > 1;

  // Three states per tab, never conflated: never run · running · run.
  // "Run but empty" is the third, and it needs its own copy — a coordinator who
  // picked the wrong month must not read the same screen as one who has not
  // pressed anything yet.
  const pRan = pShown != null;
  const tRan = tShown != null;
  const pStale = pShown != null && (pShown.start !== pStart || pShown.end !== pEnd);
  const tStale = tShown != null && (tShown.start !== tStart || tShown.end !== tEnd);
  const pScopeMissing = pRan && (isHits ? hRep == null : pRep == null);
  const pHasRows = isHits
    ? (hRep?.blocks.length ?? 0) > 0
    : (pRep?.segments.length ?? 0) > 0;
  const tHasRows = (tRep?.teachers.length ?? 0) > 0;
  // While a reload is in flight the skeleton owns the space: leaving the old
  // tables up under it would show two versions of the report at once.
  const pShowTables = pRan && !pLoading && pHasRows;
  const tShowTables = tRan && !tLoading && tHasRows;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "peserta" | "pengajar" | "ujian")}
      className="space-y-4"
    >
      {/* Which tab is active was already legible; what was missing is whether the
          OTHER tab has anything in it. The dot says "this one has been run", so
          switching tabs is not a coin flip. */}
      <TabsList>
        <TabsTrigger value="peserta" className="inline-flex items-center gap-2">
          Laporan Peserta
          {pRan && (
            <span
              className="size-1.5 rounded-full bg-emerald-500"
              title="Sudah ditampilkan"
              aria-label="sudah ditampilkan"
            />
          )}
        </TabsTrigger>
        <TabsTrigger value="pengajar" className="inline-flex items-center gap-2">
          Rekap Pengajar
          {tRan && (
            <span
              className="size-1.5 rounded-full bg-emerald-500"
              title="Sudah ditampilkan"
              aria-label="sudah ditampilkan"
            />
          )}
        </TabsTrigger>
        {punyaHasilUjian && <TabsTrigger value="ujian">Hasil Ujian</TabsTrigger>}
      </TabsList>

      <TabsContent value="peserta" className="space-y-3">
        <BatchPicker options={batchOptions} />
        <div className="flex flex-wrap items-center gap-3">
          <DateRange start={pStart} end={pEnd} setStart={setPStart} setEnd={setPEnd} />
          {/* The one primary action on this screen; everything beside it is an
              outline or ghost so the hierarchy reads at a glance. */}
          <Button onClick={loadP} disabled={pLoading}>
            <BarChart3 /> {pLoading ? "Memuat…" : "Tampilkan"}
          </Button>
          <Button asChild variant="secondary">
            <a
              href={`/api/reports/${program}/${isHits ? "hits-bulanan" : "participant"}?start=${pStart}&end=${pEnd}${
                batch ? `&batch=${batch}` : ""
              }`}
            >
              <Download /> Export xlsx
            </a>
          </Button>
          {/* One workbook covering every kolaborasi program at once — the sheet
              the KBA coordinator used to paste together from these exports.
              Ghost: a niche third download must not read as loud as the two
              actions every coordinator uses. */}
          {KBA_SLUGS.includes(program) && (
            <Button asChild variant="ghost">
              <a href={`/api/reports/${program}/kba-bulanan?start=${pStart}&end=${pEnd}`}>
                <Download /> Export KBA (semua kolaborasi)
              </a>
            </Button>
          )}
          {isCombined && (
            <span className="text-xs text-neutral-500">
              Angka digabung dari semua batch yang bisa kamu akses.
            </span>
          )}
        </div>
        <RangeStatus shown={pShown} stale={pStale} />

        {pErr && <Alert variant="danger">{pErr}</Alert>}

        {/* Never run yet — the state that used to be 70% of a black screen. */}
        {!pRan && !pLoading && !pErr && (
          <ReportPlaceholder
            icon={<CalendarRange className="size-5" />}
            title="Laporan belum ditampilkan"
            description="Pilih rentang tanggal lalu tekan Tampilkan — atau langsung Export xlsx."
            hint={
              isHits
                ? "Yang akan muncul: tabel per tipe & level halaqah (peserta aktif, kehadiran peserta, peserta keluar, keberlangsungan kelas, kehadiran pengajar), lalu rincian per batch dan alasan peserta keluar."
                : "Yang akan muncul: status peserta per gender & level, rata² kehadiran, kehadiran pengajar, rincian per batch, dan alasan peserta keluar."
            }
            action={
              <Button onClick={loadP} disabled={pLoading}>
                <BarChart3 /> Tampilkan
              </Button>
            }
          />
        )}

        {pLoading && <TableSkeleton cols={isHits ? 8 : 6} label="Memuat laporan peserta…" />}

        {/* Ran, but the range (or the scope) holds nothing — a different fact
            from "not run yet", and it must not read the same. */}
        {pRan && !pLoading && !pHasRows && (
          <ReportPlaceholder
            icon={<SearchX className="size-5" />}
            title={
              pScopeMissing
                ? "Tidak ada batch yang bisa dibaca"
                : "Tidak ada data pada rentang ini"
            }
            description={
              pScopeMissing
                ? "Program ini tidak punya batch yang bisa kamu akses, jadi tidak ada yang bisa dihitung."
                : `Rentang ${fmtDate(pShown!.start)} – ${fmtDate(pShown!.end)} tidak memuat peserta atau pertemuan apa pun.`
            }
            hint={
              pScopeMissing
                ? "Minta akses batch ke super-koordinator bila ini keliru."
                : "Coba lebarkan rentang tanggalnya, atau pilih batch lain di atas. Kosong di sini berarti tidak ada catatan pada periode itu — bukan nol peserta."
            }
          />
        )}

        {pShowTables && isHits && hRep && <HitsRecap rep={hRep} />}
        {pShowTables && isHits && hRep && <HitsPerBatchTable rep={hRep} />}

        {/* Split by cadence when the program mixes yaumi and usbu'iy (mabni):
            both reuse the same level names, so one table would merge cohorts. */}
        {/* Peserta tanpa halaqah TIDAK ikut di sini — mereka bukan angkatan yang
            dibaca, melainkan daftar yang harus dikosongkan. Blok mereka pindah ke
            bawah sebagai daftar tunggu (permintaan pemilik 22 Sep 2026). */}
        {pShowTables && !isHits && pRep && splitByJenis
          ? pRep.byJenis
              .filter((j) => j.jenis != null)
              .map((j) => (
                <ParticipantStatusTable
                  key={j.jenis ?? "-"}
                  title={JENIS(j.jenis)}
                  segs={segs.filter((s) => s.jenis === j.jenis)}
                  checkin={pRep.guruCheckin}
                />
              ))
          : pShowTables &&
            !isHits &&
            pRep && (
              <ParticipantStatusTable
                segs={segs}
                checkin={pRep.guruCheckin}
                footer={
                  <>
                    <span className="block">
                      Keaktifan (rata² kehadiran periode): <b>{pctText(pRep.total.keaktifanPct)}</b>{" "}
                      · Peserta aktif: <b>{pRep.total.aktif}</b> · Total terdaftar:{" "}
                      <b>{pRep.total.total}</b>
                    </span>
                    <span className="block">
                      Kehadiran pengajar = pertemuan diajar ÷ terjadwal, dihitung sampai hari ini
                      (pertemuan yang belum terjadi tidak ikut penyebut).
                    </span>
                    {pRep.guruCheckin && (
                      <span className="block">
                        Check-in pengajar: {pRep.guruCheckin.hariTerekam} hari terekam ·{" "}
                        {pRep.guruCheckin.hariEfektif} hari-guru efektif ·{" "}
                        {pRep.guruCheckin.totalTelat} terlambat · {pRep.guruCheckin.totalAlpa} alpa.
                        Hari yang belum terekam upstream tidak dihitung.
                        {pRep.guruCheckin.luarJadwal.checkin > 0 && (
                          <>
                            {" "}
                            Di luar jadwal (tidak dihitung): {pRep.guruCheckin.luarJadwal.checkin}{" "}
                            check-in, di antaranya {pRep.guruCheckin.luarJadwal.telat} terlambat dan{" "}
                            {pRep.guruCheckin.luarJadwal.izin} izin — pengajar yang hari itu tidak
                            punya pertemuan terjadwal.
                          </>
                        )}
                      </span>
                    )}
                  </>
                }
              />
            )}

        {/* The cadence-split branch has no per-table footer, and mabni is exactly
            the program that splits — without this the check-in caveats would
            never be shown for the one program that has check-in data. */}
        {pShowTables && !isHits && pRep && splitByJenis && (
          <p className="text-xs text-neutral-500">
            Kehadiran pengajar = pertemuan diajar ÷ terjadwal, dihitung sampai hari ini.
            {pRep.guruCheckin && (
              <>
                {" "}
                Check-in pengajar: {pRep.guruCheckin.hariTerekam} hari terekam ·{" "}
                {pRep.guruCheckin.hariEfektif} hari-guru efektif · {pRep.guruCheckin.totalTelat}{" "}
                terlambat · {pRep.guruCheckin.totalAlpa} alpa. Hari yang belum terekam upstream tidak
                dihitung.
                {pRep.guruCheckin.luarJadwal.checkin > 0 && (
                  <>
                    {" "}
                    Di luar jadwal (tidak dihitung): {pRep.guruCheckin.luarJadwal.checkin} check-in,
                    di antaranya {pRep.guruCheckin.luarJadwal.telat} terlambat dan{" "}
                    {pRep.guruCheckin.luarJadwal.izin} izin.
                  </>
                )}
              </>
            )}
          </p>
        )}

        {pShowTables && !isHits && pRep && <JenisRecapTable rep={pRep} />}

        {/* Hanya bila ada lebih dari satu tipe halaqah yang NYATA. Mabni seluruhnya
            offline, jadi tabel ini di sana cuma "Offline" + baris "(tanpa tipe)"
            milik peserta tanpa halaqah — tidak memberi informasi apa pun
            (permintaan pemilik 22 Sep 2026: "take out"). Program yang benar-benar
            mencampur offline/online tetap melihatnya. */}
        {pShowTables && !isHits && pRep && pRep.byType.filter((t) => t.type != null).length > 1 && (
          <TableWrap>
            <div className="border-b border-neutral-200 px-3 py-2 text-sm font-medium dark:border-neutral-800">
              Rata² kehadiran per tipe halaqah
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Tipe halaqah</TH>
                  <TH className="text-right">Rata² kehadiran</TH>
                  <TH className="text-right">Peserta aktif</TH>
                  <TH className="text-right">Total peserta</TH>
                </TR>
              </THead>
              <TBody>
                {pRep.byType.filter((t) => t.type != null).map((t) => (
                  <TR key={t.type ?? "-"}>
                    <TD>{TIPE(t.type)}</TD>
                    <TD className="text-right tabular-nums">
                      {t.kehadiranPct != null ? `${t.kehadiranPct.toFixed(2)}%` : "-"}
                    </TD>
                    <TD className="text-right tabular-nums">{t.aktif}</TD>
                    <TD className="text-right tabular-nums">{t.total}</TD>
                  </TR>
                ))}
                <TR className="bg-neutral-50 font-medium dark:bg-neutral-900">
                  <TD className="font-semibold">Gabungan</TD>
                  <TD className="text-right tabular-nums">
                    {pRep.total.keaktifanPct != null ? `${pRep.total.keaktifanPct.toFixed(2)}%` : "-"}
                  </TD>
                  <TD className="text-right tabular-nums">{pRep.total.aktif}</TD>
                  <TD className="text-right tabular-nums">{pRep.total.total}</TD>
                </TR>
              </TBody>
            </Table>
          </TableWrap>
        )}

        {pShowTables && !isHits && pRep && <ParticipantPerBatchTable rep={pRep} />}

        {/* Daftar tunggu: peserta yang belum punya halaqah. Sengaja di bawah
            seluruh tabel laporan dan diberi judul "Daftar tunggu" — ia pekerjaan
            yang harus dikosongkan, bukan angkatan yang dibaca. */}
        {pShowTables && !isHits && pRep && segs.some((s) => s.jenis == null) && (
          <>
            <ParticipantStatusTable
              title="Daftar tunggu · belum ditempatkan di halaqah"
              segs={segs.filter((s) => s.jenis == null)}
              unplaced
            />
            <UnplacedNote program={program} />
          </>
        )}

        {/* Always last: the reasons behind the Keluar / Tidak Aktif counters.
            Kept visible even when the recap itself came back empty, as long as
            somebody DID leave in the range — that is the one fact an otherwise
            empty period still carries. */}
        {pRan && !pLoading && (hRep || pRep) && (pHasRows || (exited?.length ?? 0) > 0) && (
          <ExitedList rows={exited} showBatch={isCombined} loading={pLoading} />
        )}
      </TabsContent>

      <TabsContent value="pengajar" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <DateRange start={tStart} end={tEnd} setStart={setTStart} setEnd={setTEnd} />
          <Button onClick={loadT} disabled={tLoading}>
            <BarChart3 /> {tLoading ? "Memuat…" : "Tampilkan"}
          </Button>
          <Button asChild variant="secondary">
            <a href={`/api/reports/${program}/teacher?start=${tStart}&end=${tEnd}`}>
              <Download /> Export xlsx
            </a>
          </Button>
          <span className="text-xs text-neutral-500">
            real = guru mengajar · ideal = pertemuan periode · lintas semua program
          </span>
        </div>
        <RangeStatus shown={tShown} stale={tStale} />

        {tErr && <Alert variant="danger">{tErr}</Alert>}

        {!tRan && !tLoading && !tErr && (
          <ReportPlaceholder
            icon={<Users className="size-5" />}
            title="Rekap pengajar belum ditampilkan"
            description="Pilih rentang tanggal lalu tekan Tampilkan — atau langsung Export xlsx."
            hint="Yang akan muncul: satu baris per pengajar dan per halaqah — Real vs Ideal, pertemuan yang belum diisi, konfirmasi pengajar, dan tombol reminder WA. Rekap ini lintas semua program yang bisa kamu akses."
            action={
              <Button onClick={loadT} disabled={tLoading}>
                <BarChart3 /> Tampilkan
              </Button>
            }
          />
        )}

        {tLoading && <TableSkeleton cols={8} label="Memuat rekap pengajar…" />}

        {tRan && !tLoading && !tHasRows && (
          <ReportPlaceholder
            icon={<SearchX className="size-5" />}
            title="Tidak ada pengajar pada rentang ini"
            description={`Rentang ${fmtDate(tShown!.start)} – ${fmtDate(tShown!.end)} tidak memuat satu pun pertemuan terjadwal.`}
            hint="Coba lebarkan rentang tanggalnya. Kosong di sini berarti tidak ada pertemuan terjadwal pada periode itu — bukan nol pengajar."
          />
        )}

        {tShowTables && tRep && tRep.teachers.length > 0 && (
          <p className="text-xs text-neutral-500">
            Klik pertemuan mana pun untuk mengaturnya atas nama pengajar: yang <b>belum</b>{" "}
            (abu-abu) bisa diisi manual, yang <b>sudah</b> (hijau) bisa dikoreksi jadi tidak
            mengajar — misal pengajarnya kepencet “Mulai kelas”.
          </p>
        )}
        {tShowTables &&
          tRep &&
          GENDER_SECTIONS.map(({ g, label, hygiene }) => {
            const groupTeachers = teachersForGender(tRep.teachers, g);
            if (groupTeachers.length === 0) return null;
            return (
              <div key={label} className="space-y-2">
                <h3
                  className={
                    hygiene
                      ? "flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300"
                      : "text-sm font-semibold text-neutral-700 dark:text-neutral-300"
                  }
                >
                  {hygiene && <AlertTriangle className="size-4 shrink-0" aria-hidden />}
                  <span>{label}</span>
                  {hygiene && <Badge tone="warning">{groupTeachers.length} pengajar</Badge>}
                </h3>
                {hygiene && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">{hygiene}</p>
                )}
                <TeacherTable
                  teachers={groupTeachers}
                  onForceFill={setForceTarget}
                  onToggleHandled={toggleHandled}
                  busyGuruId={handlingGuruId}
                />
              </div>
            );
          })}
      </TabsContent>

      {punyaHasilUjian && (
        <TabsContent value="ujian" className="space-y-3">
          <HasilUjianTab
            program={program}
            batch={batch}
            defaults={{ start: defaults.pStart, end: defaults.pEnd }}
            batchPicker={<BatchPicker options={batchOptions} />}
          />
        </TabsContent>
      )}

      {forceTarget && (
        <ForceFillModal
          meeting={forceTarget}
          onClose={() => setForceTarget(null)}
          onDone={refreshT}
        />
      )}
    </Tabs>
  );
}
