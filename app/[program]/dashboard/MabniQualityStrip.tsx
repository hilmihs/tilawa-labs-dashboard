import { getMabniDataQuality } from "@/lib/insights/mabni";

/**
 * Row of data-quality counters above the attendance table. Everything here is
 * something a coordinator can actually go fix upstream, so a zero is worth
 * showing too — it is the difference between "clean" and "not checked".
 */
export async function MabniQualityStrip({ program }: { program: string }) {
  const q = await getMabniDataQuality(program);
  if (!q) return null;

  const items: { label: string; value: number; hint?: string; bad: boolean }[] = [
    {
      label: "Presensi bertanggal ke depan",
      value: q.futureAttendance,
      hint: q.futureAttendanceDates.length > 0 ? q.futureAttendanceDates.join(", ") : undefined,
      bad: q.futureAttendance > 0,
    },
    { label: "Kelas tanpa presensi", value: q.classesWithoutAttendance, bad: q.classesWithoutAttendance > 0 },
    { label: "Siswa tanpa kelas", value: q.studentsWithoutClass, bad: q.studentsWithoutClass > 0 },
    { label: "Pengajar tanpa kelas", value: q.teachersWithoutClass, bad: q.teachersWithoutClass > 0 },
    { label: "Siswa belum pernah setor", value: q.studentsWithoutSetoran, bad: q.studentsWithoutSetoran > 0 },
  ];

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-500">
        Kualitas data · yang perlu dirapikan di boarding.tilawalabs.demo
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-lg border border-neutral-200 bg-card px-3 py-2 dark:border-neutral-800"
          >
            <div
              className={`text-lg font-semibold tabular-nums ${it.bad ? "text-amber-600 dark:text-amber-400" : "text-neutral-400"}`}
            >
              {it.value}
            </div>
            <div className="text-xs text-neutral-500">{it.label}</div>
            {it.hint && <div className="mt-0.5 text-xs text-neutral-400">{it.hint}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
