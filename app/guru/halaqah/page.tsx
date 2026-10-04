import Link from "next/link";
import { redirect } from "next/navigation";
import { getGuruSession } from "@/lib/guru-portal/session";
import { getHalaqahForGuru } from "@/lib/guru-portal/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Halaqah Saya" };

export default async function HalaqahListPage() {
  const session = await getGuruSession();
  if (!session) redirect("/guru");

  const halaqah = await getHalaqahForGuru(session.guruIds);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-20 font-semibold tracking-[-0.01em]">Halaqah Saya</h1>
          <p className="mt-1 truncate text-14 text-ink-muted">
            Ustadz/ah <b className="text-foreground">{session.name}</b>
          </p>
        </div>
        <LogoutButton />
      </div>

      {halaqah.length === 0 ? (
        <EmptyState
          icon="📭"
          title="Belum ada halaqah"
          description="Tidak ada halaqah yang terhubung dengan akun Ustadz/ah. Hubungi koordinator bila ini keliru."
        />
      ) : (
        <ul className="space-y-2">
          {halaqah.map((h) => (
            <li key={`${h.programSlug}-${h.halaqahId}`}>
              {/* Whole card is the tap target — min-h keeps it well over 40px
                  even when the level line is empty. */}
              <Link
                href={`/guru/halaqah/${h.halaqahId}`}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-neutral-200 bg-card px-4 py-3 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-16 font-medium">
                    {h.name ?? `Halaqah #${h.halaqahId}`}
                  </span>
                  <span className="block truncate text-12 text-ink-muted">{h.level ?? "—"}</span>
                </span>
                <span aria-hidden className="shrink-0 text-ink-faint">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
