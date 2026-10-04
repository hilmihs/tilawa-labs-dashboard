/**
 * Potongan UI bersama untuk daftar lintas program (/peserta, /kelas, /pengajar):
 * kotak angka, chip saringan, dan pager. Server component — tanpa 'use client'.
 */
import Link from "next/link";
import { LABEL_STATUS, type StatusKelas } from "@/lib/kelas/status";
import { qs, type TabStatus } from "@/lib/lintas/saringan";
import { toneBadgeClass } from "@/lib/ui/status";

const NUM = new Intl.NumberFormat("id-ID");

export function KotakAngka({ items }: { items: { label: string; nilai: number; catatan?: string }[] }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="rounded-lg border border-border p-4">
          <div className="cap text-[10px] font-semibold text-neutral-400">{k.label}</div>
          <div className="mt-1 text-[28px] font-bold leading-none tabular-nums">{NUM.format(k.nilai)}</div>
          {k.catatan && <div className="mt-1.5 text-xs text-neutral-500">{k.catatan}</div>}
        </div>
      ))}
    </section>
  );
}

export function Chip({
  href,
  aktif,
  label,
  n,
  peringatan,
}: {
  href: string;
  aktif: boolean;
  label: string;
  n?: number;
  peringatan?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={aktif ? "true" : undefined}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        aktif
          ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
          : "border-border text-neutral-600 hover:border-neutral-400 dark:text-neutral-300"
      }`}
    >
      {label}
      {n != null && (
        <>
          {" "}
          <span className={`font-mono tabular-nums ${peringatan && n > 0 && !aktif ? "text-amber-600" : "text-neutral-400"}`}>
            {NUM.format(n)}
          </span>
        </>
      )}
    </Link>
  );
}

export function Pager({ hal, jumlahHal, href }: { hal: number; jumlahHal: number; href: (hal: number) => string }) {
  if (jumlahHal <= 1) return null;
  const tombol = "rounded-lg border border-border px-3 py-1.5 text-xs";
  return (
    <nav aria-label="Halaman" className="flex items-center justify-between gap-2 text-xs text-neutral-500">
      {hal > 1 ? (
        <Link href={href(hal - 1)} className={`${tombol} hover:border-neutral-400`}>
          ← Sebelumnya
        </Link>
      ) : (
        <span className={`${tombol} opacity-40`}>← Sebelumnya</span>
      )}
      <span>
        Halaman {hal} dari {jumlahHal}
      </span>
      {hal < jumlahHal ? (
        <Link href={href(hal + 1)} className={`${tombol} hover:border-neutral-400`}>
          Berikutnya →
        </Link>
      ) : (
        <span className={`${tombol} opacity-40`}>Berikutnya →</span>
      )}
    </nav>
  );
}

export const inputKelas = "h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground";
export const labelKelas = "flex flex-col gap-1 text-xs text-neutral-500";
export const tombolUtama =
  "h-9 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";
export const tombolGaris =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white";

export function warnaHadir(h: number | null, ambang = 70): string {
  if (h == null) return "text-neutral-400";
  return h < ambang ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400";
}

/**
 * Tab Berjalan · Selesai · Semua untuk /peserta dan /kelas (tautan, satu URL per
 * tab). Berjalan = bawaan, sama dengan angka di Beranda. Halaman kembali ke 1.
 */
export function TabStatusNav({
  dasar,
  saring,
  aktif,
  n,
  satuan,
}: {
  dasar: string;
  saring: Record<string, string | number | undefined>;
  aktif: TabStatus | undefined;
  n: { berjalan: number; selesai: number; semua: number };
  satuan: string;
}) {
  const tab: { nilai: TabStatus | undefined; label: string; jumlah: number }[] = [
    { nilai: undefined, label: "Berjalan", jumlah: n.berjalan },
    { nilai: "selesai", label: "Selesai", jumlah: n.selesai },
    { nilai: "semua", label: "Semua", jumlah: n.semua },
  ];
  return (
    <nav aria-label={`Status ${satuan}`} className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
      {tab.map((t) => {
        const on = aktif === t.nilai;
        return (
          <Link
            key={t.label}
            href={`${dasar}${qs(saring, { status: t.nilai, hal: undefined })}`}
            aria-current={on ? "page" : undefined}
            className={`-mb-px flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors ${
              on
                ? "border-brand-bronze font-semibold text-foreground dark:border-brand-gold"
                : "border-transparent text-ink-muted hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="font-mono text-xs tabular-nums text-ink-faint">{NUM.format(t.jumlah)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tglPendek = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN_PENDEK[Number(m) - 1]}`;
};

/** Badge kecil untuk kelas yang sudah tamat / belum mulai; kelas berjalan tanpa badge. */
export function BadgeStatus({ status, akhir }: { status: StatusKelas; akhir: string | null }) {
  if (status === "berjalan") return null;
  return (
    <span
      className={`ml-1.5 inline-block rounded-full px-1.5 py-px align-middle text-[11px] ${
        status === "selesai" ? toneBadgeClass.neutral : toneBadgeClass.info
      }`}
    >
      {LABEL_STATUS[status]}
      {status === "selesai" && akhir ? ` · ${tglPendek(akhir)}` : ""}
    </span>
  );
}
