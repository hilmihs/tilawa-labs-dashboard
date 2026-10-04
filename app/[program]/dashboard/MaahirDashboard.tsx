import type { ReactNode } from "react";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { maahirSyncState } from "@/lib/db/schema";
import { getProgram } from "@/lib/programs/resolve";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import { periodLabel, readLaporanMaahir, type MaahirRekapRead } from "@/lib/maahir/rekap";
import type {
  MaahirAnggotaKehadiran,
  MaahirDibawahTargetGender,
  MaahirDibawahTargetJumlah,
  MaahirGender,
  MaahirKehadiranRingkas,
  MaahirLaporanPayload,
  MaahirPresensiTakTerisi,
  MaahirSetoranPeserta,
  MaahirSpPayload,
} from "@/lib/maahir/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";

/**
 * `/maahir/dashboard` — the monthly Maahir report, read from the cached
 * `rekap/laporan-maahir` response.
 *
 * Everything on this screen is a number Maahir already computed. We never
 * recompute: the report period is 28→27 (not a calendar month), `sakit` is out
 * of the attendance denominator, a whitewashed SP counts as 100%, and a member
 * who joined mid-period has a shortened denominator (docs/API-PUBLIC.md §9).
 * Re-deriving any of that here would make the dashboard disagree with the
 * coordinator's own screen, and the dashboard would be the one blamed.
 *
 * Two rules the layout below exists to keep:
 *
 * 1. A missing pull is NEVER a zero. `readLaporanMaahir` returns null when the
 *    month was never fetched, and that renders as an empty state naming the
 *    cause — "belum ditarik" or "scope belum diberikan" — not as 0% attendance.
 * 2. The period heading comes from `meta` via `periodLabel()`, never from the
 *    month name. The same `bulan=2026-08` means 28 Jul–27 Aug here and 1 Aug–1 Sep
 *    for `rekap/hits-disiplin`; printing "Agustus" would hide that difference.
 */
/**
 * Every list on this screen comes from an unvalidated JSONB cast, so "the key is
 * missing" and "the list is empty" arrive the same way. Both must render as
 * empty — `.map` on `undefined` is a 500, and a 500 tells the coordinator
 * nothing about which of the two happened.
 */
function daftar<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/** A block is readable when its headline rate is actually a number — that is the
 *  one field every `KehadiranKpi` renders unconditionally. */
function blokTerbaca(b: unknown): boolean {
  if (!b || typeof b !== "object") return false;
  const k = (b as { kehadiran?: unknown }).kehadiran;
  return !!k && typeof k === "object" && typeof (k as MaahirKehadiranRingkas).aktual === "number";
}

/** Can the stored payload be rendered at all? See the call site for why this is
 *  checked here rather than trusted from the type. */
function terbaca(d: MaahirLaporanPayload | null | undefined): boolean {
  if (!d || typeof d !== "object") return false;
  return blokTerbaca(d.takhassus) && blokTerbaca(d.maahir) && blokTerbaca(d.atTibyan);
}

