"use client";

import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  SortTH,
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useTableSort,
  type SortAccessors,
} from "@/components/ui/table";
import type { StatusTone } from "@/lib/ui/status";
import {
  INSIDEN_STATUS_LABEL,
  PELANGGARAN_HINT,
  pctText,
  tanggalPendek,
  type DisiplinRow,
} from "./view-model";

// Module-level per the useTableSort contract: a fresh object every render would
// re-sort the whole table on each keystroke in the search box.
const ACCESSORS: SortAccessors<DisiplinRow> = {
  nama: (r) => r.nama,
  rank: (r) => r.rank,
  kbbs: (r) => r.pctKbbs,
  onTime: (r) => r.pctOnTime,
  stabil: (r) => r.pctStabil,
  kmt: (r) => r.kmt,
  kbla: (r) => r.kbla,
  jkg: (r) => r.jkg,
  tidakLatihan: (r) => r.tidakLatihan,
  hutang: (r) => r.hutangSaldo,
  laporan: (r) => r.cakupan?.persen ?? null,
  insiden: (r) => r.insiden.length,
};

/**
 * Columns that are routinely all-zero for a whole batch (KMT/KBLA/JKG/…): six
 * columns spending horizontal room to say "nothing happened". They are dropped
 * when EVERY row in the table is zero and brought back by the toggle — a column
 * with even one non-zero value is never hidden.
 *
 * The check runs over the full `rows` prop, not the filtered subset: recomputing
 * per keystroke would make columns appear and disappear while typing.
 */
const ZEROABLE: readonly { key: string; get: (r: DisiplinRow) => number }[] = [
  { key: "kmt", get: (r) => r.kmt },
  { key: "kbla", get: (r) => r.kbla },
  { key: "jkg", get: (r) => r.jkg },
  { key: "tidakLatihan", get: (r) => r.tidakLatihan },
  { key: "hutang", get: (r) => r.hutangSaldo },
  { key: "insiden", get: (r) => r.insiden.length },
];

/** Pengajar, Rank, KBBS, On-time, Stabil, Laporan — always rendered. */
const FIXED_COLS = 6;

/** Under 100% is the only thing worth colouring — a full month is the norm. */
function pctClass(pct: number | null): string {
  if (pct == null) return "text-neutral-400";
  if (pct >= 95) return "";
  if (pct >= 80) return "text-amber-600";
  return "font-semibold text-red-600";
}

function statusTone(status: DisiplinRow["insiden"][number]["status"]): StatusTone {
  if (status === "diputus") return "neutral";
  if (status === "nunggu_alasan") return "warning";
  return "info";
}

/** Zero shown grey, anything above it in amber — the point of the column. */
function Pelanggaran({ n }: { n: number }) {
  return n > 0 ? (
    <span className="font-medium text-amber-600">{n}</span>
  ) : (
    <span className="text-neutral-300 dark:text-neutral-600">0</span>
  );
}

/**
 * "100%" with the raw fraction inline as small muted text. Stacking the fraction
 * under the percentage doubled every row's height for a number that is context,
 * not the reading.
 */
function PctCell({ pct, sudah, total }: { pct: number | null; sudah: number; total: number }) {
  return (
    <TD className="whitespace-nowrap text-right tabular-nums">
      <span className={pctClass(pct)}>{pctText(pct)}</span>
      <span className="ml-1.5 text-[11px] text-neutral-400">
        {sudah}/{total}
      </span>
    </TD>
  );
}

