import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import {
  navLabel,
  LAYAR_NAV,
  SECTION_HINT,
  SECTION_ICON,
} from "@/components/shell/sections";
import type { OrgNode } from "@/lib/org/structure";

/**
 * Isi akar Organisasi khusus Beranda (`/`), dengan tampilan desain "Overhaul
 * Warna Logo" 1b: kartu putih bergaris hangat, sorot perunggu saat hover, ikon
 * Layar berwarna perunggu. Isi dan tautannya sama persis dengan
 * `app/overview/OrgCards.tsx` di akar (`root`, `basePath = []`) — kartu itu
 * tetap dipakai /overview; ubah aturan tautan/penyaringan di kedua tempat.
 * Server component — jangan beri 'use client', lihat catatan client-module 500.
 */
export function BerandaOrganisasi({ nodes }: { nodes: OrgNode[] }) {
  // Placeholders drop out of the card grid so they stop stretching to the
  // height of the data cards; they render as a muted footnote row instead.
  const live = nodes.filter((c) => !c.comingSoon);
  const soon = nodes.filter((c) => c.comingSoon);
  if (nodes.length === 0) {
    return <p className="text-sm text-ink-muted">Belum ada turunan.</p>;
  }
  return (
    <>
      {live.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((child) => (
            <KartuDivisi key={child.id} child={child} />
          ))}
        </div>
      )}

      {/* Layar dinding + formulir pengisinya — bukan dashboard program, jadi
          punya judul sendiri, sejajar dengan letaknya di rail. */}
      <section className="pt-1">
        <h2 className="cap text-11 font-bold text-ink-muted">Layar</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KARTU_LAYAR.map((item) => {
            const Icon = SECTION_ICON[item.key];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex h-full flex-col gap-1.5 rounded-[14px] border border-border bg-card p-4 text-card-foreground transition-colors hover:border-brand-bronze focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-brand-gold/60"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className="size-4 shrink-0 text-brand-bronze dark:text-brand-gold"
                    strokeWidth={1.8}
                  />
                  <span className="text-sm font-semibold">{navLabel(item)}</span>
                </div>
                {SECTION_HINT[item.key] && (
                  <p className="text-12 leading-[1.45] text-ink-muted">
                    {SECTION_HINT[item.key]}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {soon.length > 0 && (
        <section className="pt-1">
          <h2 className="cap text-11 font-bold text-ink-muted">Segera hadir</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {soon.map((child) => (
              <span
                key={child.id}
                title={child.hint}
                className="rounded-lg border border-dashed border-neutral-400/60 px-3 py-1.5 text-sm text-ink-muted dark:border-neutral-600"
              >
                {child.label}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Sama dengan OrgCards: arahanIsi & arahanRotasi tidak dijadikan kartu. */
const KARTU_LAYAR_SEMBUNYI = new Set(["arahanIsi", "arahanRotasi"]);
const KARTU_LAYAR = LAYAR_NAV.filter(
  (item) => !KARTU_LAYAR_SEMBUNYI.has(item.key),
);

const IKON =
  "size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-brand-bronze dark:text-neutral-500 dark:group-hover:text-brand-gold";

/**
 * Di akar semua kartu berlabel "divisi" (permintaan pemilik 28 Sep 2026);
 * bentuk node yang menentukan tautannya: program → dashboard, fitur → href,
 * unit → /overview/<id>.
 */
function KartuDivisi({ child }: { child: OrgNode }) {
  if (child.programSlug) {
    return (
      <Bingkai
        href={`/${child.programSlug}/dashboard`}
        label={child.label}
        icon={<ArrowUpRight className={IKON} />}
      />
    );
  }
  if (child.href) {
    return (
      <Bingkai href={child.href} label={child.label} icon={<ArrowUpRight className={IKON} />}>
        {child.hint && (
          <p className="mt-auto border-t border-border px-4 py-3 text-12 leading-snug text-ink-muted">
            {child.hint}
          </p>
        )}
      </Bingkai>
    );
  }
  return (
    <Bingkai
      href={`/overview/${child.id}`}
      label={child.label}
      icon={<ChevronRight className={IKON} />}
    />
  );
}

function Bingkai({
  href,
  label,
  icon,
  children,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-[14px] border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(46,65,61,0.06)] transition-[border-color,box-shadow] hover:border-brand-bronze hover:shadow-[0_4px_14px_rgba(46,65,61,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-brand-gold/60"
    >
      {/* Title block keeps a two-line slot so a row of cards lines up. */}
      <div className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="cap text-11 font-bold text-ink-muted">divisi</div>
          <div className="mt-1 line-clamp-2 min-h-[2.6em] text-16 font-bold leading-[1.3] tracking-[-0.01em]">
            {label}
          </div>
        </div>
        {icon}
      </div>
      {children}
    </Link>
  );
}
