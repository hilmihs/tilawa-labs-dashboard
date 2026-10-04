import Link from "next/link";
import { getDashboardData, TANPA_KELAS, TANPA_MARHALAH } from "./queries";
import { HalaqahTable, type HalaqahFocus } from "./HalaqahTable";
import { getHalaqahList } from "@/lib/insights/halaqah";
import { getLastSync, lastSyncLabel } from "@/lib/sync/last-sync";
import { BatchSwitcher, ProgramBatchSwitcher } from "../BatchSwitcher";
import { getBatchSiblings } from "@/lib/programs/families";
import { getProgramBatches, resolveBatchParam } from "@/lib/programs/batches";
import { getProgram } from "@/lib/programs/resolve";
import { getDashboardSemuaBatch } from "./semua-batch";
import { Alert } from "@/components/ui/alert";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { syncTone, SYNC_THRESHOLD_HINT, type SyncTone } from "@/components/ui/sync-status";

/**
 * The sync pill is coloured by how old the data is, not by the mere existence
 * of a gap — colouring every gap red (the old behaviour) taught everyone to
 * ignore the colour. Thresholds live in `components/ui/sync-status` so this
 * screen, /peserta and /pengajar cannot drift apart; only the dot colour is
 * local, since the shared component renders text.
 */
const SYNC_TOOLTIP = SYNC_THRESHOLD_HINT;

const SYNC_DOT: Record<SyncTone, string> = {
  fresh: "bg-emerald-600 dark:bg-emerald-400",
  aging: "bg-amber-600 dark:bg-amber-400",
  stale: "bg-red-600 dark:bg-red-400",
  unknown: "bg-amber-600 dark:bg-amber-400",
};
const SYNC_TEXT: Record<SyncTone, string> = {
  fresh: "text-ok",
  aging: "text-warn",
  stale: "text-danger",
  unknown: "text-warn",
};

const NUM = new Intl.NumberFormat("id-ID");
/** Persen satu desimal dengan koma desimal Indonesia: 81,4 — sama dengan tabel halaqah. */
const PCT = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Micro-label shared by every card and section heading on this page. */
const LABEL = "cap text-11 font-bold text-ink-faint";
/** White card on the paper canvas (design 1c). */
const CARD = "rounded-xl border border-border bg-card";

/**
 * The attendance (presensi) dashboard body for a tilawah-backed program:
 * sync bar, batch switcher, per-segment summary, and the halaqah table. Used by
 * the main dashboard route and, for HKM, by the "Presensi" tab (program =
 * hkm-presensi). `showPiketNote` hides the piket link when embedded as a tab.
 */
