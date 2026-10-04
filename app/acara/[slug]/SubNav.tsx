"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sub-nav lokal modul acara, dikelompokkan mengikuti hidup acara (design a2):
 * Persiapan · Hari-H · Pasca. Panitia/Jobdesk/Timeline belum punya halaman
 * staff sendiri (isinya ada di papan divisi), jadi tidak ditautkan.
 */
const GRUP = [
  { label: "Persiapan", items: [["", "Ringkasan"], ["/tugas", "Tugas"], ["/barang", "Barang"], ["/pendaftaran", "Pendaftaran"]] },
  { label: "Hari-H", items: [["/hadir", "Hadir"], ["/scan", "Scan"]] },
  { label: "Pasca", items: [["penilaian", "Penilaian panitia"]] },
] as const;

export function SubNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/acara/${slug}`;
  return (
    <nav className="mb-5 flex flex-wrap items-end gap-x-5 gap-y-1 border-b border-neutral-200 dark:border-neutral-800">
      {GRUP.map((g) => (
        <div key={g.label} className="flex flex-col">
          <span className="px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</span>
          <div className="flex flex-wrap gap-1">
            {g.items.map(([suffix, label]) => {
              // "penilaian" hidup di /penilaian/[slug], di luar modul acara.
              const href = suffix === "penilaian" ? `/penilaian/${slug}` : base + suffix;
              const active = suffix === "" ? path === base : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`-mb-px border-b-2 px-3 py-2 text-12 ${active ? "border-neutral-900 font-semibold dark:border-neutral-100" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
