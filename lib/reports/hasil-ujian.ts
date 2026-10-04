/**
 * Data tab "Hasil Ujian" laporan bulanan: nilai Evaluasi Halaqah Maahir untuk
 * semua batch dalam scope (Gabungan = Jan/Apr/Jun sekaligus) dibatasi periode,
 * plus pertemuan ujian CMS tilawah yang tanggalnya jatuh di rentang itu.
 * Dua sumber tidak dicampur: tilawah mencatat jumlah lahn, Maahir skor 0–100.
 * Spec: docs/superpowers/specs/2026-10-01-hasil-ujian-laporan-design.md.
 */
import { loadEvaluasi, type UjianRingkas } from "@/lib/insights/evaluasi";
import { loadEvaluasiMaahir, type EvaluasiMaahirData } from "@/lib/insights/evaluasi/maahir";
import type { ReportScope } from "@/lib/reports/scope";

export type UjianTilawahBaris = UjianRingkas & { batch: string };

export type HasilUjianLaporan = {
  start: string;
  end: string;
  /** "Juni 2026" / "Semua batch". */
  label: string;
  programName: string;
  maahir: EvaluasiMaahirData;
  ujianTilawah: UjianTilawahBaris[];
};

export async function getHasilUjianLaporan(scope: ReportScope, start: string, end: string): Promise<HasilUjianLaporan> {
  const maahir = await loadEvaluasiMaahir(
    scope.members.map((m) => m.slug),
    scope.programIds,
    { dari: start, sampai: end },
  );
  const ujianTilawah: UjianTilawahBaris[] = [];
  for (const m of scope.members) {
    const d = await loadEvaluasi(m.slug);
    for (const u of d?.ujian ?? []) {
      if (u.tanggal && u.tanggal >= start && u.tanggal <= end) ujianTilawah.push({ ...u, batch: m.label });
    }
  }
  ujianTilawah.sort((a, b) => (a.tanggal ?? "").localeCompare(b.tanggal ?? ""));
  return { start, end, label: scope.label, programName: scope.programName, maahir, ujianTilawah };
}
