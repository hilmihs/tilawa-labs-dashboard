import { Fragment } from "react";
import { getOyp, SUB_LABEL, type Subdivision } from "@/lib/scorecard/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableWrap, THead } from "@/components/ui/table";
import { fmtNum, fmtPct, fmtValue } from "./format";
import { PctBar, ProblemDot } from "./ui";

/**
 * One OYP sub-division (HITS / Kolaborasi / Maahir / DPQ). Each KPI's Ach /
 * Outlook is COMPUTED from its workbook items, shown in an expandable drill-down
 * (native <details>, no client JS). Realisasi / Outlook grouping mirrors the CAT
 * table; problem/corrective/PIC live in the drill-down.
 */
export async function OypTable({
  periodId,
  subdivision,
  targetLabel,
}: {
  periodId: string;
  subdivision: Exclude<Subdivision, "cat">;
  targetLabel: string;
}) {
  const kpis = await getOyp(periodId, subdivision);

  if (kpis.length === 0) {
    return (
      <EmptyState
        title={`Belum ada data ${SUB_LABEL[subdivision]} untuk periode ini`}
        description="Setelah KPI subdivisi ini terisi, tabel menampilkan target, realisasi, dan outlook tiap KPI beserta baris workbook penyusunnya. Tambahkan barisnya lewat Kelola."
      />
    );
  }

  // `THead sticky` menempelkan kedua baris kepala sekaligus.
  const thBase = "px-3 py-2 font-medium";
  const thTop = thBase;
  const thSub = thBase;

  return (
    // `maxHeight` memberi kepala tabel scrollport untuk ditempeli.
    <TableWrap maxHeight="calc(100vh - 14rem)" className="shadow-sm">
      <Table className="min-w-[56rem] border-collapse">
        <THead sticky className="text-11 uppercase tracking-wide text-ink-muted">
          <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
            <th rowSpan={2} className={`${thTop} align-bottom`}>KPI CAT</th>
            <th rowSpan={2} className={`${thTop} align-bottom`}>KPI OYP</th>
            <th rowSpan={2} className={`${thTop} align-bottom`}>UOM</th>
            <th rowSpan={2} className={`${thTop} text-right align-bottom`}>Target</th>
            <th rowSpan={2} className={`${thTop} text-right align-bottom`}>Bobot</th>
            <th colSpan={3} className={`${thTop} border-l border-neutral-200 text-center dark:border-neutral-800`}>
              Realisasi
            </th>
            <th colSpan={2} className={`${thTop} border-l border-neutral-200 text-center dark:border-neutral-800`}>
              Outlook (Proyeksi Thn)
            </th>
          </tr>
          <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
            <th className={`${thSub} border-l border-neutral-200 text-right dark:border-neutral-800`}>{targetLabel}</th>
            <th className={`${thSub} text-right`}>Ach</th>
            <th className={`${thSub} text-right`}>%Ach</th>
            <th className={`${thSub} border-l border-neutral-200 text-right dark:border-neutral-800`}>Outlook</th>
            <th className={`${thSub} text-right`}>%Ach</th>
          </tr>
        </THead>
        <tbody>
          {kpis.map((k) => {
            const hasNotes = !!(k.problem || k.corrective || k.pic);
            return (
              <Fragment key={k.id}>
                <tr className="align-top transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                  <td className="px-3 py-2.5 text-ink-muted">{k.catName ?? "—"}</td>
                  <td className="px-3 py-2.5 font-medium">
                    {k.name}
                    {k.oypCode ? (
                      <span className="ml-1 text-xs font-normal text-ink-faint">{k.oypCode}</span>
                    ) : null}
                    {!k.countsTowardCat ? (
                      <span className="ml-1 rounded bg-neutral-100 px-1 text-11 font-normal text-ink-muted dark:bg-neutral-800 dark:text-neutral-400">
                        di luar CAT
                      </span>
                    ) : null}
                    <ProblemDot has={hasNotes} />
                  </td>
                  <td className="px-3 py-2.5 text-ink-muted">{k.uom ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtValue(k.target, k.uom)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{fmtPct(k.weight)}</td>
                  <td className="border-l border-neutral-100 px-3 py-2.5 text-right tabular-nums dark:border-neutral-800/60">
                    {fmtValue(k.targetPeriod, k.uom)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {k.needsDenominator ? (
                      <span className="text-warn" title="Baris workbook belum punya pembagi">
                        — isi pembagi
                      </span>
                    ) : (
                      fmtValue(k.ach, k.uom)
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end">
                      <PctBar pct={k.pctAch} />
                    </div>
                  </td>
                  <td className="border-l border-neutral-100 px-3 py-2.5 text-right tabular-nums dark:border-neutral-800/60">
                    {fmtValue(k.outlook, k.uom)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end">
                      <PctBar pct={k.outlookPct} />
                    </div>
                  </td>
                </tr>
                {k.items.length > 0 || hasNotes ? (
                  <tr className="border-b border-neutral-100 dark:border-neutral-800/60">
                    <td colSpan={10} className="px-3 pb-2.5">
                      {k.items.length > 0 ? (
                        <details className="text-xs text-ink-muted">
                          <summary className="cursor-pointer select-none text-ink-muted hover:text-neutral-800 dark:hover:text-neutral-200">
                            {k.items.length} baris workbook ·{" "}
                            {k.uom === "%"
                              ? `Ach ${fmtValue(k.ach, k.uom)} = Σ pembilang / Σ pembagi`
                              : `Ach ${fmtValue(k.ach, k.uom)} = Σ Achieved`}
                          </summary>
                          <ul className="mt-1 space-y-0.5 pl-4">
                            {k.items.map((it) => (
                              <li key={it.id} className="flex flex-wrap items-baseline gap-x-2">
                                <span
                                  className={
                                    it.status === "achieved"
                                      ? "text-ok"
                                      : "text-warn"
                                  }
                                >
                                  {it.status === "achieved" ? "✓" : "◦"}
                                </span>
                                <span className="font-medium tabular-nums">
                                  {fmtNum(it.kuantitas)}
                                  {k.uom === "%" ? `/${fmtNum(it.pembagi)}` : ""}
                                </span>
                                <span>{it.detail ?? it.deskripsi ?? "—"}</span>
                                {it.hours != null && k.uom !== "Jam/Minggu" ? (
                                  <span className="text-ink-faint">({fmtNum(it.hours)} jam)</span>
                                ) : null}
                                {it.origin === "auto" ? (
                                  <span className="rounded bg-blue-50 px-1 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                                    otomatis
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      {hasNotes ? (
                        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                          {k.problem ? (
                            <div>
                              <dt className="font-medium text-red-600 dark:text-red-400">Problem</dt>
                              <dd className="text-ink-muted">{k.problem}</dd>
                            </div>
                          ) : null}
                          {k.corrective ? (
                            <div>
                              <dt className="font-medium text-ink-muted">Corrective</dt>
                              <dd className="text-ink-muted">{k.corrective}</dd>
                            </div>
                          ) : null}
                          {k.pic ? (
                            <div>
                              <dt className="font-medium text-ink-muted">PIC</dt>
                              <dd className="text-ink-muted">{k.pic}</dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
