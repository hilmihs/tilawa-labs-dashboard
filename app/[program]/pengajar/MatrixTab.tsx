/**
 * "Matrix skill" — the Maahir scorecard for the pengajar of this batch.
 *
 * Rendering rules that this file exists to hold:
 *   - a `null` score prints as a dash, never as 0. Hafalan is null for 177 of
 *     178 pengajar in the 3 Sep capture; zeroes there would read as a cohort
 *     that failed everything;
 *   - the category averages come from upstream and are shown as received;
 *   - `ranking` is a position across the whole of HITS, not inside this batch,
 *     and the header says so rather than letting the column imply otherwise;
 *   - a stale snapshot is labelled, not silently served as current.
 */
import { EmptyState } from "@/components/ui/empty-state";
import { KpiStrip, type KpiItem } from "@/components/ui/kpi-strip";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { toneBadgeClass } from "@/lib/ui/status";
import { cn } from "@/lib/utils";
import type { MatrixData } from "./queries";
import {
  KELOMPOK_KOMPONEN,
  ditarikLabel,
  formatSkor,
  labelBulan,
  nilaiKomponen,
  skorTone,
  tanggalSnapshot,
  type MatrixRow,
} from "./view-model";

function Skor({ nilai }: { nilai: number | null }) {
  return (
    <span
      className={cn(
        "inline-block min-w-[2.25rem] rounded px-1.5 py-0.5 text-center text-xs tabular-nums",
        toneBadgeClass[skorTone(nilai)],
      )}
    >
      {formatSkor(nilai)}
    </span>
  );
}

function Baris({ row }: { row: MatrixRow }) {
  return (
    <TR>
      <TD className="font-medium">
        {row.nama}
        {!row.active && (
          <span className="ml-2 text-xs font-normal text-neutral-400">nonaktif</span>
        )}
        <span className="block text-xs font-normal text-ink-muted">{row.kelompok}</span>
      </TD>
      <TD className="text-right tabular-nums">{row.halaqahDiBatch}</TD>
      {KELOMPOK_KOMPONEN.map((k) => (
        <TD key={k.judul} className="text-center">
          <Skor nilai={nilaiKomponen(row.skor, k.rata)} />
        </TD>
      ))}
      <TD className="text-center">
        <Skor nilai={row.rataKeseluruhan} />
      </TD>
      <TD className="text-right tabular-nums">{row.ranking ?? "—"}</TD>
      <TD className="text-right tabular-nums">
        {row.teguranKumulatif == null ? (
          "—"
        ) : row.teguranKumulatif > 0 ? (
          <span className="text-amber-600">{row.teguranKumulatif}</span>
        ) : (
          0
        )}
      </TD>
    </TR>
  );
}

