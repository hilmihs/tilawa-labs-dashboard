import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * "Terakhir disinkron: 19.10 WIB (5 jam lalu)" — the one place that decides how
 * old is too old.
 *
 * Pages used to print this line in red unconditionally, so a perfectly normal
 * five-hour-old sync looked like an outage and the color stopped meaning
 * anything. Age now picks the color:
 *
 *   < 2 jam    hijau   segar
 *   2–24 jam   kuning  masih wajar untuk data harian, tapi bukan real-time
 *   > 24 jam   merah   sudah lewat satu siklus harian — perlu ditindak
 *
 * A failed last run is red regardless of age (the badge would otherwise keep
 * showing the last SUCCESS and hide the outage), and "belum pernah disinkron"
 * is amber, not red — nothing has broken yet.
 *
 * Server-safe: no state, no timers. The relative part is computed at render, so
 * it is stamped with `suppressHydrationWarning` — a server/client boundary that
 * lands on either side of a minute must not produce a hydration error.
 */

/** Threshold boundaries in hours. Exported so tests/tooltips stay in sync. */
export const SYNC_FRESH_HOURS = 2;
export const SYNC_STALE_HOURS = 24;

export type SyncTone = "fresh" | "aging" | "stale" | "unknown";

/** Legacy tone triple used by `lastSyncLabel()` in lib/sync/last-sync.ts. */
export type LegacySyncTone = "ok" | "warn" | "bad";

const TONE_CLASS: Record<SyncTone, string> = {
  fresh: "text-ok",
  aging: "text-warn",
  stale: "text-danger",
  unknown: "text-warn",
};

const LEGACY_TONE: Record<LegacySyncTone, SyncTone> = {
  ok: "fresh",
  warn: "aging",
  bad: "stale",
};

export const SYNC_THRESHOLD_HINT =
  `Ambang usia data: hijau < ${SYNC_FRESH_HOURS} jam · kuning ${SYNC_FRESH_HOURS}–${SYNC_STALE_HOURS} jam · ` +
  `merah > ${SYNC_STALE_HOURS} jam. Sync yang gagal selalu merah.`;

function toDate(at: Date | string | number | null | undefined): Date | null {
  if (at == null) return null;
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Tone for a last-successful-sync timestamp. `failed` forces `stale`. */
export function syncTone(
  at: Date | string | number | null | undefined,
  opts: { failed?: boolean; running?: boolean; now?: number } = {},
): SyncTone {
  if (opts.running) return "fresh";
  if (opts.failed) return "stale";
  const d = toDate(at);
  if (!d) return "unknown";
  const hours = ((opts.now ?? Date.now()) - d.getTime()) / 3_600_000;
  if (hours < SYNC_FRESH_HOURS) return "fresh";
  if (hours < SYNC_STALE_HOURS) return "aging";
  return "stale";
}

/** Tailwind text-color class for a tone (accepts the legacy ok/warn/bad names). */
export function syncToneClass(tone: SyncTone | LegacySyncTone): string {
  return TONE_CLASS[tone in TONE_CLASS ? (tone as SyncTone) : LEGACY_TONE[tone as LegacySyncTone]];
}

/** "19.10 WIB (5 jam lalu)" — WIB is fixed, the dashboard is a Jakarta tool. */
export function formatSyncLabel(
  at: Date | string | number | null | undefined,
  now: number = Date.now(),
): string {
  const d = toDate(at);
  if (!d) return "belum pernah disinkron";
  const clock = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  const mins = Math.floor((now - d.getTime()) / 60_000);
  const rel =
    mins < 1
      ? "barusan"
      : mins < 60
        ? `${mins} menit lalu`
        : mins < 60 * 24
          ? `${Math.floor(mins / 60)} jam lalu`
          : `${Math.floor(mins / 1440)} hari lalu`;
  return `${clock} WIB (${rel})`;
}

export interface SyncStatusProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** ISO string / Date of the last SUCCESSFUL sync. `null` = never synced. */
  at?: Date | string | number | null;
  /** A run is in progress right now. */
  running?: boolean;
  /** The most recent run failed (even if an older one succeeded). */
  failed?: boolean;
  /** Text before the colon. */
  prefix?: string;
  /**
   * Escape hatches for callers that already computed the line (e.g. the
   * existing `lastSyncLabel()` helper) — `label` replaces the formatted
   * timestamp, `tone` overrides the threshold result.
   */
  label?: string;
  tone?: SyncTone | LegacySyncTone;
}

export function SyncStatus({
  at,
  running = false,
  failed = false,
  prefix = "Terakhir disinkron",
  label,
  tone,
  className,
  title,
  ...props
}: SyncStatusProps) {
  const resolvedTone = tone
    ? tone in TONE_CLASS
      ? (tone as SyncTone)
      : LEGACY_TONE[tone as LegacySyncTone]
    : syncTone(at, { failed, running });

  const body = running
    ? "sedang menyinkron…"
    : `${label ?? formatSyncLabel(at)}${failed ? " · sync terakhir gagal" : ""}`;

  const full = toDate(at)?.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  return (
    <span
      suppressHydrationWarning
      title={title ?? (full ? `${SYNC_THRESHOLD_HINT} Sukses terakhir: ${full} WIB.` : SYNC_THRESHOLD_HINT)}
      className={cn("text-12 tabular-nums", TONE_CLASS[resolvedTone], className)}
      {...props}
    >
      {running ? body : `${prefix}: ${body}`}
    </span>
  );
}
