"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { recordReminderClick } from "./actions";

/**
 * "Ingatkan via WA" plus the memory of having done it.
 *
 * The link is opened in a new tab by the browser as usual; the click is logged
 * on the way past. The log is best-effort on purpose — the reminder must open
 * whether or not the write succeeds, so nothing here awaits the server before
 * navigating.
 */
export function WaReminderButton({
  href,
  programSlug,
  halaqahId,
  pengajar,
  phone,
  history,
  messageSummary,
}: {
  href: string | null;
  programSlug: string;
  halaqahId: number;
  pengajar: string | null;
  phone: string | null;
  history: { count: number; lastAt: string; lastBy: string | null } | null;
  /** What the draft will contain, e.g. "3 pertemuan belum diisi + 21 …". */
  messageSummary?: string;
}) {
  const [, startTransition] = useTransition();
  // Optimistic: the row does not re-render until revalidation lands, and a
  // coordinator who just clicked should see that immediately.
  const [justClicked, setJustClicked] = useState(false);

  const count = (history?.count ?? 0) + (justClicked ? 1 : 0);
  const lastAt = justClicked ? new Date().toISOString() : (history?.lastAt ?? null);

  if (!href) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled
          title="Nomor pengajar belum tersync dari tilawah"
        >
          WA tidak tersedia
        </Button>
        {count > 0 && <ReminderStamp count={count} lastAt={lastAt} lastBy={history?.lastBy ?? null} />}
      </div>
    );
  }

  // Spell out what the draft holds: the button opens WhatsApp with a prepared
  // message, it never sends anything by itself.
  const tooltip =
    `Membuka WhatsApp ke ${pengajar ?? "pengajar"}${phone ? ` (${phone})` : ""} dengan draf ` +
    `presensi halaqah ini` +
    (messageSummary ? `: ${messageSummary}.` : ".") +
    ` Pesan belum terkirim — bisa diperiksa dan diedit dulu di WhatsApp.`;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button asChild variant={count > 0 ? "secondary" : "success"} size="sm">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={tooltip}
          aria-label={tooltip}
          onClick={() => {
            setJustClicked(true);
            startTransition(() => {
              void recordReminderClick(programSlug, halaqahId, pengajar, phone);
            });
          }}
        >
          {count > 0 ? "Ingatkan lagi" : "Ingatkan via WA"}
        </a>
      </Button>
      {messageSummary && (
        <span className="max-w-[14rem] text-right text-[11px] text-neutral-500">
          Draf berisi {messageSummary}
        </span>
      )}
      {count > 0 && <ReminderStamp count={count} lastAt={lastAt} lastBy={history?.lastBy ?? null} />}
    </div>
  );
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

/** "2× · terakhir 16 Agu 21.30" — WIB, hand-formatted (container may lack ICU). */
function ReminderStamp({
  count,
  lastAt,
  lastBy,
}: {
  count: number;
  lastAt: string | null;
  lastBy: string | null;
}) {
  let when = "";
  if (lastAt) {
    const d = new Date(lastAt);
    if (!Number.isNaN(d.getTime())) {
      const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      const hh = String(wib.getUTCHours()).padStart(2, "0");
      const mm = String(wib.getUTCMinutes()).padStart(2, "0");
      when = ` · terakhir ${wib.getUTCDate()} ${MONTHS_SHORT[wib.getUTCMonth()]} ${hh}.${mm}`;
    }
  }
  return (
    <span
      className="text-[11px] whitespace-nowrap text-neutral-500"
      title={lastBy ? `Terakhir diklik oleh ${lastBy}` : undefined}
    >
      {count}× diingatkan{when}
    </span>
  );
}