export async function AttendanceDashboard({
  program,
  showPiketNote = true,
  source = "cms.tilawalabs.demo",
  batch,
  filter,
  basePath,
  baseParams,
  title = "Monitoring Kehadiran",
}: {
  program: string;
  /** Section heading — HKM mounts this as the "Presensi" half of one page. */
  title?: string;
  showPiketNote?: boolean;
  /** Upstream the attendance came from — mabni-backed programs are not tilawah. */
  source?: string;
  /** `?batch=` — a tilawah batch id, or "semua" for every batch. */
  batch?: string;
  /** `?filter=` — which slice of the halaqah table the KPI links point at. */
  filter?: string;
  /**
   * Route this dashboard is mounted on, used to build the KPI drill-down links.
   * Defaults to the program's own dashboard; HKM mounts it under a different
   * slug than the program it renders, so it passes its own.
   */
  basePath?: string;
  /** Query params the route needs to stay on this tab (e.g. `{ tab: "presensi" }`). */
  baseParams?: Record<string, string>;
}) {
  // Batch scope first: the roster, the halaqah table and the KPI strip must all
  // read the same batch, or the numbers contradict the table under them.
  const programRow = await getProgram(program);
  const batches = await getProgramBatches(program);
  const selectedBatch = programRow ? resolveBatchParam(programRow, batches, batch) : null;

  const [dataSendiri, halaqahSendiri, lastSync, siblings] = await Promise.all([
    getDashboardData(program, selectedBatch),
    getHalaqahList(program, selectedBatch),
    getLastSync(program),
    getBatchSiblings(program, { halaqahCount: true }),
  ]);
  // "Semua" pada keluarga batch (hits-regular/-apr/-jan): gabungan seluruh
  // saudara. Untuk program syncAllBatches, `batch=semua` sudah ditangani oleh
  // resolveBatchParam (scope null) dan siblings kosong, jadi cabang ini lewat.
  const semuaKeluarga = batch === "semua" && siblings.length > 1;
  const gabungan = semuaKeluarga ? await getDashboardSemuaBatch(program, siblings) : null;
  const data = gabungan?.data ?? dataSendiri;
  const halaqahList = gabungan?.halaqahList ?? halaqahSendiri;
  const sync = lastSyncLabel(lastSync);
  const tone = syncTone(lastSync?.finishedAt, {
    failed: lastSync?.lastStatus === "failed",
    running: !!lastSync?.running,
  });

  // KPI aggregates for the instrument strip.
  const rates = data.students.map((s) => s.attendanceRate).filter((r): r is number => r != null);
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  const belumPresensi = halaqahList.reduce((n, h) => n + h.dueTanpaPresensi, 0);
  const halaqahBelum = halaqahList.filter((h) => h.dueTanpaPresensi > 0).length;
  const kritis = halaqahList.filter((h) => h.avgRate != null && h.avgRate < data.thresholdPct).length;
  const ikh = halaqahList.filter((h) => h.gender === 1).length;
  const akh = halaqahList.filter((h) => h.gender === 2).length;
  const aman = avgRate != null && avgRate >= data.thresholdPct;

  // Tiga angka pembuka (permintaan pemilik 22 Sep 2026: "total peserta, total
  // guru, total kelas … gede-gede aja" di atas, rincian di bawahnya).
  // Pengajar dihitung sebagai `pengajar` yang berbeda — cara yang SAMA dengan
  // tab Pengajar, yang memperlakukan halaqah berpengajar dua orang sebagai satu
  // baris. Memecah namanya di sini akan membuat dua halaman menyebut angka
  // berbeda untuk hal yang sama.
  const totalPengajar = new Set(
    halaqahList.map((h) => h.pengajar?.trim()).filter((n): n is string => !!n),
  ).size;
  const totalUmum = [
    { label: "Peserta aktif", nilai: data.rosterCount },
    { label: "Pengajar", nilai: totalPengajar },
    { label: "Kelas", nilai: halaqahList.length },
  ];

  // Ringkasan per marhalah sebagai blok, bukan tabel: kolom "Rata² hadir" dan
  // "Di bawah ambang" dibuang dari tampilan umum atas permintaan pemilik —
  // angka kehadiran sudah ada di KPI atas dan per halaqah di tabel bawah.
  const perMarhalah = (() => {
    const per = new Map<string, { jenis: { label: string; count: number }[]; total: number }>();
    for (const seg of data.segments) {
      const e = per.get(seg.primary) ?? { jenis: [], total: 0 };
      // genderLabel(null) menghasilkan "-": baris "- 4" tidak memberi tahu apa pun,
      // jadi jenis yang tak diketahui hanya masuk total blok itu.
      if (seg.secondary && seg.secondary !== "-") e.jenis.push({ label: seg.secondary, count: seg.count });
      e.total += seg.count;
      per.set(seg.primary, e);
    }
    // TANPA_KELAS adalah peserta yang belum ditempatkan — bukan marhalah.
    // Urut abjad menaruhnya di depan M1, yang membuatnya terbaca seperti
    // angkatan pertama; ia selalu terakhir. TANPA_MARHALAH sudah punya halaqah,
    // hanya halaqahnya tak berlevel (HKM): bukan peringatan, dan kalau itu
    // satu-satunya blok, programnya memang tak bermarhalah — "Semua peserta".
    const rank = (p: string) => (p === TANPA_KELAS ? 2 : p === TANPA_MARHALAH ? 1 : 0);
    const blok = [...per.entries()]
      .map(([primary, v]) => ({ primary, ...v, belumKelas: primary === TANPA_KELAS }))
      .sort((a, b) => rank(a.primary) - rank(b.primary));
    const tanpaLevelSaja = blok.every((b) => b.primary === TANPA_MARHALAH || b.belumKelas);
    return blok.map((b) => ({
      ...b,
      label: b.belumKelas
        ? "Belum ditempatkan"
        : b.primary === TANPA_MARHALAH
          ? tanpaLevelSaja
            ? "Semua peserta"
            : "Tanpa marhalah"
          : b.primary,
    }));
  })();

  // Drill-down targets for the two actionable numbers. A KPI that leads nowhere
  // is a fact, not a task — these link into the halaqah table, pre-filtered.
  const focus: HalaqahFocus = filter === "belum" || filter === "kritis" ? filter : null;
  const path = basePath ?? `/${program}/dashboard`;
  const hrefFor = (f: HalaqahFocus) => {
    const q = new URLSearchParams(baseParams);
    if (batch) q.set("batch", batch);
    if (f) q.set("filter", f);
    const s = q.toString();
    return `${path}${s ? `?${s}` : ""}#halaqah`;
  };

  return (
    <div className="space-y-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="text-20 font-extrabold tracking-[-0.02em]">{title}</h2>
          <span className="cap break-words text-11 font-semibold text-ink-faint">{source}</span>
        </div>
        <span
          title={SYNC_TOOLTIP}
          className={`cap flex items-center gap-1.5 text-11 font-semibold tabular-nums ${SYNC_TEXT[tone]}`}
        >
          <span className={`size-1.5 shrink-0 rounded-full ${SYNC_DOT[tone]}`} />
          Sync {sync.text}
        </span>
      </div>

      {/* Batch dulu (pemilik 28 Sep 2026): pilihan batch menentukan semua angka di bawahnya. */}
      <BatchSwitcher
        siblings={siblings}
        page="dashboard"
        semua={siblings.length > 1 ? semuaKeluarga : undefined}
      />
      <ProgramBatchSwitcher program={program} batches={batches} selected={selectedBatch} />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {totalUmum.map((t) => (
          // Label may wrap to two lines at phone width; the figure stays on the card's floor.
          <div key={t.label} className={`${CARD} flex min-w-0 flex-col justify-between p-3 sm:p-4`}>
            <div className={`${LABEL} leading-tight`}>{t.label}</div>
            <div className="mt-1.5 text-[26px] font-extrabold leading-none tracking-[-0.03em] tabular-nums sm:text-[34px]">
              {NUM.format(t.nilai)}
            </div>
          </div>
        ))}
      </div>

      {showPiketNote && (
        <p className="-mt-1.5 max-w-3xl text-sm text-ink-muted">
          Data kehadiran ditarik dari {source}; data keterlambatan dari{" "}
          <Link href={`/${program}/piket`} className="font-semibold text-primary hover:underline">
            form piket
          </Link>
          .
        </p>
      )}

      {/*
       * One lead metric, two tasks. The census numbers (halaqah, peserta) sit as
       * a footnote inside the lead card: they never change what a coordinator
       * does today, so they must not compete with the rate for attention.
       */}
      <div>
        <div className={`${CARD} px-4 py-4 sm:px-[18px]`}>
          <div className={LABEL}>Rata² kehadiran</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span
              className={`text-[40px] font-extrabold leading-none tracking-[-0.035em] tabular-nums sm:text-[46px] ${
                avgRate == null ? "text-ink-faint" : aman ? "text-ok" : "text-danger"
              }`}
            >
              {avgRate != null ? PCT.format(avgRate) : "—"}
              {avgRate != null && (
                <span className="text-20 font-semibold tracking-normal text-ink-faint">%</span>
              )}
            </span>
            <span className="text-12 text-ink-muted">
              ambang kritis <b className="tabular-nums">{data.thresholdPct}%</b>
            </span>
          </div>

          {/* Bar with a tick at the threshold, so the number has a scale to sit on. */}
          <div className="relative mt-3 h-1.5 rounded-sm bg-neutral-200/70 dark:bg-neutral-800">
            <div
              className={`h-full rounded-sm ${aman ? "bg-emerald-600 dark:bg-emerald-400" : "bg-red-600 dark:bg-red-400"}`}
              style={{ width: `${Math.max(0, Math.min(100, avgRate ?? 0))}%` }}
            />
            <span
              className="absolute -top-[3px] h-[calc(100%+6px)] w-px bg-neutral-500 dark:bg-neutral-400"
              style={{ left: `${Math.max(0, Math.min(100, data.thresholdPct))}%` }}
              aria-hidden
            />
          </div>

          <p className="mt-2.5 text-12 text-ink-muted">
            {avgRate == null
              ? "Belum ada data kehadiran."
              : aman
                ? `Di atas ambang ${data.thresholdPct}%.`
                : `Di bawah ambang ${data.thresholdPct}%.`}{" "}
            <span className="tabular-nums">{NUM.format(halaqahList.length)}</span> halaqah (
            {ikh} IKH · {akh} AKH) ·{" "}
            <span className="tabular-nums">{NUM.format(data.students.length)}</span> peserta
            tersinkron
          </p>
        </div>

      </div>

      {!data.hasSyncData && (
        <Alert variant="warning">
          {data.rosterCount > 0 ? (
            <>
              <b>{data.rosterCount} peserta</b> sudah terdaftar, tapi belum ada data kehadiran —
              presensi belum diinput di tilawah untuk program ini. Angka kehadiran otomatis muncul
              begitu pengajar mulai mengisi presensi.
            </>
          ) : (
            <>
              Belum ada peserta tersinkron. Jalankan sync engine (pastikan
              <code className="mx-1">tilawah_program_id</code>/
              <code className="mx-1">tilawah_batch_id</code>
              program ini sudah benar).
            </>
          )}
        </Alert>
      )}

      {data.segmentation && data.segments.length > 0 && (
        <section className="space-y-2">
          <h2 className={LABEL}>
            Ringkasan per {data.segmentation.primary === "level" ? "kelas" : "marhalah"}
            {data.segmentation.secondary === "gender" ? " × jenis" : ""}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {perMarhalah.map((m) => (
              <div
                key={m.primary}
                className={`min-w-0 rounded-xl border px-3.5 py-3 ${
                  m.belumKelas
                    ? "border-amber-300/80 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/30"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`min-w-0 text-sm font-bold ${m.belumKelas ? "text-amber-700 dark:text-amber-300" : ""}`}
                  >
                    {m.label}
                  </span>
                  <span className="text-lg font-extrabold tabular-nums">{NUM.format(m.total)}</span>
                </div>
                {m.jenis.length > 0 && (
                  <dl className="mt-1.5 space-y-0.5">
                    {m.jenis.map((j) => (
                      <div key={j.label} className="flex justify-between gap-2 text-12">
                        <dt className="text-ink-muted">{j.label}</dt>
                        <dd className="tabular-nums">{NUM.format(j.count)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Daftar tunggu bukan peserta aktif (pemilik 28 Sep 2026): tidak ikut
          kartu maupun ringkasan, cukup disebut supaya tidak hilang dari mata. */}
      {data.belumDitempatkan > 0 && (
        <p className="text-12 text-ink-muted">
          {NUM.format(data.belumDitempatkan)} peserta belum ditempatkan di kelas (daftar tunggu) — tidak
          termasuk peserta aktif.
        </p>
      )}

      <section id="halaqah" className="scroll-mt-24 space-y-2">
        <h2 className={LABEL}>
          Daftar halaqah · klik untuk rincian kehadiran per pertemuan
        </h2>
        <HalaqahTable
          program={program}
          rows={halaqahList}
          threshold={data.thresholdPct}
          focus={focus}
          clearHref={hrefFor(null)}
        />
      </section>

      {/* Belum presensi & kritis paling bawah (pemilik 28 Sep 2026); tautannya
          menyaring tabel halaqah di atas. */}
      <KpiStrip
        items={[
          {
            label: "Belum presensi",
            value: (
              <Link href={hrefFor("belum")} className="hover:underline">
                {NUM.format(belumPresensi)}
              </Link>
            ),
            valueClassName: belumPresensi > 0 ? "text-amber-600 dark:text-amber-400" : undefined,
            hint:
              belumPresensi > 0 ? (
                <Link href={hrefFor("belum")} className="hover:underline">
                  pertemuan di {halaqahBelum} halaqah →
                </Link>
              ) : (
                "semua pertemuan terisi"
              ),
          },
          {
            label: "Kritis",
            value: (
              <Link href={hrefFor("kritis")} className="hover:underline">
                {NUM.format(kritis)}
              </Link>
            ),
            valueClassName: kritis > 0 ? "text-red-600 dark:text-red-400" : undefined,
            hint:
              kritis > 0 ? (
                <Link href={hrefFor("kritis")} className="hover:underline">
                  halaqah &lt; {data.thresholdPct}% →
                </Link>
              ) : (
                `tidak ada halaqah < ${data.thresholdPct}%`
              ),
          },
        ]}
      />
    </div>
  );
}
