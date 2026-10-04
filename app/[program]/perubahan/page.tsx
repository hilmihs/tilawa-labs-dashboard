import { redirect } from "next/navigation";
import { PerubahanView } from "./PerubahanView";
import { getProgram } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { getBatchOptions, resolveReportScope } from "@/lib/reports/scope";
import { getChangeRecap, getRecapDateBounds, getScheduleChanges } from "@/lib/reports/change-recap";

export const metadata = { title: "Perubahan Pengajar" };
export const dynamic = "force-dynamic";

export default async function PerubahanPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<{ start?: string; end?: string; batch?: string; tab?: string }>;
}) {
  const { program } = await params;
  // Access itself is enforced by app/[program]/layout.tsx; this only decides
  // whether the program has the data the page needs.
  const programRow = await getProgram(program);
  if (!programRow || !getProgramConfig(programRow).features.perubahan) redirect(`/${program}/dashboard`);

  const { start, end, batch, tab } = await searchParams;
  const scope = await resolveReportScope(program, batch);
  if (!scope) redirect(`/${program}/dashboard`);

  const bounds = await getRecapDateBounds(scope.programIds);
  const rangeStart = start ?? bounds?.start ?? "2020-01-01";
  const rangeEnd = end ?? bounds?.end ?? "2099-12-31";

  const [recap, schedule] = await Promise.all([
    getChangeRecap(rangeStart, rangeEnd, scope.programIds),
    getScheduleChanges(rangeStart, rangeEnd, scope.programIds),
  ]);
  const batchOptions = await getBatchOptions(program, batch, "perubahan");

  return (
    // Halaman tabel: rincian pertemuan tujuh kolom + nama pengajar panjang.
    <main className="mx-auto w-full max-w-[1600px] px-6 py-8 space-y-6">
      <div>
        <h1 className="text-20 font-bold tracking-[-0.01em]">Perubahan Pengajar</h1>
        <p className="mt-1 text-14 text-ink-muted">
          Pertemuan yang diajar orang lain selain pengajar yang tercatat memegang halaqah, dan
          daftar halaqah yang catatan pengajarnya sudah tidak sesuai kenyataan.
        </p>
      </div>
      <PerubahanView
        recap={recap}
        schedule={schedule}
        scopeLabel={scope.label}
        batchOptions={batchOptions}
        initialTab={tab === "kualitas" ? "kualitas" : tab === "jadwal" ? "jadwal" : "badal"}
      />
    </main>
  );
}
