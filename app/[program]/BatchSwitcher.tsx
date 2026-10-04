import Link from "next/link";
import type { BatchSibling } from "@/lib/programs/families";
import type { ProgramBatch } from "@/lib/programs/batches";

/** One pill in a batch row. Server component — pure links, no client state. */
function BatchPill({
  href,
  current,
  title,
  children,
}: {
  href: string;
  current: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={current ? "page" : undefined}
      // Active = bronze outline on the gold tint (design 1c); the dark bronze
      // text #735F22 is the tint's readable pair and has no token of its own.
      className={`group rounded-full border px-3 py-1 text-12 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
        current
          ? "border-brand-bronze bg-brand-gold-tint font-bold text-[#735f22] dark:border-brand-gold dark:bg-accent dark:text-brand-gold"
          : "border-neutral-300 font-medium text-ink-muted hover:border-brand-bronze hover:text-foreground dark:border-neutral-700"
      }`}
    >
      {children}
    </Link>
  );
}

/** Halaqah count riding inside a pill; `group` on the pill lifts it when active. */
function Cacah({ n }: { n: number | null }) {
  if (n == null) return null;
  return (
    <span className="ml-1 text-11 font-medium tabular-nums opacity-70 group-aria-[current=page]:opacity-80">
      {n}
    </span>
  );
}

/**
 * Batch switcher across sibling *programs*: one row per batch family member
 * (hits-regular / -jan / -apr). Rendered only when the family has >1 member.
 */
export function BatchSwitcher({
  siblings,
  page = "dashboard",
  semua,
}: {
  siblings: BatchSibling[];
  /** Halaman tujuan pil (peserta / pengajar / dashboard) — tetap di halaman yang sama saat ganti batch. */
  page?: string;
  /**
   * Bila diberikan, pil "Semua" ikut tampil (`?batch=semua`) dan `true` berarti
   * ia yang aktif. Dibiarkan `undefined` di dashboard, yang belum punya
   * gabungan lintas batch.
   */
  semua?: boolean;
}) {
  if (siblings.length < 2) return null;
  const me = siblings.find((s) => s.current)?.slug;
  // Cacah halaqah menempel di pil supaya "berapa halaqah tiap batch, berapa
  // seluruhnya" terjawab tanpa berpindah halaman. Hanya bila pemanggil memintanya.
  const adaCacah = siblings.every((s) => s.halaqahCount != null);
  const total = adaCacah ? siblings.reduce((n, s) => n + (s.halaqahCount ?? 0), 0) : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-12 font-medium text-ink-muted">Batch:</span>
      {semua !== undefined && me && (
        <BatchPill
          href={`/${me}/${page}?batch=semua`}
          current={semua}
          title={total == null ? undefined : `${total} halaqah di seluruh batch`}
        >
          Semua
          <Cacah n={total} />
        </BatchPill>
      )}
      {siblings.map((s) => (
        <BatchPill
          key={s.slug}
          href={`/${s.slug}/${page}`}
          current={s.current && !semua}
          title={s.halaqahCount == null ? undefined : `${s.halaqahCount} halaqah`}
        >
          {s.label}
          <Cacah n={s.halaqahCount ?? null} />
        </BatchPill>
      ))}
    </div>
  );
}

/**
 * Batch switcher *inside* one program: rolling-batch programs (config
 * .syncAllBatches, e.g. tafm-laz) mirror every upstream batch into a single
 * program row, so the batches are rows in halaqah_sync rather than sibling
 * slugs. Every batch gets an option, plus "Semua" for the combined view —
 * without it the dashboard could only ever show the one batch the program row
 * was pinned to.
 */
export function ProgramBatchSwitcher({
  program,
  batches,
  selected,
}: {
  program: string;
  batches: ProgramBatch[];
  /** null = "Semua" (every batch). */
  selected: number | null;
}) {
  if (batches.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-12 font-medium text-ink-muted">Batch:</span>
      <BatchPill href={`/${program}/dashboard?batch=semua`} current={selected == null}>
        Semua
      </BatchPill>
      {batches.map((b) => (
        <BatchPill
          key={b.id}
          href={`/${program}/dashboard?batch=${b.id}`}
          current={selected === b.id}
          title={`${b.halaqahCount} halaqah`}
        >
          {b.label}
        </BatchPill>
      ))}
    </div>
  );
}
