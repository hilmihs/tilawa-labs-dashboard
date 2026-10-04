import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, BookOpen, CircleCheck, ClockAlert, IdCard, MessageCircle, NotebookPen, TrendingDown, TrendingUp, Users, Printer } from "lucide-react";
import type * as React from "react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { Inisial, kartu, labelMikro, tombolGaris } from "@/components/lintas/brand";
import { SalinTeks } from "@/components/lintas/SalinTeks";
import { requireStaff } from "@/lib/acara/access";
import { getOrangCv } from "@/lib/orang/cv";
import {
  LABEL_SUMBER,
  NADA_SUMBER,
  labelPeran,
  ringkasKegiatan,
  ringkasMengajar,
  ringkasTautan,
  type KegiatanTampil,
} from "@/lib/orang/cv-view";
import { baseUrl } from "@/lib/hadir/base-url";
import { urlQr } from "@/lib/hadir/kode";
import { jamWibDari } from "@/lib/hadir/view-model";
import { getMatrixOrang, idPengajarMaahir } from "@/lib/orang/matrix";
import { formatSkor, labelBulan, susunMatrix, toneSkor, type MatrixOrang } from "@/lib/orang/matrix-view";
import { toneBadgeClass, type StatusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";
import { phoneLokal, waLink } from "@/lib/wa";
import { getPenilaianOrang, type CatatanCv, type Kepanitiaan, type RingkasKpi } from "@/lib/penilaian/cv";
import { getTrackRecord } from "@/lib/orang/riwayat";
import type { BarisTahun } from "@/lib/orang/track-record";
import { TONE, type Nilai } from "@/lib/penilaian/skala";

export const metadata = { title: "CV Individu" };
export const dynamic = "force-dynamic";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function tgl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
}

const STATUS: Record<KegiatanTampil["status"], { label: string; tone: StatusTone; titik: string }> = {
  hadir: { label: "Hadir", tone: "success", titik: "bg-emerald-500" },
  terlambat: { label: "Terlambat", tone: "warning", titik: "bg-amber-500" },
  mangkir: { label: "Bilang bisa, tidak datang", tone: "danger", titik: "bg-red-500" },
  tidak_hadir: { label: "Tidak hadir", tone: "neutral", titik: "bg-neutral-300 dark:bg-neutral-600" },
};

const judulBagian = "text-16 font-semibold";

/** Kartu angka CV: ikon berwarna di kiri, label + angka di kanan. */
function Angka({
  label,
  nilai,
  ikon,
  nadaIkon,
  nada,
}: {
  label: string;
  nilai: React.ReactNode;
  ikon: React.ReactNode;
  nadaIkon: string;
  nada?: string;
}) {
  return (
    <div className={cn(kartu, "flex min-w-0 items-center gap-3.5 px-[18px] py-4")}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[11px] [&>svg]:size-[19px]", nadaIkon)} aria-hidden>
        {ikon}
      </span>
      <div className="min-w-0">
        <div className={labelMikro}>{label}</div>
        <div className={cn("mt-0.5 text-[26px] font-extrabold leading-tight tracking-[-0.03em] tabular-nums", nada)}>{nilai}</div>
      </div>
    </div>
  );
}

/**
 * CV satu orang. Tampilan: desain "Overhaul Pengajar Orang Acara Office"
 * (03 CV Individu) dalam palet Tilawa Labs.
 */
