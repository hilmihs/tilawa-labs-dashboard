import { Fragment } from "react";
import { getScorecardCAT, SUB_LABEL, type Subdivision } from "@/lib/scorecard/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableWrap, THead } from "@/components/ui/table";
import { fmtPct, fmtValue } from "./format";
import { PctBar, ProblemDot, ScorecardLegend } from "./ui";

/**
 * The top-level CAT scorecard — the four BSC perspective bands, each with its
 * KPI rows. "Ach" is rolled up from the OYP KPIs carrying the same CAT code;
 * "Sheet" is the figure typed into the spreadsheet, kept side by side because
 * the two disagree wherever the workbook statuses are stale. A KPI with no OYP
 * children (e.g. "Progres Standarisasi") keeps its own figure. The two
 * achievement figures are grouped under Realisasi / Outlook so the twin "%Ach"
 * columns can't be confused; problem/corrective/PIC live in the drill-down.
 */
export async function ScorecardCAT({
  periodId,
  targetLabel,
}: {
  periodId: string;
  targetLabel: string;
}) {
  const groups = await getScorecardCAT(periodId);

  if (groups.length === 0) {
    return (
      <EmptyState
        title="Belum ada data CAT untuk periode ini"
        description="Setelah baris CAT terisi, tabel ini menampilkan empat perspektif BSC beserta target, realisasi, dan outlook tiap KPI. Isi lewat Kelola, atau seed ulang dari spreadsheet."
      />
    );
  }

  // `THead sticky` menempelkan KEDUA baris kepala sekaligus (satu blok thead),
  // jadi kelas th-nya tidak perlu offset per baris lagi.
  const thBase = "px-3 py-2 font-medium";
  const thTop = thBase;
  const thSub = thBase;

  return (
    <>
      <ScorecardLegend />
      {/* `maxHeight` yang memberi kepala tabel scrollport untuk ditempeli —
          pembungkus setinggi isinya tidak pernah menggulir vertikal. */}
      <TableWrap maxHeight="calc(100vh - 14rem)" className="shadow-sm">
        <Table className="min-w-[60rem] border-collapse">
          <THead sticky className="text-11 uppercase tracking-wide text-ink-muted">
            <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
              <th rowSpan={2} className={`${thTop} align-bottom`}>Sasaran Strategis</th>
              <th rowSpan={2} className={`${thTop} align-bottom`}>KPI</th>
              <th rowSpan={2} className={`${thTop} align-bottom`}>UOM</th>
              <th rowSpan={2} className={`${thTop} text-right align-bottom`}>Target</th>
              <th rowSpan={2} className={`${thTop} text-right align-bottom`}>Bobot</th>
              <th colSpan={4} className={`${thTop} border-l border-neutral-200 text-center dark:border-neutral-800`}>
                Realisasi
              </th>
              <th colSpan={2} className={`${thTop} border-l border-neutral-200 text-center dark:border-neutral-800`}>
                Outlook (Proyeksi Thn)
              </th>
            </tr>
            <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
              <th className={`${thSub} border-l border-neutral-200 text-right dark:border-neutral-800`}>{targetLabel}</th>
              <th className={`${thSub} text-right`}>Ach</th>
              <th className={`${thSub} text-right`}>Sheet</th>
              <th className={`${thSub} text-right`}>%Ach</th>
              <th className={`${thSub} border-l border-neutral-200 text-right dark:border-neutral-800`}>Outlook</th>
              <th className={`${thSub} text-right`}>%Ach</th>
            </tr>
          </THead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.perspective}>
                <tr>
                  <td
                    colSpan={11}
                    className="border-y border-blue-100 bg-blue-50/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700 dark:border-blue-950 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    {g.label}
                  </td>
                </tr>
                {g.kpis.map((k) => {
                  const hasNotes = !!(k.problem || k.corrective || k.pic);
                  return (
                    <Fragment key={k.id}>
                      <tr className="align-top transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                        <td className="px-3 py-2.5 text-ink-muted">
                          {k.catName ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 font-medium">
                          {k.name}
                          {k.catCode ? (
                            <span className="ml-1 text-xs font-normal text-ink-faint">{k.catCode}</span>
                          ) : null}
                          <ProblemDot has={hasNotes} />
                        </td>
                        <td className="px-3 py-2.5 text-ink-muted">{k.uom ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmtValue(k.target, k.uom)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                          {fmtPct(k.weight)}
                        </td>
                        <td className="border-l border-neutral-100 px-3 py-2.5 text-right tabular-nums dark:border-neutral-800/60">
                          {fmtValue(k.targetPeriod, k.uom)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {fmtValue(k.ach, k.uom)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-faint">
                          {fmtValue(k.cat.seed, k.uom)}
                          {/* Penanda mutu data, bukan error: sheet dan akumulasi
                              OYP memang sering beda selama status workbook belum
                              diperbarui. Warna netral supaya tidak terbaca
                              sebagai kegagalan. */}
                          {k.cat.diverges ? (
                            <span
                              className="ml-1 rounded border border-neutral-300 px-1 text-11 font-normal text-ink-muted dark:border-neutral-700 dark:text-neutral-400"
                              title="Angka sheet berbeda dari akumulasi OYP — penanda mutu data, bukan kesalahan hitung"
                            >
                              ≠ sheet
                            </span>
                          ) : null}
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
                      {k.cat.children.length > 0 || hasNotes ? (
                        <tr className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                          <td colSpan={11} className="px-3 pb-2.5">
                            {k.cat.children.length > 0 ? (
                              <details className="text-xs text-ink-muted">
                                <summary className="cursor-pointer select-none text-ink-muted hover:text-neutral-800 dark:hover:text-neutral-200">
                                  {k.cat.children.length} KPI OYP menyumbang Ach {fmtValue(k.cat.auto, k.uom)}
                                </summary>
                                <ul className="mt-1 space-y-0.5 pl-4">
                                  {k.cat.children.map((c) => (
                                    <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                                      <span className="font-medium tabular-nums">
                                        {fmtValue(c.ach, c.uom)}
                                      </span>
                                      <span className="text-ink-faint">
                                        {SUB_LABEL[c.subdivision as Subdivision] ?? c.subdivision}
                                      </span>
                                      <span>{c.name}</span>
                                      {c.oypCode ? (
                                        <span className="text-ink-faint">{c.oypCode}</span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              <span className="text-xs text-ink-faint">
                                Tidak ada KPI OYP di bawah kode ini — angka diisi manual.
                              </span>
                            )}
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
                                    <dt className="font-medium text-ink-muted">Corrective Action</dt>
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
              </Fragment>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
