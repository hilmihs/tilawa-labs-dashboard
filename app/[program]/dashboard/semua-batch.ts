import { getHalaqahList, type HalaqahRow } from "@/lib/insights/halaqah";
import { getBatchSiblings, type BatchSibling } from "@/lib/programs/families";
import { getDashboardData, summarizeSegments, type DashboardData } from "./queries";

/**
 * Monitoring Kehadiran untuk seluruh batch sekeluarga (`?batch=semua` pada
 * hits-regular / -apr / -jan). Tiga baris `programs` yang terpisah, jadi data
 * tiap saudara dibaca pada lingkup default-nya masing-masing lalu disatukan:
 * roster digabung, ringkasan per kelas dihitung ulang dari roster gabungan
 * (bukan dijumlah dari ringkasan per batch — rata-rata tidak bisa dijumlah),
 * dan tiap halaqah dicap program asalnya supaya tautannya benar.
 *
 * Ambang dan segmentasi memakai milik program yang sedang dibuka — satu
 * keluarga memang berbagi keduanya.
 */
export async function getDashboardSemuaBatch(
  slug: string,
  siblings: BatchSibling[],
): Promise<{ data: DashboardData; halaqahList: HalaqahRow[] } | null> {
  if (siblings.length < 2) return null;
  const meIdx = siblings.findIndex((s) => s.current);
  if (meIdx < 0) return null;
  const parts = await Promise.all(
    siblings.map(async (s) => ({
      s,
      data: await getDashboardData(s.slug),
      halaqah: await getHalaqahList(s.slug),
    })),
  );
  const me = parts[meIdx].data;
  const students = parts.flatMap((p) => p.data.students);
  const data: DashboardData = {
    hasSyncData: parts.some((p) => p.data.hasSyncData),
    rosterCount: parts.reduce((n, p) => n + p.data.rosterCount, 0),
    belumDitempatkan: parts.reduce((n, p) => n + p.data.belumDitempatkan, 0),
    thresholdPct: me.thresholdPct,
    segmentation: me.segmentation,
    segments: summarizeSegments(students, me.segmentation),
    students,
    marhalahOptions: [...new Set(parts.flatMap((p) => p.data.marhalahOptions))].sort(),
  };
  const halaqahList = parts.flatMap((p) =>
    p.halaqah.map((h) => ({ ...h, programSlug: p.s.slug, batch: p.s.label })),
  );
  return { data, halaqahList };
}