export default async function CvOrangPage({ params }: { params: Promise<{ kode: string }> }) {
  const user = await requireStaff();
  const { kode } = await params;
  const cv = await getOrangCv(kode);
  if (!cv) notFound();

  const mengajar = ringkasMengajar(cv.halaqah, cv.jadiBadal);
  const kegiatan = ringkasKegiatan(cv.kegiatan);
  const tautan = ringkasTautan(cv.tautan);
  const [mx, nilai, trackRecord, qrSvg] = await Promise.all([
    getMatrixOrang(idPengajarMaahir(cv.tautan)),
    getPenilaianOrang(cv.orang.id),
    getTrackRecord(cv.orang.id),
    baseUrl().then((b) => QRCode.toString(urlQr(b, cv.orang.kodeQr), { type: "svg", errorCorrectionLevel: "M", margin: 0, width: 76 })),
  ]);
  const matrix = susunMatrix(mx.rows, mx.rankedPerBulan);
  const wa = waLink(cv.orang.wa, `Assalamu'alaikum ${cv.orang.nama}`);
  const perempuan = cv.orang.gender === "P";

  return (
    <AppShell
      email={user.email}
      title={cv.orang.nama}
      railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}
    >
      <main className="mx-auto w-full max-w-[1240px] space-y-5 px-4 py-6 sm:px-8">
        <Link href="/orang" className="inline-flex items-center gap-1 text-12 text-ink-muted hover:text-primary">
          <ArrowLeft className="size-3.5" aria-hidden /> Daftar Individu
        </Link>

        <section className={cn(kartu, "flex flex-wrap items-center gap-6 rounded-2xl px-6 py-[22px]")}>
          <Inisial nama={cv.orang.nama} gender={cv.orang.gender} className="size-[72px] text-2xl" />
          <div className="flex min-w-[240px] flex-1 flex-col gap-2">
            <h1 className="text-28 font-bold tracking-[-0.02em]">{cv.orang.nama}</h1>
            <div className="flex flex-wrap gap-1.5">
              <span className={cn("rounded-full px-2.5 py-[3px] text-12", toneBadgeClass[perempuan ? "indigo" : "info"])}>
                {perempuan ? "Akhwat" : "Ikhwan"}
              </span>
              <span className="rounded-full bg-neutral-100 px-2.5 py-[3px] text-12 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {cv.orang.programTeks ?? "Program belum diisi"}
              </span>
              {cv.orang.kategori !== "pengajar" && (
                <span className="rounded-full bg-accent px-2.5 py-[3px] text-12 text-accent-foreground">{cv.orang.kategori}</span>
              )}
              {cv.orang.perluReview && (
                <span className={cn("rounded-full px-2.5 py-[3px] text-12", toneBadgeClass.warning)}>perlu dicek</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-emerald-200 bg-emerald-50 px-3 font-mono text-12 font-medium text-emerald-700 transition-colors hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
                >
                  <MessageCircle className="size-4" aria-hidden /> {phoneLokal(cv.orang.wa)}
                </a>
              )}
              <Link href={`/orang/${cv.orang.kodeQr}/cetak`} className={cn(tombolGaris, "h-[34px]")}>
                <Printer className="size-4" aria-hidden /> Cetak CV
              </Link>
              <Link href={`/h/${cv.orang.kodeQr}`} className={cn(tombolGaris, "h-[34px]")}>
                <IdCard className="size-4" aria-hidden /> Kartu
              </Link>
              <Link href={`/orang/kartu?ids=${cv.orang.id}`} className={cn(tombolGaris, "h-[34px]")}>
                <IdCard className="size-4" aria-hidden /> Kartu kehadiran
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div
              className="size-[76px] shrink-0 rounded-lg bg-white p-1.5 [&>svg]:size-full"
              aria-label={`QR ${cv.orang.kodeQr}`}
              role="img"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div>
              <div className={labelMikro}>Kode QR</div>
              <div className="mt-1 font-mono text-14 tracking-[0.04em]">{cv.orang.kodeQr}</div>
              <SalinTeks teks={cv.orang.kodeQr} label="Salin kode" className="mt-1" />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Angka label="Halaqah" nilai={mengajar.totalHalaqah} ikon={<BookOpen />} nadaIkon={toneBadgeClass.info} />
          <Angka label="Pertemuan selesai" nilai={mengajar.totalSelesai} ikon={<CircleCheck />} nadaIkon={toneBadgeClass.success} />
          <Angka label="Kajian diikuti" nilai={`${kegiatan.hadir}/${kegiatan.diundang}`} ikon={<Users />} nadaIkon={toneBadgeClass.indigo} />
          <Angka
            label="Terlambat"
            nilai={kegiatan.terlambat}
            ikon={<ClockAlert />}
            nadaIkon={toneBadgeClass.warning}
            nada={kegiatan.terlambat > 0 ? "text-warn" : undefined}
          />
        </section>

        <PenilaianBagian kpi={nilai.kpi} kepanitiaan={nilai.kepanitiaan} />
        <CatatanBagian catatan={nilai.catatan.filter((c) => c.jenis === "kelebihan" || c.jenis === "kekurangan")} />
        <TrackRecordBagian baris={trackRecord} kodeQr={cv.orang.kodeQr} />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <section className={cn(kartu, "rounded-2xl px-5 py-[18px]")}>
              <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={judulBagian}>Mengajar</h2>
                {mengajar.perProgram.length > 0 && (
                  <span className="text-12 text-ink-muted">
                    {mengajar.totalHalaqah} halaqah · {mengajar.perProgram.length} program
                  </span>
                )}
              </div>
              {mengajar.perProgram.length === 0 ? (
                <p className="text-14 text-ink-muted">Belum ada halaqah tersinkron atas namanya.</p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {mengajar.perProgram.map((p) => (
                    <div
                      key={p.programSlug}
                      className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-neutral-50/60 px-3.5 py-3 dark:border-neutral-800 dark:bg-neutral-900/50"
                    >
                      <div>
                        <div className="text-14 font-semibold leading-snug">{p.programNama}</div>
                        <div className="mt-0.5 text-12 text-ink-muted">
                          {p.selesai} dari {p.diampu} pertemuan selesai
                        </div>
                      </div>
                      {p.halaqah.map((h) => (
                        <div
                          key={`${h.programSlug}-${h.halaqahId}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-card px-2 py-1.5 dark:border-neutral-800"
                        >
                          <span className="min-w-0 truncate font-mono text-12">{h.halaqah}</span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-[7px] py-px text-11",
                              toneBadgeClass[h.pemilik ? "success" : "neutral"],
                            )}
                          >
                            {h.pemilik ? "Pengajar tetap" : "Badal"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {mengajar.jadiBadal > 0 && (
                <p className="mt-3 text-12 text-ink-muted">
                  {mengajar.jadiBadal} pertemuan diampu sebagai badal di halaqah orang lain.
                </p>
              )}
            </section>

            {matrix && <MatrixBagian m={matrix} />}
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <section className={cn(kartu, "rounded-2xl px-5 py-[18px]")}>
              <h2 className={cn(judulBagian, "mb-3")}>Akun &amp; peran</h2>
              {tautan.length === 0 ? (
                <p className="text-14 text-ink-muted">
                  Belum ada akun program yang tertaut — orang ini baru dikenal dari form kajian.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {tautan.map((t) => (
                    <div
                      key={`${t.sumber}-${t.peran}`}
                      title={t.idUpstream.join(", ")}
                      className={cn(
                        "rounded-xl border border-neutral-200 p-3 dark:border-neutral-800",
                        !t.aktif && "border-dashed opacity-70",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-11", toneBadgeClass[NADA_SUMBER[t.sumber] ?? "neutral"])}>
                          {LABEL_SUMBER[t.sumber] ?? t.sumber}
                        </span>
                        <span className="text-12 font-semibold">{labelPeran(t.peran)}</span>
                        {!t.aktif && <span className="text-11 text-ink-faint">nonaktif</span>}
                      </div>
                      {t.program.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.program.map((p) => (
                            <span
                              key={p}
                              className="rounded-[5px] bg-neutral-100 px-1.5 py-0.5 font-mono text-11 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                      {t.namaAkun.length > 0 && (
                        <div className="mt-1.5 text-11 text-ink-faint">Nama di akun: {t.namaAkun.join(" / ")}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={cn(kartu, "rounded-2xl px-5 py-[18px]")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={judulBagian}>Kegiatan &amp; kajian</h2>
                {kegiatan.diundang > 0 && (
                  <span className="text-12 text-ink-muted">
                    {kegiatan.hadir} hadir dari {kegiatan.diundang}
                  </span>
                )}
              </div>
              {kegiatan.baris.length === 0 ? (
                <p className="mt-2 text-14 text-ink-muted">Belum pernah terdaftar di kajian mana pun.</p>
              ) : (
                <>
                  <div className="mt-3 mb-4 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                    {kegiatan.hadir - kegiatan.terlambat > 0 && (
                      <div className="bg-emerald-500" style={{ flex: kegiatan.hadir - kegiatan.terlambat }} />
                    )}
                    {kegiatan.terlambat > 0 && <div className="bg-amber-500" style={{ flex: kegiatan.terlambat }} />}
                    {kegiatan.diundang - kegiatan.hadir > 0 && (
                      <div className="bg-neutral-200 dark:bg-neutral-800" style={{ flex: kegiatan.diundang - kegiatan.hadir }} />
                    )}
                  </div>
                  {kegiatan.mangkir > 0 && (
                    <p className="-mt-2 mb-3 text-12 text-danger">
                      {kegiatan.mangkir} kali menyatakan bisa lalu tidak datang.
                    </p>
                  )}
                  <ol className="flex flex-col">
                    {kegiatan.baris.map((k, i) => {
                      const st = STATUS[k.status];
                      return (
                        <li key={k.slug} className="grid grid-cols-[18px_1fr] gap-3">
                          <div className="flex flex-col items-center" aria-hidden>
                            <span className={cn("mt-1 size-3 shrink-0 rounded-full ring-[3px] ring-card", st.titik)} />
                            {i < kegiatan.baris.length - 1 && (
                              <span className="my-1 w-0.5 flex-1 bg-neutral-200 dark:bg-neutral-800" />
                            )}
                          </div>
                          <div className="pb-4">
                            <Link href={`/acara/${k.slug}`} className="text-12 font-semibold leading-snug text-pretty hover:text-primary hover:underline">
                              {k.nama}
                            </Link>
                            <div className="mt-0.5 text-12 text-ink-muted">
                              {tgl(k.tanggal)}
                              {k.pemateri && ` · ${k.pemateri}`}
                              {k.hadirWaktu && ` · datang ${jamWibDari(k.hadirWaktu)}`}
                            </div>
                            <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-11", toneBadgeClass[st.tone])}>
                              {st.label}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </section>
          </div>
        </div>

        <p className="text-12 text-ink-faint">Capaian ilmu menyusul — lihat docs/KADERISASI-HEARING-2026-09-07.md.</p>
      </main>

      {/* Catatan cepat mengambang (rekomendasi Batch 3): dari CV siapa pun,
          satu ketukan ke form catatan dengan orang ini sudah terpilih. */}
      <Link
        href={`/penilaian/catatan?orang=${encodeURIComponent(cv.orang.kodeQr)}`}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-13 font-semibold text-primary-foreground shadow-lg hover:opacity-90 print:hidden"
      >
        <NotebookPen className="size-4" aria-hidden /> Catatan cepat
      </Link>
    </AppShell>
  );
}

/**
 * Matrix penilaian Maahir: indikator × bulan, sel diwarnai menurut skor 0–4.
 * Ringkasan bulan terakhir di atas, karena itu yang ditanyakan orang pertama
 * kali; matrix di bawahnya menjawab "naik atau turun".
 */
function MatrixBagian({ m }: { m: MatrixOrang }) {
  const t = m.terakhir;
  const total = m.baris.find((b) => b.jenis === "total")?.nilai ?? [];
  const kini = total.at(-1) ?? null;
  const lalu = total.length > 1 ? (total.at(-2) ?? null) : null;
  const delta = kini != null && lalu != null ? Math.round((kini - lalu) * 100) / 100 : null;
  const kolom = { gridTemplateColumns: `minmax(170px,1fr) repeat(${m.bulan.length}, 60px)` };
  return (
    <section className={cn(kartu, "rounded-2xl px-5 py-[18px]")}>
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={judulBagian}>Matrix penilaian Maahir</h2>
        <span className="text-12 text-ink-muted">skala 0–4 · kosong = belum dinilai</span>
      </div>

      {t && (
        <div className="mb-4 grid gap-2.5 sm:grid-cols-3">
          <div className={cn("rounded-xl p-3.5", toneBadgeClass[t.keseluruhan != null ? toneSkor(t.keseluruhan) : "neutral"])}>
            <div className="text-12 opacity-90">Keseluruhan · {labelBulan(t.bulan)}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{formatSkor(t.keseluruhan)}</span>
              {delta != null && delta !== 0 && (
                <span className="flex items-center gap-0.5 text-12">
                  {delta > 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
                  {delta > 0 ? "+" : "−"}
                  {formatSkor(Math.abs(delta))}
                </span>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-12 text-ink-muted">Peringkat</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
                {t.ranking != null ? `#${t.ranking}` : "—"}
              </span>
              {t.ranking != null && t.dariRanking != null && <span className="text-12 text-ink-muted">dari {t.dariRanking}</span>}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-12 text-ink-muted">Teguran</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={cn("text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums", t.teguranBulan > 0 && "text-danger")}>
                {t.teguranBulan}
              </span>
              <span className="text-12 text-ink-muted">bulan ini · {t.teguranKumulatif} total</span>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="min-w-fit">
          <div
            className={cn("grid gap-1 border-b border-neutral-200 bg-neutral-50 py-2 pr-2 pl-3.5 dark:border-neutral-800 dark:bg-neutral-900", labelMikro)}
            style={kolom}
          >
            <span>Indikator</span>
            {m.bulan.map((b) => (
              <span key={b} className="text-center">
                {labelBulan(b)}
              </span>
            ))}
          </div>
          {m.baris.map((r) => {
            const induk = r.jenis !== "komponen";
            return (
              <div
                key={r.key}
                style={kolom}
                className={cn(
                  "grid items-center gap-1 py-1 pr-2 pl-3.5",
                  induk && "border-t border-neutral-200 bg-neutral-50/70 dark:border-neutral-800 dark:bg-neutral-900/50",
                  r.jenis === "total" && "bg-neutral-100 dark:bg-neutral-900",
                )}
              >
                <span className={cn("text-12", induk ? "font-semibold" : "pl-3 text-neutral-600 dark:text-neutral-300")}>{r.label}</span>
                {r.nilai.map((v, i) => (
                  <span
                    key={m.bulan[i]}
                    className={cn(
                      "flex items-center justify-center rounded-[7px] tabular-nums",
                      induk ? "h-[30px] text-12 font-semibold" : "h-6 text-11",
                      v == null ? "text-ink-faint" : toneBadgeClass[toneSkor(v)],
                    )}
                  >
                    {formatSkor(v)}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-12 text-ink-muted">
        {(
          [
            ["success", "≥ 3,5 sangat baik"],
            ["teal", "≥ 2,5 baik"],
            ["warning", "≥ 1,5 perlu dibina"],
            ["danger", "< 1,5 kurang"],
          ] as [StatusTone, string][]
        ).map(([tone, label]) => (
          <span key={tone} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", toneBadgeClass[tone])} aria-hidden />
            {label}
          </span>
        ))}
        {m.belumPernah.length > 0 && <span className="sm:ml-auto">Belum pernah dinilai: {m.belumPernah.join(", ")}</span>}
      </div>
    </section>
  );
}

const LABEL_SUMBER_NILAI: Record<string, string> = {
  grid: "tim kaderisasi",
  link_pic: "PIC",
  interview: "wawancara",
  impor: "impor",
  otomatis: "otomatis",
};

function Huruf({ n }: { n: Nilai }) {
  return (
    <span className={cn("inline-flex h-6 w-7 items-center justify-center rounded-md text-12 font-semibold", toneBadgeClass[TONE[n]])}>{n}</span>
  );
}

/**
 * Ringkasan penilaian + kepanitiaan (design CV Individu c1). Ringkasan KPI =
 * median semua nilai; satu penilaian ditandai, sesuai pagar mutu.
 */
function PenilaianBagian({ kpi, kepanitiaan }: { kpi: RingkasKpi[]; kepanitiaan: Kepanitiaan[] }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
      <section className={cn(kartu, "min-w-0 rounded-2xl px-5 py-[18px]")}>
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={judulBagian}>Ringkasan penilaian</h2>
          <Link href="/penilaian" className="text-12 text-primary hover:underline">
            Penilaian →
          </Link>
        </div>
        {kpi.length === 0 ? (
          <p className="text-14 text-ink-muted">Belum ada penilaian. Nilai panitia diisi dari halaman Penilaian setelah acara.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {kpi.map((k) => (
              <div key={k.kpiId} className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-14 font-semibold">{k.nama}</div>
                    <div className="text-11 text-ink-muted">
                      {k.jenis} · {k.jumlah} penilaian{k.jumlah === 1 ? " (satu penilai)" : ""}
                    </div>
                  </div>
                  {k.ringkas && <Huruf n={k.ringkas} />}
                </div>
                <ul className="mt-2 space-y-0.5 text-11 text-ink-muted">
                  {k.riwayat.slice(0, 3).map((r, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">
                        {r.acara} · {LABEL_SUMBER_NILAI[r.sumber] ?? r.sumber}
                      </span>
                      <span className="font-semibold text-foreground">{r.nilai}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={cn(kartu, "min-w-0 rounded-2xl px-5 py-[18px]")}>
        <h2 className={cn(judulBagian, "mb-3")}>Kepanitiaan &amp; peran</h2>
        {kepanitiaan.length === 0 ? (
          <p className="text-14 text-ink-muted">Belum tercatat sebagai panitia acara mana pun.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {kepanitiaan.map((p) => (
              <li key={p.acaraSlug} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                <Link href={`/penilaian/${p.acaraSlug}`} className="text-12 font-semibold hover:text-primary hover:underline">
                  {p.acara}
                </Link>
                <div className="mt-0.5 text-12 text-ink-muted">
                  {tgl(p.tanggal)}
                  {(p.divisi || p.peran) && ` · ${[p.divisi, p.peran].filter(Boolean).join(" · ")}`}
                  {p.tugasTotal ? ` · tugas ${p.tugasSelesai}/${p.tugasTotal}` : ""}
                </div>
                {p.evidence && <p className="mt-1 text-12 text-neutral-600 dark:text-neutral-400">“{p.evidence}”</p>}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.nilai.length ? (
                    p.nilai.map((n) => (
                      <span key={n.kpi} title={n.kpi}>
                        <Huruf n={n.nilai} />
                      </span>
                    ))
                  ) : (
                    <span className="text-11 text-ink-faint">belum dinilai</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Evaluasi deskriptif dari catatan cepat tim kaderisasi (design p3). */
function CatatanBagian({ catatan }: { catatan: CatatanCv[] }) {
  if (catatan.length === 0) return null;
  return (
    <section className={cn(kartu, "rounded-2xl px-5 py-[18px]")}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={judulBagian}>Catatan kaderisasi</h2>
      </div>
      <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {catatan.map((c, i) => (
          <li key={i} className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-11">
              <span className={cn("rounded-full px-2 py-px font-semibold", c.jenis === "kelebihan" ? toneBadgeClass.success : toneBadgeClass.warning)}>
                {c.jenis === "kelebihan" ? "Kelebihan" : "Perlu dikembangkan"}
              </span>
              {c.aspek.map((a) => (
                <span key={a} className="rounded-full bg-neutral-100 px-2 py-px text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {a}
                </span>
              ))}
              <span className="text-ink-faint">
                {c.acara ? `${c.acara} · ` : ""}
                {tgl(c.tanggal)}
              </span>
            </div>
            <p className="mt-1 text-14">{c.isi}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Track record per tahun (rekomendasi Batch 3): hadir kegiatan rutin per seri,
 * kepanitiaan, dan riwayat mandiri 2022–2025. Isian mandiri yang belum
 * diverifikasi tampil redup dengan tanda "menunggu".
 */
function TrackRecordBagian({ baris, kodeQr }: { baris: BarisTahun[]; kodeQr: string }) {
  return (
    <section className={cn(kartu, "rounded-2xl px-5 py-[18px]")}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={judulBagian}>Track record per tahun</h2>
        <span className="text-12 text-ink-muted">
          Riwayat 2022–2025 diisi sendiri lewat{" "}
          <Link href={`/h/${kodeQr}/riwayat`} className="text-primary hover:underline">
            tautan di kartu QR
          </Link>
          , lalu{" "}
          <Link href="/penilaian/riwayat" className="text-primary hover:underline">
            diverifikasi
          </Link>
        </span>
      </div>
      <ol className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {baris.map((t) => (
          <li key={t.tahun} className="grid gap-2 py-3 sm:grid-cols-[64px_minmax(0,1fr)]">
            <span className="font-mono text-14 font-semibold tabular-nums">{t.tahun}</span>
            {t.kosong ? (
              <span className="text-13 text-ink-faint">Belum ada data.</span>
            ) : (
              <div className="flex min-w-0 flex-col gap-1.5 text-13">
                {t.rutin.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn(labelMikro, "mr-1")}>Hadir</span>
                    {t.rutin.map((r) => (
                      <span key={r.label} className={`rounded-md px-2 py-0.5 text-12 ${toneBadgeClass.success}`}>
                        {r.label} · {r.hadir}×
                      </span>
                    ))}
                  </div>
                )}
                {t.kepanitiaan.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn(labelMikro, "mr-1")}>Panitia</span>
                    {t.kepanitiaan.map((p, i) => (
                      <span key={i} className={`rounded-md px-2 py-0.5 text-12 ${toneBadgeClass.info}`}>
                        {p.acara} · {p.peran}
                      </span>
                    ))}
                  </div>
                )}
                {t.mandiri.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn(labelMikro, "mr-1")}>Diisi sendiri</span>
                    {t.mandiri.map((m, i) => (
                      <span
                        key={i}
                        className={`rounded-md px-2 py-0.5 text-12 ${m.menunggu ? "border border-dashed border-neutral-300 text-ink-muted dark:border-neutral-700" : toneBadgeClass.neutral}`}
                        title={m.menunggu ? "Menunggu verifikasi tim kaderisasi" : "Terverifikasi"}
                      >
                        {m.nama} · {m.peran}
                        {m.menunggu && " · menunggu"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
