import { Suspense } from "react";
import { LateIncidentForm } from "./LateIncidentForm";
import { IncidentsList } from "./IncidentsList";

export const metadata = { title: "Lapor Keterlambatan — Piket" };
// Always hits the DB for the live incident list — nothing here is safe to prerender.
export const dynamic = "force-dynamic";

export default async function PiketPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program } = await params;

  return (
    // Halaman form: satu formulir lapor + daftar pendek di bawahnya.
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-20 font-bold tracking-[-0.01em]">Lapor Keterlambatan Santri</h1>
        <p className="text-sm text-ink-muted mt-1">
          Isi begitu santri datang terlambat. Kalau perizinan &quot;Tidak Izin&quot;,
          the operations coordinator otomatis dapat notifikasi WA buat tindak lanjut Surat Peringatan.
        </p>
      </div>

      <LateIncidentForm programSlug={program} />

      <div>
        <h2 className="mb-2 text-14 font-medium text-ink-muted">Insiden terbaru</h2>
        <Suspense fallback={<p className="text-14 text-ink-muted">Memuat…</p>}>
          <IncidentsList programSlug={program} />
        </Suspense>
      </div>
    </main>
  );
}
