import Link from "next/link";
import { redirect } from "next/navigation";
import { getGuruSession } from "@/lib/guru-portal/session";
import { getHalaqahForGuruById } from "@/lib/guru-portal/queries";
import { Alert } from "@/components/ui/alert";
import { PertemuanList } from "./PertemuanList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pertemuan Halaqah" };

export default async function HalaqahDetailPage({
  params,
}: {
  params: Promise<{ halaqahId: string }>;
}) {
  const session = await getGuruSession();
  if (!session) redirect("/guru");

  const { halaqahId: raw } = await params;
  const halaqahId = Number(raw);
  const halaqah = Number.isFinite(halaqahId)
    ? await getHalaqahForGuruById(session.guruIds, halaqahId)
    : null;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <Link
        href="/guru/halaqah"
        className="-ml-2 inline-flex h-10 items-center rounded-lg px-2 text-14 text-ink-muted hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-800"
      >
        ← Halaqah Saya
      </Link>

      {!halaqah ? (
        <Alert variant="danger" className="mt-4">
          Halaqah tidak ditemukan atau Ustadz/ah tidak berhak mengaksesnya.
        </Alert>
      ) : (
        <>
          <div className="mt-3 mb-5">
            <h1 className="text-20 font-semibold tracking-[-0.01em]">
              {halaqah.name ?? `Halaqah #${halaqah.halaqahId}`}
            </h1>
            <p className="mt-1 text-14 text-ink-muted">{halaqah.level ?? "—"}</p>
          </div>
          <PertemuanList halaqahId={halaqah.halaqahId} meetings={halaqah.meetings} />
        </>
      )}
    </main>
  );
}
