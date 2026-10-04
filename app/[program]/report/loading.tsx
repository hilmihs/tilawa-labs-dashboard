import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level placeholder for /[program]/report.
 *
 * The page is `force-dynamic` and resolves the program, its config and the batch
 * options on the server before a single pixel renders, so navigating to Laporan
 * used to land on a blank screen. This mirrors the real chrome — title, tabs,
 * toolbar, empty-state block — at the same sizes, so nothing jumps when the
 * server payload arrives.
 */
export default function Loading() {
  return (
    <main className="w-full space-y-6 px-6 py-8" aria-busy="true">
      <div>
        <Skeleton className="h-[19px] w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-3xl" />
      </div>

      {/* Tabs */}
      <Skeleton className="h-[42px] w-72 rounded-lg" />

      {/* Toolbar: rentang tanggal + Tampilkan + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Where the report itself will land */}
      <Skeleton className="h-[320px] w-full rounded-xl" />
      <span className="sr-only">Memuat halaman laporan…</span>
    </main>
  );
}
