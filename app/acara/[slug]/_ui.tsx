import type { ReactNode } from "react";

export const rupiah = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `Rp ${n.toLocaleString("id-ID")}`;

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const tglPendek = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
};

export function PageHead({ title, right, children }: { title: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-20 font-bold tracking-[-0.01em]">{title}</h1>
        {children && <p className="text-12 text-muted-foreground">{children}</p>}
      </div>
      {right}
    </div>
  );
}

export const th = "px-3 py-2 text-left text-11 font-semibold uppercase tracking-wide text-muted-foreground";
export const td = "px-3 py-2 text-12 align-top";
export const tdNum = "px-3 py-2 text-12 text-right tabular-nums";
export const input = "rounded border border-neutral-300 px-2 py-1.5 text-12 dark:border-neutral-700 dark:bg-neutral-900";
export const btn = "rounded bg-neutral-900 px-3 py-1.5 text-12 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";
export const btnGhost = "rounded border border-neutral-300 px-3 py-1.5 text-12 dark:border-neutral-700";