export function MatrixTab({
  program,
  data,
  bulan,
  pilihan,
}: {
  program: string;
  data: MatrixData;
  bulan: string;
  pilihan: string[];
}) {
  const picker = (
    <div className="flex flex-wrap items-center gap-2">
      {pilihan.map((b) => (
        <a
          key={b}
          href={`/${program}/pengajar?bulan=${b}`}
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs",
            b === bulan
              ? "border-neutral-900 font-medium dark:border-neutral-100"
              : "border-neutral-200 text-ink-muted hover:text-neutral-900 dark:border-neutral-800 dark:hover:text-neutral-100",
          )}
        >
          {labelBulan(b)}
        </a>
      ))}
    </div>
  );

  const shell = (children: React.ReactNode) => (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Matrix skill</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Rapor pengajar dari Maahir. Angkanya diambil jadi, tidak dihitung ulang di sini.{" "}
            {/* Kolom Pedagogis di tabel ini adalah rata-rata snapshot upstream.
                Rubrik mentahnya — empat skor per pengajar per bulan, plus siapa
                yang belum dinilai sama sekali — ada di Inspeksi. */}
            <a
              href={`/${program}/inspeksi`}
              className="font-medium text-primary hover:underline"
            >
              Rincian rubrik pedagogis per pengajar →
            </a>
          </p>
        </div>
        {picker}
      </div>
      {children}
    </section>
  );

  if (data.state === "tanpa-pin") {
    return shell(
      <EmptyState
        title="Batch Maahir belum dipin"
        description="Program ini belum punya config.maahirHitsBatchId, jadi pengajarnya tidak bisa dipisahkan dari batch lain. Jalankan scripts/pin-maahir-batches.ts."
      />,
    );
  }
  if (data.state === "scope-ditolak") {
    return shell(
      <EmptyState
        title="Scope penilaian belum diberikan"
        description="API key Maahir menolak rekap/matrix-guru (403 forbidden_scope). Ini soal izin, bukan soal sync."
      />,
    );
  }
  if (data.state === "belum-ditarik") {
    return shell(
      <EmptyState
        title="Matrix bulan ini belum ditarik"
        description="Jalankan pnpm sync:maahir untuk mengisi rekap bulan ini. Kosong di sini berarti belum ditarik — bukan nilai nol."
      />,
    );
  }
  if (data.state === "mirror-kosong") {
    return shell(
      <EmptyState
        title="Halaqah batch ini belum tersinkron"
        description={`Mirror hits/halaqah tidak punya baris untuk batch ${data.batchIds.join(", ")}, jadi pengajarnya tidak bisa disaring.`}
      />,
    );
  }
  if (data.state === "belum-dihitung") {
    return shell(
      <EmptyState
        title="Snapshot belum dihitung untuk bulan ini"
        description={
          data.snapshotTerakhir
            ? `Maahir belum me-recompute matrix untuk periode ini. Snapshot terakhir: ${tanggalSnapshot(data.snapshotTerakhir)}.`
            : "Maahir belum pernah me-recompute matrix untuk periode ini."
        }
      />,
    );
  }

  const { view, ringkas } = { view: data.view, ringkas: data.view.ringkas };

  return shell(
    <>
      <p className="text-xs text-ink-muted">
        {data.periode ? `Periode ${data.periode}. ` : "Periode tidak tercatat di meta respons. "}
        Terakhir ditarik {ditarikLabel(data.fetchedAt)}
        {data.dariCache ? " (dari cache upstream)" : ""}.
        {data.basi && data.snapshotTerakhir
          ? ` Snapshot Maahir masih ${tanggalSnapshot(data.snapshotTerakhir)} — lebih tua dari akhir periode, jadi angkanya belum final.`
          : ""}
      </p>

      {view.rows.length === 0 ? (
        <EmptyState
          title="Tidak ada pengajar batch ini di snapshot"
          description={`Snapshot memuat ${view.totalUpstream} pengajar HITS, tapi tidak satu pun mengampu halaqah di batch program ini.`}
        />
      ) : (
        <>
          <KpiStrip
            items={[
              { label: "Pengajar batch ini", value: ringkas.pengajar },
              {
                label: "Sudah dinilai",
                value: ringkas.dinilai,
                hint: ringkas.belumDinilai > 0 ? `${ringkas.belumDinilai} belum dinilai` : undefined,
              },
              {
                label: "Rata-rata keseluruhan",
                value: formatSkor(ringkas.rataProgram),
                hint: `dari ${ringkas.dinilai} pengajar yang dinilai`,
              },
              // Teguran 0 adalah "tidak ada apa-apa"; sel itu keluar dari bar
              // daripada memakan seperempat lebarnya untuk mengatakannya.
              ...(ringkas.teguranKumulatif > 0
                ? [
                    {
                      label: "Teguran kumulatif",
                      value: ringkas.teguranKumulatif,
                      valueClassName: "text-amber-600 dark:text-amber-400",
                    } satisfies KpiItem,
                  ]
                : []),
            ]}
          />

          {ringkas.tidakDiSnapshot > 0 && (
            <p className="text-xs text-ink-muted">
              {ringkas.tidakDiSnapshot} pengajar batch ini tidak ada di snapshot sama sekali —
              mereka tidak ikut dipotret, bukan bernilai nol.
            </p>
          )}

          {/* Sepuluh kolom skor: biarkan lebar penuh, geser mendatar hanya saat
              perlu, dan pertahankan judul kolom saat baris di-scroll. */}
          <TableWrap className="max-h-[70vh] overflow-auto">
            <Table className="min-w-[64rem]">
              <THead className="sticky top-0 z-10">
                <TR>
                  <TH>Pengajar</TH>
                  <TH className="text-right">Halaqah</TH>
                  {KELOMPOK_KOMPONEN.map((k) => (
                    <TH key={k.judul} className="text-center">
                      {k.judul}
                    </TH>
                  ))}
                  <TH className="text-center">Keseluruhan</TH>
                  <TH className="text-right">Ranking se-HITS</TH>
                  <TH className="text-right">Teguran kum.</TH>
                </TR>
              </THead>
              <TBody>
                {view.rows.map((r) => (
                  <Baris key={r.pengajarId} row={r} />
                ))}
              </TBody>
            </Table>
          </TableWrap>

          <p className="text-xs text-neutral-400">
            Tanda &ldquo;—&rdquo; berarti belum dinilai, bukan nilai nol. Ranking adalah peringkat
            lintas seluruh HITS ({view.totalUpstream} pengajar), bukan peringkat di dalam batch ini.
          </p>
        </>
      )}
    </>,
  );
}