function Detail({ row, cols }: { row: DisiplinRow; cols: number }) {
  return (
    <TR className="bg-neutral-50/70 dark:bg-neutral-900/40">
      <TD colSpan={cols} className="px-4 py-4">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Insiden tabayyun
              {row.insidenLuarBatch > 0 && (
                <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">
                  + {row.insidenLuarBatch} di halaqah batch lain (tidak ditampilkan di sini)
                </span>
              )}
            </div>
            {row.insiden.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">
                Tidak ada insiden pada halaqah batch ini di periode tersebut.
              </p>
            ) : (
              <ul className="mt-2 space-y-3">
                {row.insiden.map((i) => (
                  <li
                    key={i.keteranganId}
                    className="rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{tanggalPendek(i.tanggal)}</span>
                      <span className="text-neutral-500">
                        {i.halaqahName} · pertemuan {i.pertemuanNo}
                      </span>
                      <Badge tone={statusTone(i.status)}>{INSIDEN_STATUS_LABEL[i.status]}</Badge>
                      {i.dariIzin && <Badge tone="teal">dari izin</Badge>}
                      {i.isUdzurSyari === true && <Badge tone="success">udzur syar&apos;i</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {i.pelanggaran.map((p, idx) => (
                        <span
                          key={`${i.keteranganId}-${idx}`}
                          title={PELANGGARAN_HINT[p.jenis]}
                          className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800"
                        >
                          <span className="font-medium">{p.jenis}</span>
                          {p.detail ? (
                            <span className="text-neutral-500"> — {p.detail}</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                    <dl className="mt-2 space-y-1 text-sm">
                      {i.catatanKetua && (
                        <div>
                          <dt className="inline text-neutral-500">Catatan ketua: </dt>
                          <dd className="inline">{i.catatanKetua}</dd>
                        </div>
                      )}
                      {i.alasanPengajar ? (
                        <div>
                          <dt className="inline text-neutral-500">Alasan pengajar: </dt>
                          <dd className="inline">{i.alasanPengajar}</dd>
                        </div>
                      ) : (
                        <div className="text-neutral-400">Pengajar belum memberi alasan.</div>
                      )}
                      {i.keputusanCatatan && (
                        <div>
                          <dt className="inline text-neutral-500">Keputusan: </dt>
                          <dd className="inline">{i.keputusanCatatan}</dd>
                        </div>
                      )}
                      {i.decidedAt && (
                        <div className="text-xs text-neutral-400">
                          Diputus {tanggalPendek(i.decidedAt)}
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Laporan harian belum masuk ({row.laporanBelum.length})
              </div>
              {row.laporanBelum.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">
                  Semua pertemuan batch ini sudah berlaporan.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {row.laporanBelum.map((p) => (
                    <li key={`${p.halaqahName}-${p.tanggal}-${p.pertemuanNo}`}>
                      <span className="tabular-nums">{tanggalPendek(p.tanggal)}</span>
                      <span className="text-neutral-500">
                        {" "}
                        · {p.halaqahName} · pertemuan {p.pertemuanNo}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Hutang kelas ({row.hutang.length})
              </div>
              {row.hutang.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">Tidak ada hutang pada batch ini.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {row.hutang.map((h) => (
                    <li key={h.keterangan_id}>
                      <span className="tabular-nums">{tanggalPendek(h.tanggal)}</span>
                      <span className="text-neutral-500"> · {h.halaqahName} · </span>
                      <span title={PELANGGARAN_HINT[h.jenis]}>{h.jenis}</span>
                      <span className="text-neutral-500">
                        {" "}
                        · sisa {h.sisa} dari {h.debit} ({h.status})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </TD>
    </TR>
  );
}

export function DisiplinTable({ rows }: { rows: DisiplinRow[] }) {
  const [q, setQ] = useState("");
  const [gender, setGender] = useState<"all" | "ikhwan" | "akhwat">("all");
  const [hanyaMasalah, setHanyaMasalah] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [kolomKosong, setKolomKosong] = useState(false);

  const kosong = useMemo(() => {
    const s = new Set<string>();
    for (const c of ZEROABLE) if (rows.every((r) => c.get(r) === 0)) s.add(c.key);
    return s;
  }, [rows]);

  const show = (key: string) => kolomKosong || !kosong.has(key);
  const cols = FIXED_COLS + ZEROABLE.filter((c) => show(c.key)).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (gender !== "all" && r.gender !== gender) return false;
      if (hanyaMasalah && !r.bermasalah && r.insiden.length === 0) return false;
      if (!needle) return true;
      return (
        r.nama.toLowerCase().includes(needle) ||
        r.insiden.some((i) => i.halaqahName.toLowerCase().includes(needle))
      );
    });
  }, [rows, q, gender, hanyaMasalah]);

  // Default order is upstream's rank, which the payload already arrives in.
  const { rows: sorted, sort, toggle } = useTableSort(filtered, ACCESSORS);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari pengajar atau halaqah…"
          className="w-full px-2 py-1.5 sm:w-72"
        />
        <SegmentedControl<"all" | "ikhwan" | "akhwat">
          options={[
            { value: "all", label: "Semua" },
            { value: "ikhwan", label: "Ikhwan" },
            { value: "akhwat", label: "Akhwat" },
          ]}
          value={gender}
          onChange={setGender}
        />
        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          <input
            type="checkbox"
            checked={hanyaMasalah}
            onChange={(e) => setHanyaMasalah(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Hanya yang punya pelanggaran / insiden
        </label>
        {kosong.size > 0 && (
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={kolomKosong}
              onChange={(e) => setKolomKosong(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Tampilkan kolom kosong ({kosong.size})
          </label>
        )}
        <span className="text-xs text-neutral-500">
          {sorted.length} pengajar · klik baris untuk insidennya
        </span>
      </div>

      <TableWrap maxHeight="calc(100vh - 13rem)">
        <Table>
          <THead sticky>
            <TR>
              <SortTH sortKey="nama" sort={sort} onSort={toggle}>
                Pengajar
              </SortTH>
              <SortTH
                sortKey="rank"
                sort={sort}
                onSort={toggle}
                className="text-right"
              >
                Rank
              </SortTH>
              <SortTH
                sortKey="kbbs"
                sort={sort}
                onSort={toggle}
                className="text-right"
              >
                KBBS
              </SortTH>
              <SortTH
                sortKey="onTime"
                sort={sort}
                onSort={toggle}
                className="text-right"
              >
                On-time
              </SortTH>
              <SortTH
                sortKey="stabil"
                sort={sort}
                onSort={toggle}
                className="text-right"
              >
                Stabil
              </SortTH>
              {show("kmt") && (
                <SortTH
                  sortKey="kmt"
                  sort={sort}
                  onSort={toggle}
                  className="text-right"
                >
                  KMT
                </SortTH>
              )}
              {show("kbla") && (
                <SortTH
                  sortKey="kbla"
                  sort={sort}
                  onSort={toggle}
                  className="text-right"
                >
                  KBLA
                </SortTH>
              )}
              {show("jkg") && (
                <SortTH
                  sortKey="jkg"
                  sort={sort}
                  onSort={toggle}
                  className="text-right"
                >
                  JKG
                </SortTH>
              )}
              {show("tidakLatihan") && (
                <SortTH
                  sortKey="tidakLatihan"
                  sort={sort}
                  onSort={toggle}
                  className="text-right"
                >
                  Tdk latihan
                </SortTH>
              )}
              {show("hutang") && (
                <SortTH
                  sortKey="hutang"
                  sort={sort}
                  onSort={toggle}
                  className="text-right"
                >
                  Hutang
                </SortTH>
              )}
              <SortTH
                sortKey="laporan"
                sort={sort}
                onSort={toggle}
                className="text-right"
              >
                Laporan
              </SortTH>
              {show("insiden") && (
                <SortTH
                  sortKey="insiden"
                  sort={sort}
                  onSort={toggle}
                  className="text-right"
                >
                  Insiden
                </SortTH>
              )}
            </TR>
          </THead>
          <TBody>
            {sorted.map((r) => {
              const expanded = open === r.pengajarId;
              return (
                <Fragment key={r.pengajarId}>
                  <TR
                    onClick={() => setOpen(expanded ? null : r.pengajarId)}
                    className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                  >
                    <TD className="min-w-[16rem] font-medium">
                      <span className="mr-1 text-neutral-400">{expanded ? "▾" : "▸"}</span>
                      {r.nama}
                      <div className="text-xs font-normal text-neutral-500">
                        {r.gender === "ikhwan" ? "Ikhwan" : "Akhwat"} · {r.halaqahDiBatch} halaqah
                        {r.halaqahLuarBatch > 0 && (
                          <span
                            className="text-amber-600"
                            title="Angka di baris ini mencakup halaqah tersebut juga — upstream menjumlahkan seluruh halaqah pengajar, bukan per batch."
                          >
                            {" "}
                            + {r.halaqahLuarBatch} di batch lain
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums text-neutral-500">{r.rank ?? "—"}</TD>
                    <PctCell pct={r.pctKbbs} sudah={r.kbbs} total={r.nonLibur} />
                    <PctCell pct={r.pctOnTime} sudah={r.onTimeBaik} total={r.onTimeTotal} />
                    <PctCell pct={r.pctStabil} sudah={r.stabilBaik} total={r.stabilTotal} />
                    {show("kmt") && (
                      <TD className="text-right tabular-nums">
                        <Pelanggaran n={r.kmt} />
                      </TD>
                    )}
                    {show("kbla") && (
                      <TD className="text-right tabular-nums">
                        <Pelanggaran n={r.kbla} />
                      </TD>
                    )}
                    {show("jkg") && (
                      <TD className="text-right tabular-nums">
                        <Pelanggaran n={r.jkg} />
                      </TD>
                    )}
                    {show("tidakLatihan") && (
                      <TD className="text-right tabular-nums">
                        <Pelanggaran n={r.tidakLatihan} />
                      </TD>
                    )}
                    {show("hutang") && (
                      <TD className="text-right tabular-nums">
                        {r.hutangSaldo > 0 ? (
                          <span className="font-medium text-red-600">{r.hutangSaldo}</span>
                        ) : (
                          <span className="text-neutral-300 dark:text-neutral-600">0</span>
                        )}
                      </TD>
                    )}
                    {r.cakupan && r.cakupan.total > 0 ? (
                      <PctCell
                        pct={r.cakupan.persen}
                        sudah={r.cakupan.sudah}
                        total={r.cakupan.total}
                      />
                    ) : (
                      <TD className="text-right tabular-nums">
                        <span className="text-neutral-400" title="Tidak ada pertemuan tercatat">
                          —
                        </span>
                      </TD>
                    )}
                    {show("insiden") && (
                      <TD className="text-right tabular-nums">
                        {r.insiden.length > 0 ? (
                          <span className="font-medium text-amber-600">{r.insiden.length}</span>
                        ) : (
                          <span className="text-neutral-300 dark:text-neutral-600">0</span>
                        )}
                      </TD>
                    )}
                  </TR>
                  {expanded && <Detail row={r} cols={cols} />}
                </Fragment>
              );
            })}
            {sorted.length === 0 && (
              <TR>
                <TD colSpan={cols} className="px-3 py-6 text-center text-neutral-500">
                  Tidak ada pengajar untuk filter ini.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}

/**
 * The `noData` bucket, deliberately its OWN table.
 *
 * These teachers had nothing to score in the window. Merging them into the
 * ranked table would paint their empty `pct*` as 0% and drop them to the bottom
 * of every sort — "tanpa data" read as "gagal total".
 */
export function NoDataTable({ rows }: { rows: DisiplinRow[] }) {
  return (
    <TableWrap>
      <Table>
        <THead>
          <TR>
            <TH>Pengajar</TH>
            <TH className="text-right">Halaqah di batch ini</TH>
            <TH className="text-right">Pertemuan non-libur</TH>
            <TH className="text-right">Insiden</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.pengajarId}>
              <TD className="font-medium">
                {r.nama}
                <div className="text-xs font-normal text-neutral-500">
                  {r.gender === "ikhwan" ? "Ikhwan" : "Akhwat"}
                </div>
              </TD>
              <TD className="text-right tabular-nums">{r.halaqahDiBatch}</TD>
              <TD className="text-right tabular-nums text-neutral-500">{r.nonLibur}</TD>
              <TD className="text-right tabular-nums">{r.insiden.length}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}
