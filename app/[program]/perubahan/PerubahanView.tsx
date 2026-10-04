"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StatusTone } from "@/lib/ui/status";
// From the pure module, NOT ./change-recap — that one imports getDb and would
// pull the pg driver into the client bundle.
import {
  CATEGORY_LABEL,
  CATEGORY_NOTE,
  FIELD_LABEL,
  type ChangeRecap,
  type DeviationCategory,
  type ScheduleChangeSummary,
} from "@/lib/reports/change-recap-types";
import type { BatchOption } from "@/lib/reports/scope";

/** Severity colouring: real badal is the signal, the rest is data hygiene. */
const CATEGORY_TONE: Record<DeviationCategory, StatusTone> = {
  badal: "indigo",
  ganti_guru_belum_dicatat: "warning",
  serah_terima: "success",
  catatan_salah: "danger",
  catatan_salah_total: "danger",
  duplikat_akun_guru: "teal",
  tanpa_pengajar_tercatat: "info",
  artefak_impor: "neutral",
};

/** Bar colours must be the same family as the badges, minus the text colour. */
const CATEGORY_BAR: Record<DeviationCategory, string> = {
  badal: "bg-[#8a5a82]",
  ganti_guru_belum_dicatat: "bg-amber-500",
  serah_terima: "bg-emerald-500",
  catatan_salah: "bg-red-400",
  catatan_salah_total: "bg-red-600",
  duplikat_akun_guru: "bg-[#3f8a82]",
  tanpa_pengajar_tercatat: "bg-blue-500",
  artefak_impor: "bg-neutral-400",
};

/** Display order: the actionable categories first. */
const ORDER: DeviationCategory[] = [
  "badal",
  "ganti_guru_belum_dicatat",
  "serah_terima",
  "catatan_salah",
  "catatan_salah_total",
  "duplikat_akun_guru",
  "tanpa_pengajar_tercatat",
  "artefak_impor",
];

const MONTH_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_ID[(m ?? 1) - 1] ?? ym} ${y}`;
}

function dateLabel(d: string | null): string {
  if (!d) return "-";
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTH_ID[(m ?? 1) - 1] ?? ""} ${y}`;
}

