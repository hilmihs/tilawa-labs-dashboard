import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { getSuratCandidates } from "@/lib/hkm/surat-queries";
import { getProgram } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { RecentLetters } from "./RecentLetters";
import { SuratGenerator } from "./SuratGenerator";

export const metadata = { title: "Surat — HKM" };
// Reads the live roster and the letter history; nothing here is prerenderable.
export const dynamic = "force-dynamic";

export default async function SuratPage({ params }: { params: Promise<{ program: string }> }) {
  const { program: slug } = await params;
  // app/[program]/layout.tsx already ran requireProgramAccess for this slug.
  const program = await getProgram(slug);
  if (!program) notFound();

  // The nav link is a convenience, not a gate — check the flag on the route too.
  if (!getProgramConfig(program).features.surat) notFound();

  // HKM's dashboard slug is berkah-backed; its roster lives in the paired
  // tilawah program named by config.presensiSlug.
  const rosterSlug = ((program.config ?? {}) as { presensiSlug?: string }).presensiSlug || slug;
  const candidates = await getSuratCandidates(rosterSlug);

  return (
    // Halaman form: pilih peserta → periksa isi → unduh.
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-20 font-bold tracking-[-0.01em]">Surat Peserta HKM</h1>
        <p className="mt-1 text-14 text-ink-muted">
          Pilih peserta, cek isinya, lalu unduh. Beberapa peserta sekaligus jadi satu berkas PDF —
          satu halaman per orang.
        </p>
      </div>

      {candidates.length === 0 ? (
        <EmptyState
          title="Data peserta HKM belum tersinkron"
          description={`Roster dibaca dari program "${rosterSlug}". Jalankan sync presensi dulu, lalu buka halaman ini lagi.`}
        />
      ) : (
        <SuratGenerator programSlug={slug} candidates={candidates} />
      )}

      <div>
        <h2 className="mb-2 text-14 font-medium text-ink-muted">Surat yang sudah dibuat</h2>
        <Suspense fallback={<p className="text-14 text-ink-muted">Memuat…</p>}>
          <RecentLetters programSlug={slug} />
        </Suspense>
      </div>
    </main>
  );
}
