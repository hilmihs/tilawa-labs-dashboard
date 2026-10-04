"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GenderFilter, KelasRingkas } from "./view-model";

/** All filters live in the URL so the RSC re-renders with the new slice and a
 *  coordinator can paste a link to one class. */
function useSetParams() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (next: Record<string, string | null>) => {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
}

/**
 * Period + gender.
 *
 * The period options are labelled "Bulan berjalan"/"Bulan lalu" and NOT with a
 * month name on purpose: only two months are ever pulled, and the window a month
 * stands for is upstream's 28→27, not the calendar month. The heading shows the
 * real window from `meta` — see `periodLabel()`. Naming the button "Agustus"
 * would quietly promise 1–31 Aug.
 */
export function KehadiranFilters({
  bulan,
  bulanBerjalan,
  bulanLalu,
  gender,
}: {
  bulan: string;
  bulanBerjalan: string;
  bulanLalu: string;
  gender: GenderFilter;
}) {
  const setParams = useSetParams();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        size="sm"
        value={bulan}
        onChange={(v) => setParams({ bulan: v, kelas: null })}
        options={[
          { value: bulanBerjalan, label: "Bulan berjalan" },
          { value: bulanLalu, label: "Bulan lalu" },
        ]}
      />
      <SegmentedControl
        size="sm"
        value={gender}
        // The selected class may belong to the gender being filtered out, so the
        // pin is dropped and the server picks the first class of the new slice.
        onChange={(v) => setParams({ gender: v === "semua" ? null : v, kelas: null })}
        options={[
          { value: "semua", label: "Semua" },
          { value: "ikhwan", label: "Ikhwan" },
          { value: "akhwat", label: "Akhwat" },
        ]}
      />
    </div>
  );
}

/** Class picker: one chip per class, carrying the `belumDiisi` badge so the
 *  classes that still owe presensi are visible without opening each one. */
export function KelasPicker({
  kelas,
  terpilih,
}: {
  kelas: KelasRingkas[];
  terpilih: string | null;
}) {
  const setParams = useSetParams();
  return (
    <div className="flex flex-wrap gap-1.5">
      {kelas.map((k) => {
        const aktif = k.kelasId === terpilih;
        return (
          <button
            key={k.kelasId}
            type="button"
            onClick={() => setParams({ kelas: k.kelasId })}
            title={`${k.kelasName} · ${k.gender} · ${k.jadwalHari.join(", ") || "jadwal belum diisi"} · ${k.jumlahAnggota} anggota`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
              aktif
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-200 text-neutral-600 hover:border-neutral-400 dark:border-neutral-800 dark:text-neutral-400",
            )}
          >
            <span className="font-medium">{k.kelasName}</span>
            <span className={cn("tabular-nums", aktif ? "opacity-70" : "text-neutral-400")}>
              {k.jumlahAnggota}
            </span>
            {k.belumDiisi > 0 && (
              <Badge tone="warning" className="px-1.5 py-0 text-[10px]">
                {k.belumDiisi} belum
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
