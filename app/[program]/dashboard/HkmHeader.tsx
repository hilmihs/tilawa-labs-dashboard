import Link from "next/link";
import { SyncBar } from "../SyncBar";
import { getLastSync, lastSyncLabel } from "@/lib/sync/last-sync";

/**
 * Head of the one HKM page. HKM has two feeds — presensi (tilawah, the paired
 * `presensiSlug` program) and setoran (the partner system/berkah) — that used to sit behind
 * two tabs and read as two programs. They are now two sections of one page,
 * with one sync bar that refreshes both (see triggerSync in ../actions.ts).
 *
 * The presensi screens with no setoran counterpart (roster by halaqah,
 * pengajar compliance, presensi worklist, attendance report) are linked here;
 * they still live under the paired slug because their data and routes do.
 */
export async function HkmHeader({
  program,
  name,
  presensiSlug,
}: {
  program: string;
  name: string;
  presensiSlug: string;
}) {
  const sync = lastSyncLabel(await getLastSync(program));
  const sections = [
    { label: "Presensi", href: "#presensi" },
    { label: "Setoran Tilawah", href: "#setoran" },
  ];
  const presensiLinks = [
    { label: "Peserta", href: `/${presensiSlug}/peserta` },
    { label: "Pengajar", href: `/${presensiSlug}/pengajar` },
    { label: "Tindak lanjut", href: `/${presensiSlug}/inbox` },
    { label: "Laporan", href: `/${presensiSlug}/report` },
  ];
  return (
    <header className="space-y-3 border-b border-border pb-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-20 font-bold tracking-[-0.01em]">{name}</h1>
          <p className="text-12 text-ink-muted">
            Presensi dari cms.tilawalabs.demo · setoran tilawah dari Nafi&apos;
            (HKM CMS).
          </p>
        </div>
        <SyncBar program={program} label={sync.text} tone={sync.tone} />
      </div>
      <nav aria-label="Bagian halaman" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-12">
        {sections.map((s) => (
          <a key={s.href} href={s.href} className="font-medium text-primary hover:underline">
            {s.label}
          </a>
        ))}
        <span aria-hidden className="text-neutral-300 dark:text-neutral-700">|</span>
        <span className="text-ink-faint">Rincian presensi:</span>
        {presensiLinks.map((l) => (
          <Link key={l.href} href={l.href} className="text-primary hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
