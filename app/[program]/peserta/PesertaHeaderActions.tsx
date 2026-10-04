"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SyncStatus } from "@/components/ui/sync-status";
import { triggerSync, type TriggerSyncResult } from "../actions";

/**
 * Header actions for Daftar Peserta, ranked instead of flat.
 *
 * The shared `SyncBar` renders "Refresh sekarang" and "Tarik ulang penuh" as
 * two identical outline buttons which — next to an outline "Export xlsx" —
 * gave three equal-weight buttons for three very unequal actions. This is a
 * page-local replacement (the shared bar is owned elsewhere) with one primary
 * action (Export), a ghost secondary (Refresh) and the expensive full re-pull
 * last, at the lowest contrast and behind a confirm.
 *
 * The "terakhir disinkron" line is `<SyncStatus>`: the age thresholds and their
 * colors live there now, so this page cannot drift from the rest of the app.
 */
export function PesertaHeaderActions({
  program,
  exportHref,
  syncAt,
  syncFailed = false,
  syncRunning = false,
}: {
  program: string;
  exportHref: string;
  /** Timestamp of the last SUCCESSFUL sync; null = belum pernah. */
  syncAt?: string | Date | null;
  syncFailed?: boolean;
  syncRunning?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TriggerSyncResult | null>(null);
  const router = useRouter();

  const refresh = (deep = false) =>
    start(async () => {
      const r = await triggerSync(program, deep);
      setResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <a href={exportHref}>
            <Download /> Export xlsx
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => refresh(false)}
          disabled={pending}
        >
          {pending ? "Menyinkron…" : "↻ Refresh sekarang"}
        </Button>
        {/* Refresh biasa melewati halaqah yang presensinya tidak berubah, jadi
            ganti pengajar / badal / ganti nama pertemuan di CMS tidak terbawa.
            Tombol ini menarik ulang semua halaqah program ini — lebih lambat,
            dipakai setelah data diperbaiki di CMS. Karena itu ia yang paling
            redup, paling kanan, dan meminta konfirmasi. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (
              window.confirm(
                "Tarik ulang SEMUA halaqah program ini? Prosesnya jauh lebih lama dari Refresh biasa. Pakai hanya setelah data diperbaiki di CMS.",
              )
            ) {
              refresh(true);
            }
          }}
          disabled={pending}
          title="Tarik ulang SEMUA halaqah program ini, termasuk yang presensinya tidak berubah. Pakai setelah ganti pengajar / badal / ubah nama pertemuan di CMS."
          className="font-normal text-ink-muted"
        >
          ⟳ Tarik ulang penuh
        </Button>
      </div>
      {result ? (
        <div className={`text-12 ${result.ok ? "text-ink-muted" : "text-warn"}`}>
          {result.ok ? result.message : result.error}
        </div>
      ) : (
        <SyncStatus at={syncAt} failed={syncFailed} running={syncRunning} />
      )}
    </div>
  );
}
