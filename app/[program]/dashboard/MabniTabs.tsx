import Link from "next/link";

export type MabniTab = "kehadiran" | "setoran" | "pengajar";

/**
 * Section tabs for the mabni dashboard. Same shape the old HKM tabs had — server
 * component, active tab read from the URL (?tab=) so each tab is its own
 * cacheable request and an unopened tab costs no query.
 */
export function MabniTabs({ program, tab }: { program: string; tab: MabniTab }) {
  const tabs: { key: MabniTab; label: string; href: string }[] = [
    { key: "kehadiran", label: "Kehadiran", href: `/${program}/dashboard` },
    { key: "setoran", label: "Setoran", href: `/${program}/dashboard?tab=setoran` },
    { key: "pengajar", label: "Pengajar", href: `/${program}/dashboard?tab=pengajar` },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700 dark:text-blue-300"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
