import Link from "next/link";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableWrap, TBody, TD, TDNum, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  FLAGS,
  presets,
  RECENT_LIMIT,
  SCORE_BAIK_MIN,
  type AsesmenInsight,
} from "@/lib/insights/alfatihah";

/** Live query string of the page, so every filter link keeps the other filters. */
export type Query = {
  preset?: string;
  gender?: string;
  q?: string;
  flag?: string;
  /** Canonical kegiatan group key — `?kg=hirs`. */
  kg?: string;
};

/** Sub-shapes read straight off the insight, so no type is re-declared here. */
type ProgStats = AsesmenInsight["progression"]["within"];
type TurunRow = AsesmenInsight["turun"][number];

const n = (v: number) => v.toLocaleString("id-ID");
const dec = (v: number | null, digits = 1) =>
  v == null ? "—" : v.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pctText = (v: number | null) => (v == null ? "—" : `${dec(v, 0)}%`);
/** `coverage` arrives as a fraction 0..1; `sameExaminerPct` already as 0..100. */
const fracPctText = (v: number | null) => (v == null ? "—" : pctText(v * 100));
/** Signed figure for a delta: `+1,02`, `−0,29`, `±0,00`. */
const signed = (v: number | null, digits = 2) =>
  v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${dec(Math.abs(v), digits)}`;

const TANGGAL = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" });
function hari(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? TANGGAL.format(new Date(t)) : iso;
}

/** Whole days between two Asia/Jakarta calendar days; null when either is unreadable. */
function jarakHari(a: string, b: string): number | null {
  const t1 = Date.parse(`${a}T00:00:00Z`);
  const t2 = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.round((t2 - t1) / 86_400_000);
}

/** `?a=1&b=2` with one key changed (or dropped when the value repeats/clears). */
function href(base: string, q: Query, patch: Partial<Query>): string {
  const sp = new URLSearchParams();
  const merged: Query = { ...q, ...patch };
  for (const key of ["preset", "gender", "q", "flag", "kg"] as const) {
    const v = merged[key];
    if (v) sp.set(key, v);
  }
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

function FilterLink({
  href: to,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-2.5 py-1 text-12 font-medium transition-colors",
        active
          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-900",
      )}
    >
      {children}
    </Link>
  );
}

function Section({
  title,
  hint,
  id,
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-2.5 scroll-mt-6">
      <div>
        <h2 className="text-16 font-semibold tracking-[-0.01em]">{title}</h2>
        {hint && <p className="mt-0.5 max-w-4xl text-12 text-ink-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Wording of the six row chips. `FLAGS` is imported rather than retyped so a
 * seventh flag upstream cannot quietly go missing from this row.
 */
const FLAG_LABEL: Record<string, string> = {
  "perlu-bimbingan": "skor ≤ 2",
  "tanpa-rekomendasi": "belum diisi rekomendasi",
  "tanpa-nama": "tanpa nama",
  "rek-dasar": "rekomendasi HITS Dasar",
  "rek-lanjutan": "rekomendasi HITS Lanjutan",
  berulang: "dinilai lebih dari sekali",
};

/** One line of the progression header: the counts, then the two deltas. */
function ProgresiBaris({ label, stats }: { label: string; stats: ProgStats }) {
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-14 font-medium">{label}</span>
        <span className="font-mono text-14 tabular-nums">{n(stats.n)}</span>
        <span className="text-12 text-ink-muted">orang</span>
        <span className="font-mono text-16 tabular-nums">{signed(stats.rawDelta)}</span>
        <span className="text-12 text-ink-muted">
          terkoreksi{" "}
          <span className="font-mono tabular-nums text-foreground">{signed(stats.adjustedDelta)}</span>
        </span>
      </div>
      <p className="mt-0.5 text-11 text-ink-faint">
        naik <span className="font-mono tabular-nums">{n(stats.up)}</span> · turun{" "}
        <span className="font-mono tabular-nums">{n(stats.down)}</span> · datar{" "}
        <span className="font-mono tabular-nums">{n(stats.flat)}</span>
      </p>
    </div>
  );
}

export function AsesmenView({
  data,
  base,
  query,
  sumber,
}: {
  data: AsesmenInsight;
  /** Route path without the query string, e.g. `/mabni/asesmen`. */
  base: string;
  query: Query;
  sumber: string;
}) {
  const { totals, flags, preset, progression, pemeriksa } = data;
  const filtered =
    data.gender != null || data.q != null || data.kg != null || data.flag != null;

  const ejaanCount = data.byGroup.reduce((acc, g) => acc + g.ejaan.length, 0);

  /**
   * A group is only linkable when `?kg=` can resolve it back. The synthetic
   * `belum-dikelompokkan` key cannot be resolved by `findKegiatanGroup`, so a
   * link there would set a param that silently filters nothing — worse than no
   * link at all.
   */
  const kgHref = (key: string, canonical: boolean) =>
    canonical ? href(base, query, { kg: data.kg?.key === key ? undefined : key }) : null;

  const activeChips: Array<{ label: string; clear: string }> = [];
  if (data.kg)
    activeChips.push({
      label: `kegiatan: ${data.kg.label}`,
      clear: href(base, query, { kg: undefined }),
    });
  if (data.gender)
    activeChips.push({
      label: `halaqah: ${data.gender}`,
      clear: href(base, query, { gender: undefined }),
    });
  if (data.q)
    activeChips.push({ label: `cari: “${data.q}”`, clear: href(base, query, { q: undefined }) });
  // The row chip sits beside the scoping chips but does NOT narrow the counts —
  // it only filters the "Asesmen terbaru" list. Without saying so it reads like
  // the others, i.e. as though 4.515 were already the filtered figure.
  if (data.flag)
    activeChips.push({
      label: `baris: ${FLAG_LABEL[data.flag] ?? data.flag} — hanya daftar terbaru`,
      clear: href(base, query, { flag: undefined }),
    });

  return (
    <div className="space-y-7">
      {/* ── filter bar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <nav aria-label="Periode" className="flex items-center gap-1">
          <span className="cap text-11 text-ink-faint">Periode</span>
          {presets().map((p) => (
            <FilterLink
              key={p.key}
              href={href(base, query, { preset: p.key })}
              active={preset.key === p.key}
            >
              {p.label}
            </FilterLink>
          ))}
        </nav>
        <nav aria-label="Jenis halaqah" className="flex items-center gap-1">
          <span className="cap text-11 text-ink-faint">Halaqah</span>
          <FilterLink href={href(base, query, { gender: undefined })} active={data.gender == null}>
            Semua
          </FilterLink>
          <FilterLink href={href(base, query, { gender: "ikhwan" })} active={data.gender === "Ikhwan"}>
            Ikhwan
          </FilterLink>
          <FilterLink href={href(base, query, { gender: "akhwat" })} active={data.gender === "Akhwat"}>
            Akhwat
          </FilterLink>
        </nav>
        {/* Native GET form — no client JS. The hidden inputs carry the filters the
            form does not own; without them, submitting a search would silently
            drop the kegiatan scope and the row chip. */}
        <form action={base} method="get" className="flex items-center gap-1.5">
          {preset.key !== "tahun" && <input type="hidden" name="preset" value={preset.key} />}
          {data.gender && <input type="hidden" name="gender" value={data.gender.toLowerCase()} />}
          {data.kg && <input type="hidden" name="kg" value={data.kg.key} />}
          {data.flag && <input type="hidden" name="flag" value={data.flag} />}
          <input
            type="search"
            name="q"
            defaultValue={data.q ?? ""}
            placeholder="Cari nama, kegiatan, pemeriksa…"
            aria-label="Cari nama peserta, kegiatan, atau pemeriksa"
            className="h-8 w-56 rounded-md border border-neutral-200 bg-transparent px-2.5 text-12 placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-neutral-800"
          />
          <button
            type="submit"
            className="h-8 rounded-md border border-neutral-200 px-2.5 text-12 font-medium hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            Saring
          </button>
        </form>
        {filtered && (
          <Link
            href={href(base, { preset: preset.key }, {})}
            className="text-12 text-ink-muted underline underline-offset-2 hover:text-foreground"
          >
            Bersihkan saringan
          </Link>
        )}
      </div>

      {totals.evaluations === 0 ? (
        <EmptyState
          icon="🔎"
          title="Tidak ada asesmen pada saringan ini"
          description={
            filtered
              ? "Longgarkan saringan kegiatan/halaqah, atau pilih periode yang lebih panjang."
              : `Tidak ada penilaian tercatat di ${preset.label.toLowerCase()} pada sumber ${sumber}.`
          }
        />
      ) : (
        <>
          {/* ── KPI + pita skor sebagai legenda halaman ─────────────────── */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <KpiStrip
                hero={{
                  label: "Peserta ter-asesmen",
                  // Preformatted on purpose: a count is not a 0–100 progress, and
                  // passing it as a number would draw a full bar.
                  value: n(totals.participants),
                  unit: "orang",
                  // No `target`, `delta` or `spark`, deliberately — and this is a
                  // considered refusal, not an omission, so please read before
                  // adding one. There is no agreed target for this figure, so a
                  // bar would be invented. A month-over-month delta or a monthly
                  // sparkline would be worse than invented: two days carry 42 %
                  // of this source and five carry 65 %, so the series tracks when
                  // a mass assessment was scheduled, not how anyone is reading.
                  // Rendered as a trend it would invite "we are declining" every
                  // month that happened to hold no event — the exact misreading
                  // this page exists to prevent, and the reason the per-month
                  // table was replaced by the busiest-days list below. The
                  // decisions live in the issue chips and in #progresi.
                }}
                support={[
                  { label: "Penilaian", value: n(totals.evaluations) },
                  {
                    label: "Dinilai ≥ 2×",
                    value: n(progression.cohort),
                    // No hint: KpiStrip renders hints in mono, and mono is for
                    // numbers only (components/ui/README.md).
                    href: "#progresi",
                  },
                  {
                    label: `Bacaan baik (≥ ${SCORE_BAIK_MIN})`,
                    value: pctText(totals.baikPct),
                    hint: `${n(totals.baik)}/${n(totals.evaluations)}`,
                  },
                ]}
                issues={[
                  {
                    // Warning, not danger: on “Semua data” this chip carries
                    // hundreds of rows, and permanent red is exactly the failure
                    // docs/UI-REVIEW-2026-09.md §1 names.
                    label: "perlu bimbingan (skor ≤ 2)",
                    value: flags.perluBimbingan,
                    tone: "warning",
                    href: `${href(base, query, { flag: "perlu-bimbingan" })}#terbaru`,
                  },
                  {
                    label: "tanpa nama (tak bisa dirangkai)",
                    value: flags.tanpaNama,
                    href: `${href(base, query, { flag: "tanpa-nama" })}#terbaru`,
                  },
                ]}
                allClearText="Tidak ada peserta perlu bimbingan, dan semua baris bernama"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 lg:w-52 lg:shrink-0 lg:flex-col lg:items-start">
              <span className="cap text-11 text-ink-faint">Pita skor</span>
              {data.bands.map((b) => (
                <Badge key={b.band.key} tone={b.band.tone}>
                  {b.band.label} {n(b.count)} · {dec(b.pct, 0)}%
                </Badge>
              ))}
            </div>
          </div>

          {/* Denominator + active filters + the instrument caveat. Permanent:
              the strip alone cannot say what share of the window it describes. */}
          <div className="-mt-4 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-11 text-ink-faint">
                Menampilkan <span className="font-mono tabular-nums">{n(totals.evaluations)}</span> dari{" "}
                <span className="font-mono tabular-nums">{n(data.windowEvaluations)}</span> penilaian
                pada {preset.label.toLowerCase()}
              </span>
              {activeChips.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2 py-0.5 text-11 text-ink-muted dark:border-neutral-800"
                >
                  {c.label}
                  <Link
                    href={c.clear}
                    aria-label={`Hapus saringan ${c.label}`}
                    className="text-ink-faint hover:text-foreground"
                  >
                    ×
                  </Link>
                </span>
              ))}
            </div>
            <p className="max-w-4xl text-11 text-ink-faint">
              Aplikasi asesmen memberi judul yang sama — “Baik” — untuk level 6, 7, dan 8. Jadi “baik
              ≥ {SCORE_BAIK_MIN}” lebih menggambarkan tombol yang ditekan pemeriksa daripada selisih
              bacaan.
              {totals.tanpaSkor > 0 && (
                <>
                  {" "}
                  {n(totals.tanpaSkor)} penilaian tidak membawa skor yang bisa dibaca dan tidak ikut
                  jadi penyebut persentase itu — bukan berarti bacaannya buruk, hanya angkanya tidak
                  terbaca.
                </>
              )}
            </p>
          </div>

          {/* ── 1. per kegiatan ─────────────────────────────────────────── */}
          <Section
            id="kegiatan"
            title={`Per kegiatan · ${n(data.byGroup.length)} kelompok`}
            hint={
              <>
                “Kegiatan” adalah teks bebas yang diketik pemeriksa; ejaan yang berbeda untuk acara
                yang sama sudah digabung — daftarnya ada di peta di bawah tabel. Klik nama kegiatan
                untuk menyaring seluruh halaman ke acara itu.{" "}
                <strong className="font-medium">
                  Rata² skor tidak bisa dibandingkan antar-kegiatan tanpa melihat pemeriksanya
                </strong>{" "}
                —{" "}
                <a href="#pemeriksa" className="underline underline-offset-2 hover:text-foreground">
                  lihat kalibrasi pemeriksa
                </a>
                . Kolom <em className="not-italic font-medium">Pemeriksa</em> = jumlah penilai
                berbeda di acara itu; <em className="not-italic font-medium">Belum diisi</em> =
                baris yang kolom rekomendasinya dibiarkan kosong oleh pemeriksa.
              </>
            }
          >
            <TableWrap maxHeight="60vh">
              <Table>
                <THead sticky>
                  <TR>
                    <TH>Kegiatan</TH>
                    <TH numeric>Penilaian</TH>
                    <TH numeric>Peserta</TH>
                    <TH numeric>Hari</TH>
                    <TH numeric title="Berapa pemeriksa berbeda yang menilai di kegiatan ini. Angka 1 berarti seluruh skor kegiatan ini berasal dari satu orang.">
                      Pemeriksa
                    </TH>
                    <TH numeric>Rata² skor</TH>
                    <TH numeric>Baik ≥ {SCORE_BAIK_MIN}</TH>
                    <TH numeric>HITS Dasar</TH>
                    <TH numeric>HITS Lanjutan</TH>
                    <TH numeric title="Penilaian yang kolom rekomendasi programnya dibiarkan kosong oleh pemeriksa.">
                      Belum diisi
                    </TH>
                  </TR>
                </THead>
                <TBody zebra>
                  {data.byGroup.map((g) => {
                    const to = kgHref(g.key, g.canonical);
                    const active = data.kg?.key === g.key;
                    return (
                      <TR key={g.key}>
                        <TD className="max-w-[24rem]">
                          {to ? (
                            <Link
                              href={to}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "underline decoration-neutral-300 underline-offset-2 hover:decoration-current dark:decoration-neutral-700",
                                active && "font-semibold",
                              )}
                              title={
                                active
                                  ? "Sedang disaring ke kegiatan ini — klik untuk kembali ke semua kegiatan"
                                  : "Saring halaman ke kegiatan ini"
                              }
                            >
                              {g.label}
                            </Link>
                          ) : (
                            <span title={g.label}>{g.label}</span>
                          )}
                          {!g.canonical && (
                            <Badge tone="warning" className="ml-1.5">
                              belum dikelompokkan
                            </Badge>
                          )}
                        </TD>
                        <TDNum value={n(g.evaluations)} />
                        <TDNum value={n(g.participants)} />
                        <TDNum value={n(g.days)} />
                        <TDNum value={n(g.pemeriksa)} />
                        <TDNum value={dec(g.avgScore)} />
                        <TDNum
                          value={pctText(g.baikPct)}
                          fraction={`${n(g.baik)}/${n(g.evaluations)}`}
                        />
                        <TDNum
                          value={<RekCell base={base} query={query} g={g} flag="rek-dasar" value={g.rekDasar} />}
                        />
                        <TDNum
                          value={
                            <RekCell base={base} query={query} g={g} flag="rek-lanjutan" value={g.rekLanjutan} />
                          }
                        />
                        <TDNum
                          valueClassName="text-ink-faint"
                          value={
                            <RekCell
                              base={base}
                              query={query}
                              g={g}
                              flag="tanpa-rekomendasi"
                              value={g.rekBelum}
                            />
                          }
                        />
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>

            {/* (a) hari tersibuk — pengganti tabel per bulan */}
            <div className="space-y-1.5 pt-2">
              <h3 className="text-14 font-medium">Hari tersibuk</h3>
              <p className="max-w-4xl text-12 text-ink-muted">
                Sebagian besar sumber ini berasal dari segelintir hari asesmen massal, jadi baris
                “per bulan” pada akhirnya hanya melaporkan bulan mana yang kebagian acara besar.
                Daftar hari mengatakannya langsung.
              </p>
              {data.hariTersibuk.length === 0 ? (
                <p className="text-12 text-ink-faint">
                  Tidak ada tanggal yang bisa dibaca dari saringan ini — bukan berarti tidak ada
                  asesmen, hanya tidak ada <code className="text-11">created_at</code> yang terbaca.
                </p>
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Tanggal</TH>
                        <TH>Kegiatan</TH>
                        <TH numeric>Penilaian</TH>
                        <TH numeric>Pemeriksa</TH>
                        <TH numeric>Rata² skor</TH>
                        <TH numeric>% dari jendela</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.hariTersibuk.map((d) => (
                        <TR key={d.tanggal}>
                          <TD className="whitespace-nowrap tabular-nums">{hari(d.tanggal)}</TD>
                          <TD className="max-w-[20rem] truncate text-ink-muted" title={d.kegiatanLabel}>
                            {d.kegiatanLabel}
                          </TD>
                          <TDNum value={n(d.evaluations)} />
                          <TDNum value={n(d.pemeriksa)} />
                          <TDNum value={dec(d.avgScore)} />
                          <TDNum value={pctText(d.pct)} />
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </div>

            {/* (b) peta ejaan — permukaan audit, nada netral */}
            <details
              id="peta-kegiatan"
              className="scroll-mt-6 rounded-md border border-neutral-200 px-3 py-2 text-12 text-ink-muted dark:border-neutral-800"
            >
              <summary className="cursor-pointer font-medium text-ink-muted">
                Peta nama kegiatan — {n(ejaanCount)} ejaan → {n(data.byGroup.length)} kelompok
              </summary>
              <div className="mt-2 space-y-1.5">
                <p className="text-11 text-ink-faint">
                  Persis apa yang digabung menjadi apa, dengan jumlah penilaian per ejaan. Penulisan
                  baru yang belum pernah dilihat tidak dimasukkan ke kelompok mana pun — ia muncul
                  sebagai baris “belum dikelompokkan” di tabel di atas.
                </p>
                {data.byGroup.map((g) => (
                  <p key={g.key} className="leading-relaxed">
                    <span className="font-medium text-foreground">{g.label}</span>{" "}
                    <span className="text-ink-faint">←</span>{" "}
                    {g.ejaan.map((e, i) => (
                      <span key={e.raw}>
                        {i > 0 && <span className="text-ink-faint"> · </span>}
                        “{e.raw}”{" "}
                        <span className="font-mono text-11 tabular-nums text-ink-faint">
                          {n(e.evaluations)}
                        </span>
                      </span>
                    ))}
                  </p>
                ))}
              </div>
            </details>
          </Section>

          {/* ── 2. progresi ─────────────────────────────────────────────── */}
          <Section
            id="progresi"
            title="Tes ulang per kegiatan"
            hint="Satuan tabel di bawah adalah ACARA, bukan orang: seseorang yang pindah acara antara tes pertama dan terakhir tidak dihitung sebagai keuntungan acara mana pun. Kolom “% dari peserta acara” = jumlah yang dites ulang dibagi peserta unik acara itu."
          >
            {progression.cohort === 0 ? (
              <EmptyState
                icon="🔁"
                title="Belum ada yang dinilai dua kali di sini"
                description="Tidak ada nama yang dinilai lebih dari sekali pada saringan ini — bukan berarti tidak ada yang berkembang, hanya belum ada yang dinilai dua kali di sini."
              />
            ) : (
              <>
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    <ProgresiBaris label="Dalam kegiatan yang sama" stats={progression.within} />
                    <ProgresiBaris
                      label="Dinilai ulang di kegiatan berbeda"
                      stats={progression.cross}
                    />
                  </div>
                </div>

                <p className="max-w-4xl text-12 text-ink-muted">
                  Perbaikan yang terukur terjadi <strong className="font-medium">di dalam</strong>{" "}
                  satu kelas tahsin: {n(progression.within.n)} orang, {signed(progression.within.rawDelta)}{" "}
                  mentah dan {signed(progression.within.adjustedDelta)} setelah dikoreksi pemeriksa.
                  Peserta yang dinilai ulang di acara lain rata-rata tidak berubah —{" "}
                  {n(progression.cross.n)} orang, {signed(progression.cross.rawDelta)} mentah dan{" "}
                  {signed(progression.cross.adjustedDelta)} terkoreksi — selisihnya lebih
                  menggambarkan pergantian pemeriksa daripada kemajuan bacaan.
                </p>
                <p className="max-w-4xl text-12 text-ink-muted">
                  Mereka yang ikut tes kedua adalah sebagian kecil peserta acara-acara itu — yang
                  tidak kembali tidak terhitung di sini, jadi angka ini menggambarkan yang bertahan,
                  bukan seluruh peserta.
                </p>

                <TableWrap maxHeight="60vh">
                  <Table>
                    <THead sticky>
                      <TR>
                        <TH>Kegiatan</TH>
                        <TH numeric>Dites ulang</TH>
                        <TH numeric title="Bagian dari peserta unik acara itu yang sempat dites ulang di acara yang sama.">
                          % dari peserta acara
                        </TH>
                        <TH numeric>naik/turun/datar</TH>
                        <TH numeric title="Selisih skor awal→akhir setelah dikurangi selisih rata-rata kedua pemeriksanya. Selisih mentah sengaja tidak ditampilkan: per acara ia menyesatkan.">
                          Δ terkoreksi
                        </TH>
                        <TH
                          numeric
                          title="PERINGATAN PENYAMARAN, bukan nilai mutu. Persentase tinggi berarti pemeriksa yang sama menilai awal dan akhir — ia mengenal orangnya, tahu apa yang ia perbaiki, dan sedang menilai pekerjaannya sendiri. Bias itu berarah. Baca tinggi sebagai TIDAK TERSAMARKAN, bukan sebagai konsisten."
                        >
                          % pemeriksa sama
                        </TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.retest.map((r) => (
                        <TR key={r.key}>
                          <TD className="max-w-[22rem] truncate" title={r.label}>
                            {r.label}
                          </TD>
                          <TDNum
                            value={n(r.retested)}
                            fraction={`dari ${n(r.participants)}`}
                            valueClassName={r.retested === 0 ? "text-ink-faint" : undefined}
                          />
                          <TDNum value={fracPctText(r.coverage)} />
                          <TDNum
                            // "0/0/0", not an em dash: nobody came back is a
                            // counted fact, and the dash is reserved for values
                            // this page could not read.
                            value={`${n(r.up)}/${n(r.down)}/${n(r.flat)}`}
                            valueClassName={r.retested === 0 ? "text-ink-faint" : undefined}
                          />
                          <TDNum value={signed(r.adjustedDelta)} />
                          <TDNum
                            value={pctText(r.sameExaminerPct)}
                            valueClassName={
                              r.sameExaminerPct != null && r.sameExaminerPct >= 50
                                ? "text-warn"
                                : undefined
                            }
                          />
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
                <p className="max-w-4xl text-11 text-ink-faint">
                  <strong className="font-medium">Cara membaca “% pemeriksa sama”:</strong>{" "}
                  persentase tinggi berarti pemeriksa yang sama memberi skor di kedua ujung — ia
                  sudah mengenal orangnya dan sedang menilai hasil kerjanya sendiri, sehingga
                  biasnya berarah ke satu sisi. Pemeriksa berbeda di kedua ujung juga tidak sepakat,
                  tapi ketidaksepakatannya tak berarah dan sebagian besar saling meniadakan.
                  Karena itu kenaikan besar pada baris ber-persentase tinggi adalah angka yang
                  paling <em>tidak</em> bisa dipercaya di tabel ini — baca tinggi sebagai “tidak
                  tersamarkan”, jangan pernah sebagai “konsisten”.
                </p>

                {/* Yang skornya turun — kecil, ganjil, bisa dicek */}
                <div className="space-y-1.5 pt-2">
                  <h3 className="text-14 font-medium">
                    Skornya turun di kegiatan yang sama · {n(data.turun.length)} orang
                  </h3>
                  {data.turun.length === 0 ? (
                    <p className="text-12 text-ink-faint">
                      Tidak ada peserta yang skornya turun pada saringan ini.
                    </p>
                  ) : (
                    <TableWrap>
                      <Table>
                        <THead>
                          <TR>
                            <TH>Nama</TH>
                            <TH>Kegiatan</TH>
                            <TH numeric>Skor awal → akhir</TH>
                            <TH numeric>Δ</TH>
                            <TH numeric>Jarak (hari)</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {data.turun.map((p) => (
                            <TurunTR key={p.key} p={p} />
                          ))}
                        </TBody>
                      </Table>
                    </TableWrap>
                  )}
                </div>
              </>
            )}

            {/* Metodologi dilipat, nada netral — bukan Alert, bukan kotak berwarna. */}
            <details className="rounded-md border border-neutral-200 px-3 py-2 text-12 text-ink-muted dark:border-neutral-800">
              <summary className="cursor-pointer font-medium text-ink-muted">
                Catatan metodologi: siapa yang masuk hitungan progresi?
              </summary>
              <div className="mt-1.5 max-w-4xl space-y-1.5 leading-relaxed">
                <p>
                  Sumber ini tidak punya id peserta maupun nomor telepon, jadi satu-satunya kunci
                  orang adalah nama yang diketik. Yang boleh <em>dijumlahkan</em> hanya nama dengan
                  minimal dua kata, jenis halaqah yang konsisten di semua barisnya, dan tes ulang
                  yang jatuh di minimal dua hari kalender berbeda. Sisanya tetap terlihat di seluruh
                  halaman, hanya tidak ikut rata-rata.
                </p>
                <p>
                  Tidak lolos saringan itu:{" "}
                  <span className="font-mono tabular-nums">{n(progression.droppedSingleWord)}</span>{" "}
                  nama satu kata,{" "}
                  <span className="font-mono tabular-nums">{n(progression.droppedGenderConflict)}</span>{" "}
                  nama yang barisnya berbeda jenis halaqah (berarti setidaknya dua orang), dan{" "}
                  <span className="font-mono tabular-nums">{n(progression.droppedSameDay)}</span>{" "}
                  yang tes ulangnya di hari yang sama.{" "}
                  <strong className="font-medium">
                    Ketiga angka ini saling tumpang tindih dan bukan pembagian yang rapi
                  </strong>{" "}
                  — satu nama satu kata bisa sekaligus tes ulang di hari yang sama, jadi jangan
                  dijumlahkan.
                </p>
                <p>
                  <span className="font-mono tabular-nums">{n(progression.unnamedEvaluations)}</span>{" "}
                  penilaian sama sekali tanpa nama tidak bisa dirangkai ke siapa pun; angka itu
                  dilaporkan apa adanya, tidak pernah diam-diam dikurangkan dari penyebut.
                </p>
                <p>
                  Δ terkoreksi = selisih skor dikurangi selisih rata-rata kedua pemeriksanya. Itu
                  pemeriksaan kewarasan, bukan angka yang lebih benar: ia menganggap tiap pemeriksa
                  menghadapi peserta yang sebanding, padahal pemeriksa tertentu memang ditugaskan ke
                  kelas pemula.
                </p>
              </div>
            </details>

            <p className="max-w-4xl text-11 text-ink-faint">
              Corong “direkomendasikan → benar-benar masuk kelas” tidak ditampilkan: satu-satunya
              kunci yang diberikan API asesmen adalah nama, dan menyambungkan nama ke roster akan
              mengarang orang. Pertanyaan itu baru bisa dijawab kalau API asesmen ikut mengirim
              nomor telepon.
            </p>
          </Section>

          {/* ── 3. pemeriksa ────────────────────────────────────────────── */}
          <Section
            id="pemeriksa"
            title="Pemeriksa & kalibrasi"
            hint="Kolom Selisih membandingkan seorang pemeriksa dengan campuran acara yang ia kerjakan sendiri — bukan dengan rata-rata keseluruhan. Itulah bedanya perbandingan yang adil dengan vonis pribadi: sebagian pemeriksa memang ditugaskan ke acara yang skornya rendah."
          >
            <p className="max-w-4xl text-12 text-ink-muted">
              {pemeriksa.spread ? (
                <>
                  <span className="font-mono tabular-nums">{n(pemeriksa.rows.length)}</span> pemeriksa
                  dengan ≥{pemeriksa.minEvaluations} penilaian punya rata-rata skor antara{" "}
                  <strong className="font-mono font-medium tabular-nums">
                    {dec(pemeriksa.spread.min, 2)}
                  </strong>{" "}
                  dan{" "}
                  <strong className="font-mono font-medium tabular-nums">
                    {dec(pemeriksa.spread.max, 2)}
                  </strong>{" "}
                  — rata-rata keseluruhan{" "}
                  <span className="font-mono tabular-nums">{dec(pemeriksa.globalMean, 2)}</span>.
                </>
              ) : (
                <>
                  Belum ada pemeriksa dengan ≥{pemeriksa.minEvaluations} penilaian pada saringan ini
                  — rata-ratanya belum bisa dibandingkan. Rata-rata keseluruhan{" "}
                  <span className="font-mono tabular-nums">{dec(pemeriksa.globalMean, 2)}</span>.
                </>
              )}
            </p>

            {pemeriksa.rows.length === 0 ? (
              <EmptyState
                icon="⚖️"
                title={`Belum ada pemeriksa dengan ≥${pemeriksa.minEvaluations} penilaian`}
                description={`Belum ada pemeriksa dengan ≥${pemeriksa.minEvaluations} penilaian pada saringan ini — rata-ratanya belum bisa dibandingkan.`}
              />
            ) : (
              <TableWrap maxHeight="60vh">
                <Table>
                  <THead sticky>
                    <TR>
                      <TH>Pemeriksa</TH>
                      <TH numeric>Penilaian</TH>
                      <TH numeric>Peserta</TH>
                      <TH numeric>Rata²</TH>
                      <TH numeric title="Rata-rata pemeriksa ini dikurangi rata-rata campuran acara yang ia kerjakan, ditimbang oleh porsi kerjanya di tiap acara. Pembandingnya BUKAN rata-rata keseluruhan.">
                        Selisih
                      </TH>
                      <TH numeric>Baik %</TH>
                      <TH numeric>Kegiatan</TH>
                      <TH numeric>Hari</TH>
                    </TR>
                  </THead>
                  <TBody zebra>
                    {pemeriksa.rows.map((r) => (
                      <TR key={r.nama}>
                        <TD className="max-w-[18rem]">
                          <span className="truncate" title={r.nama}>
                            {r.nama}
                          </span>
                          {r.ejaanGanda && (
                            <span
                              className="ml-1.5 text-11 text-ink-faint"
                              title="Ejaan ini kemungkinan orang yang sama dengan ejaan lain di daftar. Sengaja TIDAK digabung — lihat Catatan data."
                            >
                              ejaan ganda
                            </span>
                          )}
                        </TD>
                        <TDNum value={n(r.evaluations)} />
                        <TDNum value={n(r.peserta)} />
                        <TDNum value={dec(r.meanScore, 2)} />
                        <TDNum
                          value={signed(r.deviation)}
                          valueClassName={
                            r.deviation != null && Math.abs(r.deviation) >= 1.5
                              ? "text-warn"
                              : undefined
                          }
                        />
                        <TDNum value={pctText(r.baikPct)} fraction={`${n(r.baik)}/${n(r.evaluations)}`} />
                        <TDNum value={n(r.kegiatan)} />
                        <TDNum value={n(r.hari)} />
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}

            {pemeriksa.belowThreshold > 0 && (
              <p className="max-w-4xl text-12 text-ink-muted">
                <span className="font-mono tabular-nums">{n(pemeriksa.belowThreshold)}</span>{" "}
                pemeriksa lain punya &lt; {pemeriksa.minEvaluations} penilaian dan tidak ditampilkan
                — rata-ratanya terlalu goyah untuk dibandingkan, bukan karena tidak ada datanya.
                Penilaian mereka tetap ikut di setiap angka lain pada halaman ini.
              </p>
            )}

            <div className="rounded-md border border-neutral-200 px-3 py-2.5 text-12 text-ink-muted dark:border-neutral-800">
              <h3 className="text-12 font-medium text-foreground">Catatan data</h3>
              <div className="mt-1.5 max-w-4xl space-y-2 leading-relaxed">
                <div>
                  <p>
                    Ejaan yang kemungkinan besar satu orang —{" "}
                    <span className="font-mono tabular-nums">{n(pemeriksa.spellingClusters.length)}</span>{" "}
                    kelompok. Sengaja <strong className="font-medium">dideteksi, tidak digabung</strong>:
                    menggabung akan mengubah jumlah penilaian, dan jumlah itulah yang menentukan siapa
                    lolos ambang ≥{pemeriksa.minEvaluations} dan tampil di tabel di atas. Perbaikannya
                    di sistem sumber; daftar ini adalah daftar kerjanya.
                  </p>
                  {pemeriksa.spellingClusters.length === 0 ? (
                    <p className="mt-1 text-ink-faint">
                      Tidak ada ejaan ganda yang terdeteksi pada saringan ini.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {pemeriksa.spellingClusters.map((c) => (
                        <li key={c.canonical}>
                          {c.spellings.map((s, i) => (
                            <span key={s.nama}>
                              {i > 0 && <span className="text-ink-faint"> = </span>}
                              “{s.nama}”{" "}
                              <span className="font-mono text-11 tabular-nums text-ink-faint">
                                {n(s.evaluations)}
                              </span>
                            </span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p>
                    Akun uji yang ditemukan berdasarkan namanya. Barisnya{" "}
                    <strong className="font-medium">tetap ikut dihitung</strong> di seluruh angka
                    halaman ini dan di KPI scorecard C312; mengeluarkannya di sini akan membuat
                    halaman ini berselisih dengan scorecard tanpa ada yang diberi tahu. Hapus akunnya
                    di sistem sumber, bukan di tampilan.
                  </p>
                  {pemeriksa.akunUji.length === 0 ? (
                    <p className="mt-1 text-ink-faint">
                      Tidak ada akun uji pada saringan ini.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {pemeriksa.akunUji.map((a) => (
                        <li key={a.nama}>
                          “{a.nama}”{" "}
                          <span className="font-mono text-11 tabular-nums text-ink-faint">
                            {n(a.evaluations)}
                          </span>{" "}
                          penilaian
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </Section>

          {/* ── 4. baris terbaru ────────────────────────────────────────── */}
          <Section
            id="terbaru"
            title="Asesmen terbaru"
            hint={
              data.flag
                ? `Hanya baris ${FLAG_LABEL[data.flag] ?? data.flag}.`
                : `${RECENT_LIMIT} penilaian terakhir pada saringan ini.`
            }
          >
            <div className="flex flex-wrap items-center gap-1">
              <FilterLink href={`${href(base, query, { flag: undefined })}#terbaru`} active={!data.flag}>
                Semua
              </FilterLink>
              {FLAGS.map((f) => (
                <FilterLink
                  key={f}
                  href={`${href(base, query, { flag: f })}#terbaru`}
                  active={data.flag === f}
                >
                  {FLAG_LABEL[f] ?? f}
                </FilterLink>
              ))}
            </div>

            {data.recent.length === 0 ? (
              <EmptyState
                // Green claims an achievement, so it is only honest for the two
                // flags where "none" is genuinely good news. For a neutral cut
                // (rekomendasi, berulang, free-text search) an empty result is
                // just an empty result.
                tone={
                  data.flag === "perlu-bimbingan" || data.flag === "tanpa-nama"
                    ? "success"
                    : "neutral"
                }
                icon={data.flag === "perlu-bimbingan" || data.flag === "tanpa-nama" ? "✓" : "🔎"}
                title="Tidak ada baris seperti itu"
                description="Tidak ada penilaian yang cocok dengan saringan ini pada periode terpilih."
              />
            ) : (
              <>
                <TableWrap maxHeight="60vh">
                  <Table>
                    <THead sticky>
                      <TR>
                        <TH>Tanggal</TH>
                        <TH>Nama</TH>
                        <TH>Kegiatan</TH>
                        <TH>Halaqah</TH>
                        <TH>Pemeriksa</TH>
                        <TH numeric>Skor</TH>
                        <TH>Level</TH>
                        <TH>Rekomendasi</TH>
                      </TR>
                    </THead>
                    <TBody zebra>
                      {data.recent.map((r) => (
                        <TR key={r.uuid}>
                          <TD className="whitespace-nowrap tabular-nums text-ink-muted">
                            {hari(r.tanggal)}
                          </TD>
                          <TD className={cn("max-w-[14rem] truncate", !r.nama && "text-ink-faint")}>
                            {r.nama ?? "tanpa nama"}
                          </TD>
                          <TD className="max-w-[16rem] truncate" title={r.kegiatan ?? undefined}>
                            {r.kegiatan ?? "—"}
                          </TD>
                          <TD className="text-ink-muted">{r.asalHalaqah ?? "—"}</TD>
                          <TD className="max-w-[14rem] truncate text-ink-muted" title={r.pemeriksa ?? undefined}>
                            {r.pemeriksa ?? "—"}
                          </TD>
                          {/* Kosong bukan nol: skor tak terbaca tampil "—", bukan 0. */}
                          <TDNum
                            value={r.score ?? "—"}
                            valueClassName={r.score == null ? "text-ink-faint" : undefined}
                          />
                          <TD>
                            {r.levelTitle == null ? (
                              <span className="text-ink-faint">belum terbaca</span>
                            ) : (
                              <Badge tone={r.tone}>{r.levelTitle}</Badge>
                            )}
                          </TD>
                          <TD className={cn(!r.rekomendasi && "text-ink-faint")}>
                            {r.rekomendasi ?? "belum diisi"}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
                {data.recentTruncated > 0 && (
                  <p className="text-11 text-ink-faint">
                    {n(data.recentTruncated)} baris lain tidak ditampilkan — persempit saringan untuk
                    melihatnya.
                  </p>
                )}
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/**
 * A recommendation count that drills into the matching raw rows. Only linked when
 * the group's key can be resolved back from `?kg=` — otherwise the link would
 * scope the flag to the whole window while looking like it scoped to this row.
 */
function RekCell({
  base,
  query,
  g,
  flag,
  value,
}: {
  base: string;
  query: Query;
  g: AsesmenInsight["byGroup"][number];
  flag: Query["flag"];
  value: number;
}) {
  // A real zero prints as "0", not as the em dash. The dash is this page's
  // glyph for "we could not read this" (an unscored row, a null delta), and
  // spending it on a counted, known zero is the mirror of the rule the rest of
  // the page keeps: kosong bukan nol, so nol juga tidak boleh tampil seperti
  // kosong. It stays muted because a zero here is unremarkable, not because it
  // is uncertain.
  if (value === 0) return <span className="text-ink-faint">0</span>;
  if (!g.canonical) return <>{n(value)}</>;
  return (
    <Link
      href={`${href(base, query, { kg: g.key, flag })}#terbaru`}
      className="underline decoration-neutral-300 underline-offset-2 hover:decoration-current dark:decoration-neutral-700"
    >
      {n(value)}
    </Link>
  );
}

/** One person whose second score, in the same event, was lower than the first. */
function TurunTR({ p }: { p: TurunRow }) {
  const first = p.entries[0];
  const last = p.entries[p.entries.length - 1];
  const jarak = first && last ? jarakHari(first.tanggal, last.tanggal) : null;
  return (
    <TR>
      <TD className="max-w-[14rem] truncate" title={p.nama}>
        {p.nama}
      </TD>
      <TD className="max-w-[16rem] truncate text-ink-muted" title={first?.kegiatanLabel}>
        {first?.kegiatanLabel ?? "—"}
      </TD>
      <TDNum value={`${p.firstScore ?? "—"} → ${p.lastScore ?? "—"}`} />
      {/* Amber, never red: a score that went down does not break anything today —
          it is either a real regression to follow up or a generous first read. */}
      <TDNum value={signed(p.delta, 0)} valueClassName="text-warn" />
      <TDNum value={jarak == null ? "—" : n(jarak)} />
    </TR>
  );
}
