import Link from "next/link";
import { jamWib } from "@/lib/time/jakarta";

/**
 * Bilah atas halaman publik. `sinkronAt` = sinkron sukses yang membatasi
 * kesegaran angka di halaman ini; basi (>24 jam) → titik kuning + tanggal.
 */
export function Topbar({ sinkronAt, stale }: { sinkronAt: string | null; stale: boolean }) {
  const sync = sinkronAt ? new Date(sinkronAt) : null;
  return (
    <header className="border-b border-[var(--pk-line)] bg-[var(--pk-card)]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <Link
          href="/publik"
          aria-label="Education Board — semua program"
          className="flex size-[34px] flex-none items-center justify-center rounded-[10px] bg-[linear-gradient(160deg,#3b82f6,#2563eb)] text-sm font-bold text-white"
        >
          م
        </Link>
        <span className="text-sm font-semibold">Education Board</span>
        <span className="pk-mono rounded border border-[var(--pk-chip-line)] bg-[var(--pk-chip)] px-1.5 py-0.5 text-[10.5px] text-[var(--pk-ink2)]">
          Publik
        </span>
        <div className="pk-mono ml-auto flex items-center gap-[7px] text-[11px] text-[var(--pk-ink2)]">
          <span className={`size-1.5 rounded-full ${stale ? "bg-amber-500" : "bg-green-500"}`} />
          {!sync ? "belum sinkron" : stale ? `data per ${tanggalPendek(sync)}` : `sync ${jamWib(sync)} WIB`}
        </div>
      </div>
    </header>
  );
}

function tanggalPendek(d: Date): string {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
}