export async function MaahirDashboard({
  program,
  month,
}: {
  program: string;
  month?: string;
}) {
  const [current, previous] = rekapMonths();
  // An explicit ?month= is honoured only for the two months the sync pulls;
  // anything else would always land on "belum ditarik" and look like a bug.
  const requested = month === previous ? previous : current;

  let read = await readLaporanMaahir(requested);
  // The current month is pulled first every run, so it is missing only when that
  // one request failed. Falling back to last month keeps the screen useful, but
  // only with a banner — a silent fallback would misdate every number on it.
  const mundur = !read && requested === current;
  if (mundur) read = await readLaporanMaahir(previous);
  const shown = mundur ? previous : requested;

  if (!read) {
    const ditolak = await scopeDitolak(program);
    return (
      <div className="space-y-4">
        <Header program={program} bulan={requested} current={current} previous={previous} />
        <EmptyState
          title={ditolak ? "Scope maahir belum diberikan" : "Laporan bulan ini belum ditarik"}
          description={
            ditolak
              ? "API key yang dipakai tidak punya scope `maahir`, jadi rekap/laporan-maahir tidak pernah terjawab. Minta scope-nya ditambahkan di sisi Maahir, lalu jalankan sync ulang."
              : "Belum ada respons rekap/laporan-maahir yang tersimpan untuk periode ini. Jalankan `pnpm sync:maahir` (atau tombol sync di admin), lalu muat ulang. Angka tidak ditampilkan sebagai 0 karena memang belum pernah diambil — bukan berarti nol."
          }
        />
      </div>
    );
  }

  const d = read.payload;
  const label = periodLabel(read.meta);

  // A stored row is not the same as a readable report. `maahir-sync` writes
  // `(data ?? {})` straight into `maahir_rekap.payload` and `readRekap` only
  // casts it — nothing between the API and this line checks the shape. So an
  // upstream reply without a `data` envelope is stored as `{}`, reached the JSX
  // below, and threw on the first `d.notes.length`: a 500 for the whole route,
  // which is a blank screen with no reason on it. Say what happened instead.
  if (!terbaca(d)) {
    return (
      <div className="space-y-4">
        <Header
          program={program}
          bulan={shown}
          current={current}
          previous={previous}
          read={read}
          label={label}
        />
        <EmptyState
          title="Respons tersimpan, tapi isinya tidak terbaca"
          description="Ada baris rekap/laporan-maahir untuk periode ini, tapi tidak berisi blok takhassus/maahir/atTibyan yang bisa dibaca — biasanya upstream membalas tanpa `data`. Jalankan `pnpm sync:maahir` lagi, lalu muat ulang. Angka tidak ditampilkan sebagai 0 karena tidak ada angka yang tersimpan."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        program={program}
        bulan={shown}
        current={current}
        previous={previous}
        read={read}
        label={label}
      />

      {mundur && (
        <Alert variant="warning">
          Laporan bulan berjalan belum tersimpan (tarikan terakhirnya gagal), jadi yang tampil di
          bawah ini adalah periode <b>{label ?? "sebelumnya"}</b>. Bukan angka bulan berjalan.
        </Alert>
      )}

      {read.meta.basi === true && (
        <Alert variant="warning">
          Upstream menandai respons ini <code>basi</code>
          {read.meta.snapshot_terakhir ? ` (snapshot terakhir ${read.meta.snapshot_terakhir})` : ""}.
          Angka di bawah masih angka lama, belum dihitung ulang untuk periode ini.
        </Alert>
      )}

      {daftar(d.notes).length > 0 && (
        <Alert variant="info">
          <div className="space-y-1">
            {[...daftar(d.notes)]
              .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0))
              .map((n, i) => (
                <p key={n.id ?? i}>{n.teks}</p>
              ))}
          </div>
        </Alert>
      )}

      <BlokTakhassus data={d.takhassus} />
      <BlokMaahir data={d.maahir} />
      <BlokAtTibyan data={d.atTibyan} />

      <PresensiTakTerisi rows={daftar(d.presensiTakTerisi)} program={program} />
      <SpPeriode sp={d.sp} program={program} label={label} />
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

const WAKTU = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

function Header({
  program,
  bulan,
  current,
  previous,
  read,
  label,
}: {
  program: string;
  bulan: string;
  current: string;
  previous: string;
  read?: MaahirRekapRead<MaahirLaporanPayload>;
  label?: string | null;
}) {
  // The two links carry the `bulan` we SEND upstream, so they are labelled by
  // position ("bulan berjalan"/"bulan lalu"), never by a month name — the window
  // a month resolves to is only known from `meta` once the response is loaded.
  const pilihan: { key: string; label: string }[] = [
    { key: current, label: "Bulan berjalan" },
    { key: previous, label: "Bulan lalu" },
  ];

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[19px] font-bold tracking-[-0.01em]">Laporan Maahir</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          {!read ? (
            // No stored response: there is no window to name yet. Saying nothing
            // beats inventing a period out of the month we happened to ask for.
            "Rekap bulanan dari API Maahir"
          ) : (
            <>
              {label ? (
                <>
                  Periode <b>{label}</b>
                </>
              ) : (
                "Periode tidak tercatat di meta respons"
              )}
              {" · "}terakhir ditarik {WAKTU.format(read.fetchedAt)} WIB
              {read.meta.dari_cache ? " (dari cache upstream)" : ""}
            </>
          )}
        </p>
      </div>
      <div className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-900">
        {pilihan.map((p) => (
          <Link
            key={p.key}
            href={`/${program}/dashboard?month=${p.key}`}
            className={
              p.key === bulan
                ? "rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            }
          >
            {p.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Blok ────────────────────────────────────────────────────────────────────

const pct = (n: number) => `${n}%`;
const tone = (aktual: number, benchmark: number) =>
  aktual >= benchmark ? undefined : "text-red-600 dark:text-red-400";

/**
 * The one number a coordinator reads first, with the target it is judged
 * against printed next to it and marked on the bar. Everything else in the
 * block is context and stays small — five equal 27px figures told nobody where
 * to look, and the benchmark (which decides red vs green) was invisible.
 */
function HeroRate({
  label,
  value,
  target,
  context,
}: {
  label: string;
  value: number;
  /** Benchmark Maahir scores this number against. */
  target: number;
  context: ReactNode;
}) {
  const ok = value >= target;
  return (
    <div className="rounded-[10px] border border-border bg-card px-[18px] py-[15px]">
      <div className="cap text-[10px] font-semibold text-neutral-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-2.5">
        <span
          className={`font-mono text-[44px] font-semibold leading-none tabular-nums ${
            ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {value}
          <span className="text-[19px] text-neutral-400">%</span>
        </span>
        <span className="text-[12px] text-ink-muted">
          target <b className="font-mono tabular-nums">{pct(target)}</b>
        </span>
      </div>
      <div className="relative mt-3 h-1.5 rounded-sm bg-neutral-100 dark:bg-neutral-800">
        <div
          className={`h-full rounded-sm ${ok ? "bg-emerald-500" : "bg-red-500"}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
        <span
          className="absolute -top-[3px] h-[calc(100%+6px)] w-px bg-neutral-400 dark:bg-neutral-500"
          style={{ left: `${Math.max(0, Math.min(100, target))}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-2.5 text-[12px] text-ink-muted">{context}</p>
    </div>
  );
}

function KehadiranKpi({
  k,
  pengajar,
  dibawahTarget,
}: {
  k: MaahirKehadiranRingkas;
  /** Takhassus and Maahir also score their teachers; At-Tibyan does not. */
  pengajar?: { persen: number; dibawahTarget: number };
  /** Peserta below the attendance target — the list under this block. */
  dibawahTarget: { total: number; hint?: string };
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_1.15fr]">
      <HeroRate
        label="Kehadiran peserta"
        value={k.aktual}
        target={k.benchmark}
        context={
          <>
            Ikhwan{" "}
            <span className={`font-mono tabular-nums ${tone(k.avgIkhwan, k.benchmark) ?? ""}`}>
              {pct(k.avgIkhwan)}
            </span>{" "}
            · Akhwat{" "}
            <span className={`font-mono tabular-nums ${tone(k.avgAkhwat, k.benchmark) ?? ""}`}>
              {pct(k.avgAkhwat)}
            </span>
          </>
        }
      />
      <KpiStrip
        items={[
          {
            label: "Peserta di bawah target",
            value: dibawahTarget.total,
            hint: dibawahTarget.hint ?? "rincian di bawah",
            valueClassName:
              dibawahTarget.total > 0 ? "text-red-600 dark:text-red-400" : undefined,
          },
          ...(pengajar
            ? [
                {
                  label: "Kehadiran pengajar",
                  value: pct(pengajar.persen),
                  hint:
                    pengajar.dibawahTarget > 0
                      ? `${pengajar.dibawahTarget} pengajar di bawah target`
                      : "semua pengajar memenuhi target",
                  valueClassName:
                    pengajar.dibawahTarget > 0 ? "text-amber-600 dark:text-amber-400" : undefined,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

function BlokTakhassus({ data }: { data: MaahirLaporanPayload["takhassus"] }) {
  // Only the `kehadiran` block is guaranteed by `terbaca()`; setoran can still be
  // absent on its own (an older cached response, or upstream dropping the key),
  // and that must cost the setoran strip only — not the whole card.
  const s = data.setoran as MaahirLaporanPayload["takhassus"]["setoran"] | undefined;
  const peserta = daftar(s?.peserta);
  const t = data.dibawahTarget;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Takhassus</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <KehadiranKpi
          k={data.kehadiran}
          pengajar={{ persen: data.kehadiranPengajar, dibawahTarget: data.pengajarDibawahTarget }}
          dibawahTarget={{ total: t?.jumlah ?? daftar(t?.list).length }}
        />

        {/* Setoran: only Takhassus has one. `adaTarget=false` means the benchmark
            was never set, so `persen` is a ratio against nothing — say so instead
            of parading a percentage. Aktual/benchmark/peserta are the arithmetic
            behind the capaian, so they ride along as hints, not as headline cells. */}
        {s && (
          <KpiStrip
            items={[
              {
                label: "Capaian setoran",
                value: s.adaTarget ? pct(s.persen) : "—",
                hint: s.adaTarget
                  ? `${s.aktual} dari target ${s.benchmark} halaman`
                  : "target belum diatur di Maahir",
                valueClassName: s.adaTarget ? tone(s.persen, 100) : undefined,
              },
              {
                label: "Peserta setor",
                value: peserta.length,
                hint: `${s.aktual} halaman`,
              },
            ]}
          />
        )}

        {data.catatan && <Alert variant="info">{data.catatan}</Alert>}

        {peserta.length > 0 && (
          <details className="rounded-lg border border-neutral-200 dark:border-neutral-800">
            <summary className="cursor-pointer px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400">
              Rincian setoran per peserta ({peserta.length})
            </summary>
            <SetoranTable rows={peserta} />
          </details>
        )}

        <DibawahTarget jumlah={t?.jumlah ?? 0} list={t?.list} />
      </CardContent>
    </Card>
  );
}

function BlokMaahir({ data }: { data: MaahirLaporanPayload["maahir"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Maahir</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <KehadiranKpi
          k={data.kehadiran}
          pengajar={{ persen: data.kehadiranPengajar, dibawahTarget: data.pengajarDibawahTarget }}
          dibawahTarget={{ total: data.dibawahTarget?.jumlah ?? 0 }}
        />
        <DibawahTarget jumlah={data.dibawahTarget?.jumlah ?? 0} list={data.dibawahTarget?.list} />
      </CardContent>
    </Card>
  );
}

function BlokAtTibyan({ data }: { data: MaahirLaporanPayload["atTibyan"] }) {
  // At-Tibyan reports "di bawah target" split by gender (`ikhwan`/`akhwat`/`total`)
  // while the other two blocks report a single `jumlah`. Same list, different
  // header shape — reading `jumlah` here would render undefined.
  const t = data.dibawahTarget as MaahirDibawahTargetGender | undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>At-Tibyan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <KehadiranKpi
          k={data.kehadiran}
          dibawahTarget={{
            total: t?.total ?? 0,
            hint: t ? `${t.ikhwan} ikhwan · ${t.akhwat} akhwat` : undefined,
          }}
        />
        <DibawahTarget jumlah={t?.total ?? 0} list={t?.list} />
      </CardContent>
    </Card>
  );
}

function DibawahTarget({
  jumlah,
  list,
}: {
  jumlah: MaahirDibawahTargetJumlah["jumlah"];
  list: MaahirAnggotaKehadiran[] | null | undefined;
}) {
  const rows = daftar(list);
  if (jumlah === 0 && rows.length === 0) {
    return (
      <p className="text-sm text-emerald-700 dark:text-emerald-400">
        Tidak ada peserta di bawah target kehadiran.
      </p>
    );
  }
  return (
    <details className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <summary className="cursor-pointer px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400">
        Di bawah target kehadiran ({jumlah})
      </summary>
      <AnggotaTable rows={rows} />
    </details>
  );
}

// ── Tabel ───────────────────────────────────────────────────────────────────

const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

/** Format an upstream date without a timezone round-trip surprise: the API sends
 *  plain `YYYY-MM-DD`, and `new Date("2026-08-05")` is UTC midnight — one day
 *  earlier for anyone west of UTC. Anchoring at local midnight keeps the date. */
function tanggalPendek(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return TANGGAL.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function GenderBadge({ gender }: { gender: MaahirGender }) {
  return (
    <Badge tone={gender === "ikhwan" ? "info" : "teal"}>
      {gender === "ikhwan" ? "Ikhwan" : "Akhwat"}
    </Badge>
  );
}

/** Header cells that survive scrolling inside a capped-height table body. */
const STICKY_TH = "sticky top-0 z-10 bg-neutral-50 dark:bg-neutral-900";

function AnggotaTable({ rows }: { rows: MaahirAnggotaKehadiran[] }) {
  return (
    <TableWrap className="max-h-[65vh] overflow-y-auto rounded-none border-0 border-t border-neutral-200 dark:border-neutral-800">
      <Table>
        <THead>
          <TR>
            <TH className={STICKY_TH}>Nama</TH>
            <TH className={STICKY_TH}>Kelas</TH>
            <TH className={`${STICKY_TH} text-right`}>H/I/S/A/T</TH>
            <TH className={`${STICKY_TH} text-right`}>Terisi</TH>
            <TH className={`${STICKY_TH} text-right`}>Hadir</TH>
            <TH className={STICKY_TH}>Keterangan</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.anggotaId}>
              <TD>
                <div className="font-medium">{r.name}</div>
                {/* Joined mid-period: the denominator starts at `mulaiTanggal`,
                    so a low percentage here is over fewer sessions than the rest. */}
                {r.mulaiTanggal && (
                  <div className="text-xs text-neutral-400">
                    gabung {tanggalPendek(r.mulaiTanggal)}
                  </div>
                )}
              </TD>
              <TD className="text-ink-muted">
                <div className="flex items-center gap-1.5">
                  <span>{r.kelasName}</span>
                  <GenderBadge gender={r.gender} />
                </div>
              </TD>
              <TD className="text-right font-mono tabular-nums text-ink-muted">
                {r.counts?.H ?? 0}/{r.counts?.I ?? 0}/{r.counts?.S ?? 0}/{r.counts?.A ?? 0}/
                {r.counts?.T ?? 0}
              </TD>
              <TD className="text-right font-mono tabular-nums text-ink-muted">
                {r.filled}/{r.terisi}
              </TD>
              <TD className="text-right font-mono tabular-nums font-semibold">{pct(r.persen)}</TD>
              <TD className="max-w-[18rem] text-xs text-ink-muted">{r.keterangan || "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}

function SetoranTable({ rows }: { rows: MaahirSetoranPeserta[] }) {
  return (
    <TableWrap className="max-h-[65vh] overflow-y-auto rounded-none border-0 border-t border-neutral-200 dark:border-neutral-800">
      <Table>
        <THead>
          <TR>
            <TH className={STICKY_TH}>Nama</TH>
            <TH className={STICKY_TH}>Kelas</TH>
            <TH className={`${STICKY_TH} text-right`}>Halaman</TH>
            <TH className={`${STICKY_TH} text-right`}>Setor / sesi</TH>
            <TH className={`${STICKY_TH} text-right`}>Target</TH>
            <TH className={`${STICKY_TH} text-right`}>Capaian</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.anggotaId}>
              <TD>
                <div className="font-medium">{r.name}</div>
                {/* `rincian` is upstream's per-date breakdown, kept as a tooltip:
                    it is the audit trail behind `halaman`, but far too long to
                    put inline for 13 rows. */}
                <div
                  className="mt-0.5 line-clamp-1 max-w-[22rem] font-mono text-[11px] text-neutral-400"
                  title={r.rincian}
                >
                  {r.rincian}
                </div>
              </TD>
              <TD className="text-ink-muted">
                <div className="flex items-center gap-1.5">
                  <span>{r.kelasName}</span>
                  <GenderBadge gender={r.gender} />
                </div>
              </TD>
              <TD className="text-right font-mono tabular-nums">{r.halaman}</TD>
              <TD className="text-right font-mono tabular-nums text-ink-muted">
                {r.pertemuanSetor}/{r.sesiTarget}
              </TD>
              <TD className="text-right font-mono tabular-nums text-ink-muted">{r.target}</TD>
              <TD
                className={`text-right font-mono tabular-nums font-semibold ${
                  r.persen >= 100 ? "" : "text-red-600 dark:text-red-400"
                }`}
              >
                {pct(r.persen)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}

// ── Dua daftar yang bisa ditindak ────────────────────────────────────────────

function PresensiTakTerisi({ rows, program }: { rows: MaahirPresensiTakTerisi[]; program: string }) {
  const total = rows.reduce((n, r) => n + r.jumlah, 0);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-ink-muted">
          Presensi belum diisi · {rows.length} kelas, {total} pertemuan
        </h2>
        {/* Tabel di bawah menyebut kelas dan tanggal kosongnya, tapi berhenti di
            situ: laporan-maahir tidak membawa kelasId, jadi tautannya ke daftar
            kelas — bukan ke satu kelas — daripada menebak id dari nama. */}
        <Link
          href={`/${program}/kehadiran`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Buka grid kehadiran per kelas →
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          tone="success"
          title="Semua presensi periode ini sudah diisi"
          description="Tidak ada pertemuan tanpa presensi di jendela laporan ini."
        />
      ) : (
        <TableWrap className="max-h-[65vh] overflow-y-auto">
          <Table>
            <THead>
              <TR>
                <TH className={STICKY_TH}>Kelas</TH>
                <TH className={`${STICKY_TH} text-right`}>Pertemuan</TH>
                <TH className={STICKY_TH}>Tanggal yang kosong</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={`${r.kelasName}-${r.gender}`}>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{r.kelasName}</span>
                      <GenderBadge gender={r.gender} />
                    </div>
                  </TD>
                  <TD className="text-right font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                    {r.jumlah}
                  </TD>
                  <TD>
                    {/* Upstream sends "2026-08-04 Kelas Maahir" — the date plus
                        which program ran that day — so it is shown verbatim
                        rather than parsed into a bare date. */}
                    <div className="flex flex-wrap gap-1">
                      {daftar(r.tanggal).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted dark:bg-neutral-800"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </section>
  );
}

function SpPeriode({
  sp,
  program,
  label,
}: {
  sp: MaahirSpPayload | null | undefined;
  program: string;
  label: string | null;
}) {
  // The SP block here covers THIS PERIOD only (`perBulan: true`), while
  // `/[program]/sp` shows SP accumulated since the program started. The two
  // numbers are different by construction and must never be compared, so the
  // heading says which one this is and the link says what the other one is.
  const windowLabel = periodLabel({ mulai: sp?.mulai, sampai: sp?.cutoff }) ?? label;
  const summary = sp?.summary;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-ink-muted">
          <span>SP periode ini{windowLabel ? ` · ${windowLabel}` : ""}</span>
          <Badge tone="warning">per periode, bukan kumulatif</Badge>
        </h2>
        <Link
          href={`/${program}/sp`}
          className="text-xs font-medium text-primary hover:underline"
        >
          SP kumulatif sejak awal program →
        </Link>
      </div>

      {sp?.perBulan === false && (
        <Alert variant="warning">
          Upstream mengirim blok SP ini dengan <code>perBulan: false</code> — isinya kumulatif, bukan
          periode ini. Jangan bandingkan dengan angka periode sebelumnya sampai ini beres.
        </Alert>
      )}

      {/* Only SP 3 changes what anyone does; SP 1/2 and the whitewashed count are
          the breakdown of the total and ride as hints. A missing `summary` is
          "upstream sent no SP block", which is not the same as "nobody has an
          SP" — printing zeroes there would clear a warning nobody cleared. */}
      {summary ? (
        <KpiStrip
          items={[
            {
              label: "Peserta kena SP",
              value: summary.total,
              hint: `SP1 ${summary.sp1} · SP2 ${summary.sp2} · diputihkan ${summary.diputihkan} (dihitung hadir 100%)`,
            },
            {
              label: "SP 3",
              value: summary.sp3,
              hint: summary.sp3 > 0 ? "perlu tindakan" : "tidak ada",
              valueClassName: summary.sp3 > 0 ? "text-red-600 dark:text-red-400" : undefined,
            },
          ]}
        />
      ) : (
        <EmptyState
          title="Blok SP tidak ada di respons ini"
          description="Laporan yang tersimpan untuk periode ini tidak membawa ringkasan SP. Ini bukan berarti nol SP — jalankan sync maahir ulang, atau lihat SP kumulatif lewat tautan di atas."
        />
      )}
    </section>
  );
}

// ── Scope ───────────────────────────────────────────────────────────────────

/**
 * Did the API key get refused for this data (403 `forbidden_scope`)? The sync
 * records that in `maahir_sync_state.forbidden` so later runs skip the request;
 * without checking it, a scope that was never granted looks exactly like a sync
 * that never ran, and the screen would tell the coordinator to press sync forever.
 *
 * Both the route name and the bare scope name are accepted as the `entity` key —
 * this table is keyed per entity for the raw pass, and the rekap pass is free to
 * flag either. An unknown key just falls back to the "belum ditarik" wording,
 * which is the safe (never wrong, only less specific) message.
 */
async function scopeDitolak(programSlug: string): Promise<boolean> {
  const programRow = await getProgram(programSlug);
  if (!programRow) return false;
  const db = getDb();
  const rows = await db
    .select({ entity: maahirSyncState.entity })
    .from(maahirSyncState)
    .where(
      and(eq(maahirSyncState.programId, programRow.id), eq(maahirSyncState.forbidden, true)),
    );
  const flagged = new Set(rows.map((r) => r.entity));
  return flagged.has("rekap/laporan-maahir") || flagged.has("maahir") || flagged.has("scope:maahir");
}