export function PerubahanView({
  recap,
  schedule,
  scopeLabel,
  batchOptions,
  initialTab,
}: {
  recap: ChangeRecap;
  schedule: ScheduleChangeSummary;
  scopeLabel: string;
  batchOptions: BatchOption[];
  initialTab: "badal" | "kualitas" | "jadwal";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Default to `badal` only: the other categories are one click away and their
  // counts stay on the chips, so nothing is hidden — but a coordinator opening
  // the page should not be met with 1.000 rows of stale records. When a batch
  // has no badal at all, fall through to the most actionable category that does
  // have rows, otherwise the page opens looking broken.
  const [selected, setSelected] = useState<Set<DeviationCategory>>(() => {
    if (recap.byCategory.badal > 0) return new Set<DeviationCategory>(["badal"]);
    const fallback = ORDER.find((c) => recap.byCategory[c] > 0);
    return new Set<DeviationCategory>(fallback ? [fallback] : ["badal"]);
  });
  const [search, setSearch] = useState("");
  const [start, setStart] = useState(recap.start);
  const [end, setEnd] = useState(recap.end);

  function applyRange() {
    const next = new URLSearchParams(params.toString());
    next.set("start", start);
    next.set("end", end);
    router.push(`${pathname}?${next.toString()}`);
  }

  function toggle(cat: DeviationCategory) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const meetings = useMemo(
    () =>
      recap.meetings.filter((m) => {
        if (!selected.has(m.category)) return false;
        if (!q) return true;
        return (
          (m.recordedGuru ?? "").toLowerCase().includes(q) ||
          (m.actualGuru ?? "").toLowerCase().includes(q) ||
          m.halaqah.toLowerCase().includes(q)
        );
      }),
    [recap.meetings, selected, q],
  );

  // Both columns are narrowed by the same category filter — otherwise a teacher
  // with 75 "menggantikan" from stale records shows up while the chips say
  // "Badal · 0", which reads as a contradiction.
  const teachers = useMemo(() => {
    const cats = ORDER.filter((c) => selected.has(c));
    const sel = recap.teachers
      .map((t) => ({
        ...t,
        digantikanSel: cats.reduce((n, c) => n + t.byCategory[c], 0),
        menggantikanSel: cats.reduce((n, c) => n + t.masukByCategory[c], 0),
      }))
      .filter((t) => t.digantikanSel > 0 || t.menggantikanSel > 0)
      .sort(
        (a, b) => b.digantikanSel + b.menggantikanSel - (a.digantikanSel + a.menggantikanSel),
      );
    return q ? sel.filter((t) => t.pengajar.toLowerCase().includes(q)) : sel;
  }, [recap.teachers, selected, q]);

  const scheduleEvents = useMemo(
    () =>
      q
        ? schedule.events.filter(
            (e) =>
              e.halaqah.toLowerCase().includes(q) ||
              (e.actorName ?? "").toLowerCase().includes(q),
          )
        : schedule.events,
    [schedule.events, q],
  );

  const total = recap.meetings.length;
  const swaps = recap.recordIssues.filter((i) => i.swappedWith);

  const issues = useMemo(
    () =>
      q
        ? recap.recordIssues.filter(
            (i) =>
              i.halaqah.toLowerCase().includes(q) ||
              (i.recordedGuru ?? "").toLowerCase().includes(q) ||
              (i.actualGuru ?? "").toLowerCase().includes(q),
          )
        : recap.recordIssues,
    [recap.recordIssues, q],
  );

  return (
    <div className="space-y-6">
      {/* ── Filters ─────────────────────────────────────────────────────── */}
      {batchOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {batchOptions.map((b) => (
            <Link
              key={b.href}
              href={b.href}
              className={
                b.current
                  ? "rounded-full bg-neutral-900 px-3 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }
            >
              {b.label}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-ink-muted">Dari tanggal</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted">Sampai</label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button onClick={applyRange}>Terapkan</Button>
        <div className="grow">
          <label className="block text-xs text-ink-muted">Cari pengajar / halaqah</label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ketik nama…"
          />
        </div>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="badal">Rekap Badal</TabsTrigger>
          <TabsTrigger value="jadwal">Perubahan Jadwal ({schedule.events.length})</TabsTrigger>
          <TabsTrigger value="kualitas">Kualitas Data ({recap.recordIssues.length})</TabsTrigger>
        </TabsList>

        {/* ══ Bagian 1 ═══════════════════════════════════════════════════ */}
        <TabsContent value="badal" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sebaran {total.toLocaleString("id-ID")} pertemuan · {scopeLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-ink-muted">
                Semua pertemuan yang pengajarnya berbeda dari pengajar yang tercatat memegang
                halaqah. Sebagian besar bukan badal — melainkan catatan halaqah yang sudah tidak
                sesuai. Warna di bawah memilahnya.
              </p>

              {total > 0 && (
                <div className="flex h-3 w-full overflow-hidden rounded-full">
                  {ORDER.filter((c) => recap.byCategory[c] > 0).map((c) => (
                    <div
                      key={c}
                      className={CATEGORY_BAR[c]}
                      style={{ width: `${(recap.byCategory[c] / total) * 100}%` }}
                      title={`${CATEGORY_LABEL[c]}: ${recap.byCategory[c]}`}
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {ORDER.map((c) => {
                  const on = selected.has(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggle(c)}
                      title={CATEGORY_NOTE[c]}
                      className={
                        on
                          ? "rounded-full border border-neutral-900 bg-neutral-900 px-3 py-1 text-xs text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                          : "rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      }
                    >
                      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${CATEGORY_BAR[c]}`} />
                      {CATEGORY_LABEL[c]} · {recap.byCategory[c]}
                    </button>
                  );
                })}
              </div>

              {/* The honest caveat. Without it the page reads "badal almost never
                  happens", which is an artefact of the chosen baseline.
                  Nadanya netral, bukan amber: ini catatan metodologi, bukan
                  peringatan — dan dilipat supaya tidak menyita kepala kartu. */}
              <details className="rounded-md border border-neutral-200 px-3 py-2 text-xs text-ink-muted dark:border-neutral-800">
                <summary className="cursor-pointer font-medium text-ink-muted">
                  Catatan metodologi: angka ini diukur terhadap apa?
                </summary>
                <p className="mt-1.5">
                  Patokan di halaman ini adalah{" "}
                  <strong>pengajar yang tercatat memegang halaqah</strong>. Bila diukur terhadap{" "}
                  <strong>pengajar mayoritas</strong> tiap halaqah, angkanya{" "}
                  <strong>
                    {recap.pluralityBaseline.meetings} pertemuan di{" "}
                    {recap.pluralityBaseline.halaqah} halaqah
                  </strong>
                  . Selisih itu berasal dari {recap.recordIssues.length} halaqah yang catatannya
                  tidak sinkron — lihat tab Kualitas Data.
                </p>
              </details>
            </CardContent>
          </Card>

          {/* Tiga angka nol berjajar tidak memberi tahu apa pun; kalau memang
              tidak ada temuan, satu baris hijau sudah cukup. */}
          {recap.byCategory.badal === 0 && recap.recordIssues.length === 0 && swaps.length === 0 ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              Aman — tidak ada badal, catatan pengajar yang salah, maupun indikasi tukar halaqah
              pada rentang ini.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label="Badal sebenarnya" value={recap.byCategory.badal} hint="sporadis, pengajar tetap digantikan" />
              <StatTile label="Halaqah catatannya salah" value={recap.recordIssues.length} hint="perlu dibetulkan di CMS" />
              {swaps.length > 0 && (
                <StatTile label="Terindikasi tukar halaqah" value={swaps.length} hint="pasangan saling tertukar" />
              )}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Per pengajar</CardTitle>
            </CardHeader>
            <CardContent>
              {teachers.length === 0 ? (
                <EmptyState title="Tidak ada" description="Tidak ada pengajar pada kategori yang dipilih." />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Pengajar</TH>
                        <TH className="text-right">Digantikan</TH>
                        <TH className="text-right">Menggantikan</TH>
                        <TH className="text-right">Halaqah</TH>
                        <TH>Kategori</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {teachers.map((t) => (
                        <TR key={`${t.guruId ?? t.pengajar}`}>
                          <TD>{t.pengajar}</TD>
                          <TD className="text-right tabular-nums">{t.digantikanSel || "-"}</TD>
                          <TD className="text-right tabular-nums">{t.menggantikanSel || "-"}</TD>
                          <TD className="text-right tabular-nums">{t.halaqahCount}</TD>
                          <TD>
                            <div className="flex flex-wrap gap-1">
                              {ORDER.filter((c) => selected.has(c) && t.byCategory[c] > 0).map((c) => (
                                <Badge key={c} tone={CATEGORY_TONE[c]}>
                                  {CATEGORY_LABEL[c]} {t.byCategory[c]}
                                </Badge>
                              ))}
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Per bulan</CardTitle>
            </CardHeader>
            <CardContent>
              {recap.months.length === 0 ? (
                <EmptyState title="Belum ada data" description="Tidak ada pertemuan menyimpang pada rentang ini." />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Bulan</TH>
                        {ORDER.map((c) => (
                          <TH key={c} className="text-right">{CATEGORY_LABEL[c]}</TH>
                        ))}
                        <TH className="text-right">Total</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {recap.months.map((m) => (
                        <TR key={m.month}>
                          <TD>{monthLabel(m.month)}</TD>
                          {ORDER.map((c) => (
                            <TD key={c} className="text-right tabular-nums">
                              {m.byCategory[c] || "-"}
                            </TD>
                          ))}
                          <TD className="text-right font-medium tabular-nums">{m.total}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rincian pertemuan ({meetings.length.toLocaleString("id-ID")})</CardTitle>
            </CardHeader>
            <CardContent>
              {meetings.length === 0 ? (
                <EmptyState
                  title="Tidak ada pertemuan"
                  description="Pilih kategori lain di atas, atau lebarkan rentang tanggalnya."
                />
              ) : (
                <TableWrap maxHeight="70vh">
                  <Table>
                    {/* Kepala menempel: sampai 500 baris pertemuan. */}
                    <THead sticky>
                      <TR>
                        <TH>Tanggal</TH>
                        <TH>Halaqah</TH>
                        <TH className="text-right">Ke-</TH>
                        <TH>Tercatat</TH>
                        <TH>Yang mengajar</TH>
                        <TH>Kategori</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    {/* Tujuh kolom: zebra menjaga baris tetap terbaca. */}
                    <TBody zebra>
                      {meetings.slice(0, 500).map((m) => (
                        <TR key={m.jadwalId}>
                          <TD className="whitespace-nowrap">{dateLabel(m.date)}</TD>
                          <TD>
                            {m.halaqah}
                            <span className="ml-1 text-xs text-ink-faint">#{m.halaqahId}</span>
                          </TD>
                          <TD className="text-right tabular-nums">{m.order ?? "-"}</TD>
                          <TD className="text-ink-muted">{m.recordedGuru ?? "-"}</TD>
                          <TD>{m.actualGuru ?? `#${m.actualGuruId ?? "-"}`}</TD>
                          <TD>
                            <Badge tone={CATEGORY_TONE[m.category]}>{CATEGORY_LABEL[m.category]}</Badge>
                          </TD>
                          <TD className="text-xs text-ink-muted">{m.statusLabel ?? "-"}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
              {meetings.length > 500 && (
                <p className="mt-2 text-xs text-ink-muted">
                  Menampilkan 500 dari {meetings.length.toLocaleString("id-ID")} baris. Persempit
                  rentang tanggal atau kategori untuk melihat sisanya.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ Perubahan jadwal (event, dari activity log tilawah) ════════ */}
        <TabsContent value="jadwal" className="space-y-6 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Tanggal diubah" value={schedule.totalDate} hint="pertemuan digeser ke hari lain" />
            <StatTile label="Jam diubah" value={schedule.totalTime} hint="hari sama, jam berbeda" />
            <StatTile
              label="Tercatat sejak"
              value={schedule.firstRecordedAt ? dateLabel(schedule.firstRecordedAt.slice(0, 10)) : "-"}
              hint="perubahan sebelum tanggal ini tidak terekam"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Rincian perubahan jadwal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer font-medium text-ink-muted">
                  Dari mana datanya?
                </summary>
                <p className="mt-1.5">
                  Diambil dari catatan aktivitas tilawah, jadi nilai lama, nilai baru, waktu
                  perubahan, dan pelakunya tercatat apa adanya. Berbeda dengan tab Rekap Badal
                  yang menyimpulkan dari keadaan sekarang.
                </p>
              </details>
              {scheduleEvents.length === 0 ? (
                <EmptyState
                  title="Belum ada perubahan jadwal tercatat"
                  description="Bisa jadi memang tidak ada pada rentang ini, atau riwayatnya belum diimpor."
                />
              ) : (
                <TableWrap maxHeight="70vh">
                  <Table>
                    <THead sticky>
                      <TR>
                        <TH>Halaqah</TH>
                        <TH className="text-right">Pertemuan ke-</TH>
                        <TH>Jenis</TH>
                        <TH>Semula</TH>
                        <TH>Menjadi</TH>
                        <TH>Diubah oleh</TH>
                        <TH>Waktu perubahan</TH>
                      </TR>
                    </THead>
                    <TBody zebra>
                      {scheduleEvents.slice(0, 500).map((e) => (
                        <TR key={e.id}>
                          <TD>
                            {e.halaqah}
                            <span className="ml-1 text-xs text-ink-faint">#{e.halaqahId ?? "-"}</span>
                            <div className="text-xs text-ink-faint">{e.programName}</div>
                          </TD>
                          <TD className="text-right tabular-nums">{e.order ?? e.meetingName ?? "-"}</TD>
                          <TD>
                            <Badge tone={e.field === "schedule_date" ? "warning" : "info"}>
                              {FIELD_LABEL[e.field] ?? e.field}
                            </Badge>
                          </TD>
                          <TD className="whitespace-nowrap text-ink-muted line-through decoration-neutral-400">
                            {e.oldLabel ?? "-"}
                          </TD>
                          <TD className="whitespace-nowrap font-medium">{e.newLabel ?? "-"}</TD>
                          <TD>
                            {e.actorName ?? (
                              <span className="text-ink-faint">
                                {e.actorUserId != null ? `Pengguna #${e.actorUserId}` : "Sistem"}
                              </span>
                            )}
                          </TD>
                          <TD className="whitespace-nowrap text-xs text-ink-muted">
                            {dateLabel(e.changedAt.slice(0, 10))} {e.changedAt.slice(11, 16)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
              {scheduleEvents.length > 500 && (
                <p className="text-xs text-ink-muted">
                  Menampilkan 500 dari {scheduleEvents.length.toLocaleString("id-ID")} baris.
                </p>
              )}
            </CardContent>
          </Card>

          {schedule.byActor.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Siapa yang paling sering mengubah</CardTitle>
              </CardHeader>
              <CardContent>
                <TableWrap>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Pengubah</TH>
                        <TH className="text-right">Jumlah perubahan</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {schedule.byActor.slice(0, 25).map((a) => (
                        <TR key={a.actor}>
                          <TD>{a.actor}</TD>
                          <TD className="text-right tabular-nums">{a.n}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══ Bagian 2 ═══════════════════════════════════════════════════ */}
        <TabsContent value="kualitas" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Halaqah yang catatan pengajarnya tidak sesuai ({issues.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-ink-muted">
                Pengajar tercatat berbeda dari yang benar-benar mengajar mayoritas pertemuannya.
              </p>
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer font-medium text-ink-muted">
                  Kenapa ini perlu dibetulkan?
                </summary>
                <p className="mt-1.5">
                  Selama tidak dibetulkan, laporan kehadiran pengajar akan salah orang — dan
                  pengajar akan mengadu seperti kasus penggabungan HITS 07/011. Halaqah yang hanya
                  mengalami serah terima wajar tidak dimasukkan ke daftar ini.
                </p>
              </details>
              {issues.length === 0 ? (
                <EmptyState
                  tone="success"
                  title="Semua catatan sinkron"
                  description="Tidak ada halaqah yang pengajar tercatatnya berbeda dari kenyataan."
                />
              ) : (
                <TableWrap maxHeight="70vh">
                  <Table>
                    <THead sticky>
                      <TR>
                        <TH>Halaqah</TH>
                        <TH>Tercatat</TH>
                        <TH>Yang sebenarnya mengajar</TH>
                        <TH className="text-right">Pertemuan</TH>
                        <TH>Kategori</TH>
                        <TH>Dugaan sebab</TH>
                      </TR>
                    </THead>
                    <TBody zebra>
                      {issues.map((i) => (
                        <TR key={`${i.programId}-${i.halaqahId}`}>
                          <TD>
                            {i.halaqah}
                            <span className="ml-1 text-xs text-ink-faint">#{i.halaqahId}</span>
                            <div className="text-xs text-ink-faint">{i.programName}</div>
                          </TD>
                          <TD className="text-ink-muted">{i.recordedGuru ?? "-"}</TD>
                          <TD>{i.actualGuru ?? "-"}</TD>
                          <TD className="text-right tabular-nums">
                            {i.deviating} / {i.total}
                          </TD>
                          <TD>
                            <Badge tone={CATEGORY_TONE[i.category]}>{CATEGORY_LABEL[i.category]}</Badge>
                          </TD>
                          <TD className="text-xs text-ink-muted">
                            {i.swappedWith ? (
                              <>
                                Terindikasi <strong>tukar halaqah</strong> dengan {i.swappedWith.halaqah}{" "}
                                <span className="text-ink-faint">#{i.swappedWith.halaqahId}</span>
                              </>
                            ) : (
                              CATEGORY_NOTE[i.category]
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
