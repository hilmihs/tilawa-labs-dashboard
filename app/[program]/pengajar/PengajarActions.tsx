"use client";

/**
 * Header aksi halaman Daftar Pengajar.
 *
 * Menggantikan tiga tombol outline sejajar (`Export xlsx` / `Refresh sekarang` /
 * `Tarik ulang penuh`) dengan satu hierarki: Export adalah aksi utama halaman
 * ini, Refresh sekunder, dan "Tarik ulang penuh" — satu detail-request per
 * halaqah — paling lirih dan berkonfirmasi, karena mahal, bukan karena harian.
 *
 * Baris "terakhir disinkron" memakai `<SyncStatus>`: ambang umur dan warnanya
 * tinggal di sana, jadi halaman ini tidak bisa berbeda pendapat dengan layar
 * lain (dulu ada pemeta ok/warn/bad lokal di `./sync-status`).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SyncStatus } from "@/components/ui/sync-status";
import { triggerSync, type TriggerSyncResult } from "../actions";

export function PengajarActions({
  program,
  exportHref,
  syncAt,
  syncFailed = false,
  syncRunning = false,
}: {
  program: string;
  /** Tautan xlsx; halaman "semua batch" menyisipkan `?batch=semua`. */
  exportHref?: string;
  /** Waktu sync SUKSES terakhir; null = belum pernah. */
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

  const tarikUlangPenuh = () => {
    const ok = window.confirm(
      "Tarik ulang SEMUA halaqah program ini, termasuk yang presensinya tidak berubah?\n\n" +
        "Jauh lebih lambat dari refresh biasa. Dipakai setelah ganti pengajar / badal / " +
        "ubah nama pertemuan di CMS.",
    );
    if (ok) refresh(true);
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button asChild>
          <a href={exportHref ?? `/api/reports/${program}/pengajar-list`}>
            <Download /> Export xlsx
          </a>
        </Button>
        <Button variant="secondary" onClick={() => refresh(false)} disabled={pending}>
          {pending ? "Menyinkron…" : "↻ Refresh sekarang"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={tarikUlangPenuh}
          disabled={pending}
          title="Tarik ulang SEMUA halaqah program ini, termasuk yang presensinya tidak berubah. Pakai setelah ganti pengajar / badal / ubah nama pertemuan di CMS."
          className="text-ink-muted hover:text-foreground"
        >
          Tarik ulang penuh
        </Button>
      </div>
      {result ? (
        <div className={`text-12 ${result.ok ? "text-ok" : "text-warn"}`}>
          {result.ok ? result.message : result.error}
        </div>
      ) : (
        <SyncStatus at={syncAt} failed={syncFailed} running={syncRunning} />
      )}
    </div>
  );
}
