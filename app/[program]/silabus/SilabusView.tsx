"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SilabusData, SilabusHalaqahProgress } from "@/lib/insights/silabus";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import type { StatusTone } from "@/lib/ui/status";

/** "#5" for a materi taught in one meeting, "#22–24" when it spans several. */
function slotLabel(first: number | null, last: number | null): string {
  if (first == null) return "—";
  return last == null || last === first ? `#${first}` : `#${first}–${last}`;
}

const MONTH_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function fmt(d: string, withYear: boolean): string {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return d;
  return withYear ? `${day} ${MONTH_ID[m - 1]} ${y}` : `${day} ${MONTH_ID[m - 1]}`;
}

/**
 * Halaqah run the same materi on different days, so a materi has a date RANGE,
 * not a date. Collapses to a single date when every halaqah happens to agree,
 * and drops the repeated year/month from the left end to keep it scannable.
 */
function dateLabel(first: string | null, last: string | null): string {
  if (!first) return "—";
  if (!last || last === first) return fmt(first, true);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${fmt(first, !sameYear)} – ${fmt(last, true)}`;
}

function paceBadge(h: SilabusHalaqahProgress): { label: string; tone: StatusTone } {
  if (h.lastTaughtOrder == null) return { label: "Belum mulai", tone: "neutral" };
  if (h.delta == null) return { label: "—", tone: "neutral" };
  if (h.delta < 0) return { label: `Tertinggal ${Math.abs(h.delta)}`, tone: "danger" };
  if (h.delta > 0) return { label: `Lebih cepat ${h.delta}`, tone: "info" };
  return { label: "Sesuai", tone: "success" };
}

export function SilabusView({
  program,
  data,
  today,
}: {
  program: string;
  data: SilabusData;
  /** Asia/Jakarta date from the server — see page.tsx. */
  today: string;
}) {
  const [level, setLevel] = useState(data.levels[0]?.level ?? "");
  const current = data.levels.find((l) => l.level === level) ?? data.levels[0];

  /**
   * Where the program is right now. Prefer the materi whose date range brackets
   * today; if today falls in a gap between materi (a holiday week, say), point
   * at the next one instead of showing nothing.
   */
  const marker = useMemo(() => {
    const materi = current?.materi ?? [];
    const running = materi.findIndex(
      (m) => m.firstDate && m.lastDate && m.firstDate <= today && today <= m.lastDate,
    );
    if (running !== -1) return { index: running, kind: "berjalan" as const };
    const upcoming = materi.findIndex((m) => m.firstDate && m.firstDate > today);
    if (upcoming !== -1) return { index: upcoming, kind: "berikutnya" as const };
    return { index: -1, kind: null };
  }, [current, today]);

  if (!current) return null;

  return (
    <div className="space-y-6">
      {data.levels.length > 1 && (
        <SegmentedControl
          options={data.levels.map((l) => ({ value: l.level, label: l.level }))}
          value={current.level}
          onChange={setLevel}
          size="sm"
        />
      )}

      <section className="space-y-2">
        <h2 className="text-14 font-medium text-ink-muted">
          Daftar materi · {current.materi.length} materi
        </h2>
        <TableWrap maxHeight="70vh">
          <Table>
            {/* Kepala menempel: daftar materi bisa puluhan baris. */}
            <THead sticky>
              <TR>
                <TH className="w-12 text-right">#</TH>
                <TH>Materi</TH>
                <TH className="w-28">Pertemuan</TH>
                <TH className="w-44">Tanggal</TH>
                <TH className="w-32 text-right">Dipakai</TH>
              </TR>
            </THead>
            <TBody>
              {current.materi.map((m) => {
                const isMarked = m.index === marker.index;
                // Everything already finished is dimmed, so the eye lands on the
                // boundary between what has been taught and what has not.
                const isPast = !isMarked && !!m.lastDate && m.lastDate < today;
                // Secondary columns stay muted on normal rows; past rows already
                // get their colour from the row, marked rows get the amber one.
                const sub = isMarked || isPast ? "" : "text-ink-muted";
                return (
                  <TR
                    key={`${m.index}-${m.title}`}
                    className={
                      isMarked
                        ? "bg-amber-50 dark:bg-amber-950/40"
                        : isPast
                          ? "text-ink-faint dark:text-neutral-600"
                          : undefined
                    }
                  >
                    <TD
                      className={
                        isMarked
                          ? "border-l-2 border-amber-500 text-right font-medium tabular-nums text-amber-700 dark:text-amber-400"
                          : `text-right tabular-nums ${sub}`
                      }
                    >
                      {m.index + 1}
                    </TD>
                    <TD className={isMarked ? "font-medium" : undefined}>
                      {m.title}
                      {isMarked && (
                        <Badge tone="warning" className="ml-2 align-middle">
                          {marker.kind === "berjalan" ? "Sedang berjalan" : "Berikutnya"}
                        </Badge>
                      )}
                    </TD>
                    <TD className={`tabular-nums ${sub}`}>
                      {slotLabel(m.firstOrder, m.lastOrder)}
                    </TD>
                    <TD
                      className={
                        isMarked
                          ? "whitespace-nowrap font-medium text-amber-700 dark:text-amber-400"
                          : `whitespace-nowrap ${sub}`
                      }
                    >
                      {dateLabel(m.firstDate, m.lastDate)}
                    </TD>
                    <TD className={`text-right tabular-nums ${sub}`}>{m.halaqahCount} halaqah</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      </section>

      <section className="space-y-2">
        <h2 className="text-14 font-medium text-ink-muted">
          Posisi halaqah · {current.halaqah.length} halaqah
        </h2>
        <TableWrap maxHeight="70vh">
          <Table>
            <THead sticky>
              <TR>
                <TH>Halaqah</TH>
                <TH>Pengajar</TH>
                <TH className="w-28 text-right">Pertemuan</TH>
                <TH>Materi terakhir</TH>
                <TH>Materi berikutnya</TH>
                <TH className="w-32">Status</TH>
              </TR>
            </THead>
            {/* Enam kolom: zebra menjaga mata tetap di barisnya. */}
            <TBody zebra>
              {current.halaqah.map((h) => {
                const badge = paceBadge(h);
                return (
                  <TR key={h.halaqahId}>
                    <TD>
                      <Link
                        href={`/${program}/halaqah/${h.halaqahId}`}
                        className="text-primary hover:underline"
                      >
                        {h.name ?? `#${h.halaqahId}`}
                      </Link>
                    </TD>
                    <TD className="text-ink-muted">{h.pengajar ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {h.lastTaughtOrder ?? "—"}
                      <span className="text-ink-faint">/{h.totalMeetings}</span>
                    </TD>
                    <TD>
                      {h.lastTaughtTitle ? (
                        <>
                          <span className="text-ink-faint tabular-nums">
                            {h.materiIndex != null ? `${h.materiIndex + 1}. ` : ""}
                          </span>
                          {h.lastTaughtTitle}
                        </>
                      ) : (
                        <span className="text-ink-faint">belum ada pertemuan berjalan</span>
                      )}
                    </TD>
                    <TD className="text-ink-muted">{h.nextTitle ?? "—"}</TD>
                    <TD>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      </section>
    </div>
  );
}
