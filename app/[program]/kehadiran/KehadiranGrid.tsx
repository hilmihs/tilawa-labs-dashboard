import Link from "next/link";
import { cn } from "@/lib/utils";
import { toneBadgeClass, type StatusTone } from "@/lib/ui/status";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import type { MaahirKehadiranKode } from "@/lib/maahir/types";
import { persenLabel, type Grid, type GridSel } from "./view-model";

/** Code → tone. `S` gets its own tone because sakit is excluded from the
 *  attendance denominator upstream (docs §9) — reading it as a plain izin would
 *  hide why a member's percentage did not move. */
const KODE_TONE: Record<MaahirKehadiranKode, StatusTone> = {
  H: "success",
  T: "warning",
  I: "info",
  S: "teal",
  A: "danger",
};

const KODE_NAMA: Record<MaahirKehadiranKode, string> = {
  H: "Hadir",
  I: "Izin",
  S: "Sakit",
  A: "Alpa",
  T: "Terlambat",
};

/**
 * One cell. Three states, kept visually distinct because they mean three
 * different things to whoever has to chase them (see view-model.ts):
 *   code  — presensi filled;
 *   "-"   — the session happened, presensi still empty (upstream's own marker);
 *   null  — no presensi row for this member at all.
 */
function Sel({ sel, kolomLabel }: { sel: GridSel; kolomLabel: string }) {
  if (sel.kode == null || sel.kode === "-") {
    const belum = sel.kode === "-";
    return (
      <span
        title={`${kolomLabel} · ${belum ? "presensi belum diisi" : "tidak ada baris presensi"}`}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-md text-xs",
          belum
            ? "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
            : "text-neutral-300 dark:text-neutral-700",
        )}
      >
        {belum ? "–" : "·"}
      </span>
    );
  }
  const kode = sel.kode;
  const catatan = sel.catatan ? ` · ${sel.catatan}` : "";
  return (
    <span
      title={`${kolomLabel} · ${KODE_NAMA[kode]}${catatan}`}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md text-xs font-medium",
        toneBadgeClass[KODE_TONE[kode]],
        // A note attached to the cell is the only reason a coordinator opens
        // this grid at all, so mark the cells that carry one.
        sel.catatan && "ring-1 ring-neutral-400/60 dark:ring-neutral-500/60",
      )}
    >
      {kode}
    </span>
  );
}

export function KehadiranLegend() {
  const items: MaahirKehadiranKode[] = ["H", "T", "I", "S", "A"];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
      {items.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex size-4 items-center justify-center rounded text-[10px] font-medium",
              toneBadgeClass[KODE_TONE[k]],
            )}
          >
            {k}
          </span>
          {KODE_NAMA[k]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex size-4 items-center justify-center rounded bg-neutral-100 text-[10px] text-neutral-400 dark:bg-neutral-800">
          –
        </span>
        Presensi belum diisi
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex size-4 items-center justify-center text-[10px] text-neutral-300 dark:text-neutral-700">
          ·
        </span>
        Tidak ada baris
      </span>
      <span className="text-neutral-400">Sel bergaris = ada catatan (arahkan kursor)</span>
    </div>
  );
}

/**
 * Anggota × pertemuan grid. A class can run 23 meetings in one window, so the
 * table scrolls horizontally INSIDE `TableWrap` and the name column is sticky;
 * the page itself must never scroll sideways.
 */
export function KehadiranGrid({ grid, program }: { grid: Grid; program: string }) {
  const stickyHead =
    "sticky left-0 z-20 bg-neutral-50 dark:bg-neutral-900";
  const stickyCell = "sticky left-0 z-10 bg-card";

  return (
    <TableWrap>
      <Table className="min-w-max">
        <THead>
          <TR>
            <TH className={cn(stickyHead, "min-w-[190px]")}>Anggota</TH>
            {grid.kolom.map((k) => (
              <TH key={k.pertemuanId} className="px-1 text-center font-normal">
                <span className="block whitespace-nowrap text-[11px] text-neutral-600 dark:text-neutral-400">
                  {k.tanggalLabel}
                </span>
                {k.tampilkanProgram && (
                  <span
                    className="block whitespace-nowrap text-[10px] text-neutral-400"
                    title={k.programLabel}
                  >
                    {k.programLabel}
                  </span>
                )}
              </TH>
            ))}
            <TH className="text-right">H/I/S/A/T</TH>
            <TH className="text-right">% Hadir</TH>
          </TR>
        </THead>
        <TBody>
          {grid.baris.map((b) => (
            <TR key={b.anggotaId}>
              <TD className={cn(stickyCell, "font-medium")}>
                <Link
                  href={`/${program}/peserta/${encodeURIComponent(b.anggotaId)}`}
                  className="whitespace-nowrap underline-offset-2 hover:underline"
                >
                  {b.nama}
                </Link>
                {b.peran && (
                  <span className="ml-1.5 text-[10px] font-normal text-neutral-400">
                    {b.peran}
                  </span>
                )}
                {b.keterangan && (
                  <span
                    className="block max-w-[220px] truncate text-[11px] font-normal text-neutral-400"
                    title={b.keterangan}
                  >
                    {b.keterangan}
                  </span>
                )}
              </TD>
              {b.sel.map((s, i) => (
                <TD key={s.pertemuanId} className="px-1 text-center">
                  <Sel
                    sel={s}
                    kolomLabel={`${b.nama} · ${grid.kolom[i]?.tanggalLabel ?? ""}`}
                  />
                </TD>
              ))}
              <TD className="whitespace-nowrap text-right font-mono text-xs tabular-nums text-neutral-500">
                {b.totals.H}/{b.totals.I}/{b.totals.S}/{b.totals.A}/{b.totals.T}
              </TD>
              {/* null stays "—": upstream had no denominator for this member,
                  which is not the same as 0% (docs §9, mid-period joiners). No
                  colour threshold here — the target lives in the laporan
                  benchmark, not in this payload, so inventing one would state a
                  rule Maahir never set. */}
              <TD className="text-right tabular-nums">{persenLabel(b.persenHadir)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}
