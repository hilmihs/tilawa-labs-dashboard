"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented";

export type PeriodePilihan = "berjalan" | "lalu";

/**
 * Pemilih periode untuk /tibyan. Hanya dua opsi karena sync memang cuma menarik
 * dua bulan (bulan berjalan + bulan lalu, lihat `maahirRekapPulls`).
 *
 * Labelnya sengaja "Bulan berjalan" / "Bulan lalu" dan BUKAN nama bulan:
 * periode Maahir adalah jendela 28→27, jadi tombol bertuliskan "Agustus" akan
 * menjanjikan 1–31 Agustus padahal datanya 28 Jul–27 Agu. Nama periode yang
 * sebenarnya hanya boleh datang dari `meta.mulai`/`meta.sampai`, dan itu
 * dirender di sebelah angkanya oleh halaman.
 */
export function PeriodePicker({ value }: { value: PeriodePilihan }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <SegmentedControl
      size="sm"
      value={value}
      onChange={(v) => {
        const params = new URLSearchParams(search.toString());
        params.set("bulan", v);
        router.push(`${pathname}?${params.toString()}`);
      }}
      options={[
        { value: "berjalan", label: "Bulan berjalan" },
        { value: "lalu", label: "Bulan lalu" },
      ]}
    />
  );
}
