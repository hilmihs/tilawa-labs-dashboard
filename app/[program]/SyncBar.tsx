"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerSync, type TriggerSyncResult } from "./actions";

const toneClass = {
  ok: "text-ink-muted",
  warn: "text-warn",
  bad: "text-danger",
} as const;

export function SyncBar({
  program,
  label,
  tone,
}: {
  program: string;
  label: string;
  tone: "ok" | "warn" | "bad";
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
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => refresh(false)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-12 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:opacity-50"
        >
          {pending ? (
            "Menyinkron…"
          ) : (
            <>
              {/* Gold glyph on forest (design topbar "Sync"); on dark the button is gold, so it inherits. */}
              <span aria-hidden className="text-brand-gold dark:text-inherit">
                ↻
              </span>
              Refresh sekarang
            </>
          )}
        </button>
        {/* Refresh biasa melewati halaqah yang presensinya tidak berubah, jadi
            ganti pengajar / badal / ganti nama pertemuan di CMS tidak terbawa.
            Tombol ini menarik ulang semua halaqah program ini — lebih lambat,
            dipakai setelah data diperbaiki di CMS. */}
        <button
          type="button"
          onClick={() => refresh(true)}
          disabled={pending}
          title="Tarik ulang SEMUA halaqah program ini, termasuk yang presensinya tidak berubah. Pakai setelah ganti pengajar / badal / ubah nama pertemuan di CMS."
          className="rounded-lg border border-dashed border-warn px-2.5 py-1.5 text-12 font-medium text-warn transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:opacity-50 dark:border-amber-500/60 dark:hover:bg-amber-950/30"
        >
          ⟳ Tarik ulang penuh
        </button>
      </div>
      <div className={`text-12 ${result && !result.ok ? "text-warn" : toneClass[tone]}`}>
        {result
          ? result.ok
            ? result.message
            : result.error
          : `Terakhir disinkron: ${label}`}
      </div>
    </div>
  );
}
