/**
 * Ambang kehadiran program, untuk KPI halaman ini.
 *
 * `attendance_thresholds.pct_70` adalah kebijakan per-program (yaumiy); tanpa
 * baris itu berlaku 70 — angka yang sama dipakai `lib/insights/halaqah.ts` saat
 * menghitung `belowCount`. Lib hanya membacanya di dalam bundel besar
 * (`getInsights`, laporan bulanan) yang menjalankan belasan query lain; halaman
 * daftar peserta tidak butuh semuanya, cukup satu baris ini.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { attendanceThresholds } from "@/lib/db/schema";

export const DEFAULT_THRESHOLD_PCT = 70;

export async function getAttendanceThresholdPct(programId: string): Promise<number> {
  const [row] = await getDb()
    .select({ pct70: attendanceThresholds.pct70 })
    .from(attendanceThresholds)
    .where(
      and(
        eq(attendanceThresholds.programId, programId),
        eq(attendanceThresholds.periodType, "yaumiy"),
      ),
    )
    .limit(1);
  return row?.pct70 != null ? Number(row.pct70) : DEFAULT_THRESHOLD_PCT;
}
