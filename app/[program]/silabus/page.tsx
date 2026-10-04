import { getSilabus } from "@/lib/insights/silabus";
import { getProgram } from "@/lib/programs/resolve";
import { EmptyState } from "@/components/ui/empty-state";
import { SilabusView } from "./SilabusView";

export const metadata = { title: "Silabus" };
// Live DB read on every request — no static prerendering.
export const dynamic = "force-dynamic";

/**
 * Asia/Jakarta calendar date, same trick as lib/sync/hkm-sync.ts. Computed on
 * the server and passed down so the "sedang berjalan" row can't differ between
 * the server render and the client hydration.
 */
function todayJakarta(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export default async function SilabusPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program } = await params;
  const [programRow, data] = await Promise.all([getProgram(program), getSilabus(program)]);

  return (
    // Halaman tabel: dua tabel enam kolom dengan nama materi panjang.
    <main className="mx-auto w-full max-w-[1600px] px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-20 font-bold tracking-[-0.01em]">Silabus</h1>
          <p className="mt-1 text-14 text-ink-muted">
            Urutan materi program ini, dibaca dari nama pertemuan yang diisi pengajar di CMS —
            beserta posisi tiap halaqah terhadap urutan itu.
          </p>
        </div>
        {data?.derivable && (
          <a
            href={`/api/reports/${program}/silabus`}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            Export xlsx
          </a>
        )}
      </div>

      {!data ? (
        <EmptyState title="Program tidak ditemukan" />
      ) : !data.derivable ? (
        <EmptyState
          icon="📄"
          title="Silabus belum bisa dibaca"
          description={
            <>
              Nama pertemuan {programRow?.name ?? program} di CMS masih generik (mis.{" "}
              <code>Pertemuan 1</code>, atau hanya angka <code>1</code>, <code>2</code>), jadi tidak
              ada materi yang bisa diurutkan. Isi nama materi di tiap pertemuan pada CMS, lalu
              halaman ini terisi sendiri setelah sync berikutnya.
            </>
          }
        />
      ) : (
        <SilabusView program={program} data={data} today={todayJakarta()} />
      )}
    </main>
  );
}
