/**
 * `/[program]/disiplin` — the HITS coordinator's discipline screen, mirrored
 * from Maahir's `rekap/hits-disiplin`.
 *
 * The route exists ONLY for a HITS program with a pinned Maahir batch. Without
 * the pin there is no way to tell which of the 148 teachers belong to this
 * coordinator, and showing all of them is worse than showing nothing — so the
 * page says the pin is missing instead of guessing.
 *
 * Every "no numbers" case names its cause (docs: belum ditarik / scope ditolak /
 * mirror kosong / tidak ada pengajar batch ini). None of them renders as 0.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { getProgram } from "@/lib/programs/resolve";
import { getProgramConfig } from "@/lib/programs/config";
import { hasMaahirPin } from "@/lib/programs/nav";
import { DisiplinTable, NoDataTable } from "./DisiplinTable";
import { bulanPilihan, labelBulan, loadDisiplin, resolveBulan } from "./queries";

export const metadata = { title: "Disiplin Pengajar" };
export const dynamic = "force-dynamic";

/**
 * Is this a HITS program at all? Used only to choose between 404 and the
 * "pin belum diisi" notice: a program that is not HITS has no business having
 * this route, while a HITS program merely waiting on the pin script should be
 * told so. `reportFormat: "hits"` is the existing marker; the slug check catches
 * the HITS programs that predate it (e.g. `hits-armalah`).
 */
function isHits(slug: string, config: unknown): boolean {
  return getProgramConfig({ config } as never).reportFormat === "hits" || slug.startsWith("hits");
}

/** "3 Sep 15:12 WIB (2 jam lalu)" — the page must stay usable on stale data, so
 *  the age is always visible rather than implied. */
function ditarikLabel(at: Date): string {
  const mins = Math.floor((Date.now() - at.getTime()) / 60000);
  const rel =
    mins < 1
      ? "barusan"
      : mins < 60
        ? `${mins} menit lalu`
        : mins < 60 * 24
          ? `${Math.floor(mins / 60)} jam lalu`
          : `${Math.floor(mins / 1440)} hari lalu`;
  const stamp = at.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  return `${stamp} WIB (${rel})`;
}

function BulanPicker({ program, aktif }: { program: string; aktif: string }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800">
      {bulanPilihan().map((b) => (
        <Link
          key={b}
          href={`/${program}/disiplin?bulan=${b}`}
          className={`rounded-md px-2.5 py-1 text-xs ${
            b === aktif
              ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          }`}
        >
          {labelBulan(b)}
        </Link>
      ))}
    </div>
  );
}

function Shell({
  program,
  bulan,
  adaObservasi,
  children,
}: {
  program: string;
  bulan: string;
  /**
   * Apakah `/[program]/observasi` bisa dibuka. Gerbang halaman ini hanya
   * memeriksa bentuk HITS, sedangkan Observasi menuntut pin batch Maahir — jadi
   * `tahsin-keluarga`, `tahfizh-nurul-iman`, dan `hits-armalah` sampai di sini
   * tanpa pin. Tanpa penjaga ini, layar yang berbunyi "batch Maahir belum
   * dipin" justru memasang tautan biru menuju `notFound()`.
   */
  adaObservasi: boolean;
  children: React.ReactNode;
}) {
  return (
    // Tabel 12 kolom: lebar penuh (dibatasi 1600px) supaya nama pengajar tidak
    // patah tiga baris sementara ~300px kanan menganggur. Blok judul tetap
    // dikurung max-w-3xl agar kalimatnya masih terbaca.
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-[19px] font-bold tracking-[-0.01em]">Disiplin Pengajar</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Dari rekap disiplin HITS di Maahir — KBBS, ketepatan waktu, dan tabayyun.{" "}
            {/* Angka di halaman ini datang dari rekap upstream dan tidak dihitung
                ulang di sini (docs/API-PUBLIC.md §9). Catatan mentah yang
                melahirkan angka-angka itu — satu baris per pertemuan — ada di
                Observasi, jadi keduanya saling menunjuk alih-alih saling meniru. */}
            {adaObservasi && (
              <Link
                href={`/${program}/observasi`}
                className="font-medium text-primary hover:underline"
              >
                Lihat catatan keterangan harian per pertemuan →
              </Link>
            )}
          </p>
        </div>
        <BulanPicker program={program} aktif={bulan} />
      </div>
      {children}
    </main>
  );
}

export default async function DisiplinPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<{ bulan?: string }>;
}) {
  const [{ program: slug }, { bulan: bulanParam }] = await Promise.all([params, searchParams]);
  const programRow = await getProgram(slug);
  if (!programRow) notFound();
  if (!isHits(slug, programRow.config)) notFound();

  // Observasi menuntut pin batch; halaman ini tidak. Lihat catatan pada Shell.
  const adaObservasi = hasMaahirPin(programRow.config);
  const bulan = resolveBulan(bulanParam);
  const data = await loadDisiplin(programRow.config, bulan);

  if (data.state === "tanpa-pin") {
    return (
      <Shell program={slug} bulan={bulan} adaObservasi={adaObservasi}>
        <EmptyState
          title="Pin batch Maahir belum diisi"
          description={
            <>
              Program ini belum punya <code>config.maahirHitsBatchId</code>, jadi belum bisa
              diketahui halaqah mana yang miliknya. Rekap disiplin Maahir mencakup seluruh HITS
              sekaligus; tanpa pin, isinya bukan milik program ini. Jalankan skrip pengisian pin
              batch lebih dulu.
            </>
          }
        />
      </Shell>
    );
  }

  if (data.state === "scope-ditolak") {
    return (
      <Shell program={slug} bulan={bulan} adaObservasi={adaObservasi}>
        <EmptyState
          title="Scope belum diberikan"
          description="Kunci API Maahir yang dipakai dashboard ditolak (403) untuk data HITS, jadi rekap disiplin tidak pernah sampai. Ini bukan berarti tidak ada pelanggaran — mintakan scope `hits` pada kunci tersebut."
        />
      </Shell>
    );
  }

  if (data.state === "belum-ditarik") {
    return (
      <Shell program={slug} bulan={bulan} adaObservasi={adaObservasi}>
        <EmptyState
          title={`Rekap ${labelBulan(bulan)} belum ditarik`}
          description="Belum ada satu pun tarikan rekap disiplin untuk bulan ini, jadi tidak ada angka yang bisa ditampilkan — bukan nol pelanggaran. Jalankan sync Maahir lebih dulu."
        />
      </Shell>
    );
  }

  if (data.state === "mirror-kosong") {
    return (
      <Shell program={slug} bulan={bulan} adaObservasi={adaObservasi}>
        <EmptyState
          title="Daftar halaqah batch ini belum tersinkron"
          description={`Rekap disiplinnya ada, tapi mirror hits/halaqah tidak memuat satu pun halaqah untuk batch ${data.batchIds.join(", ")} — tanpa itu barisnya tidak bisa disaring ke program ini. Jalankan sync Maahir lebih dulu.`}
        />
      </Shell>
    );
  }

  const { view, periode, fetchedAt, dariCache } = data;
  const { ringkas } = view;
  const kosong = view.ranked.length === 0 && view.noData.length === 0;

  return (
    <Shell program={slug} bulan={bulan} adaObservasi={adaObservasi}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>
          Periode:{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {periode ?? "tidak disebutkan upstream"}
          </span>
        </span>
        <span>Terakhir ditarik {ditarikLabel(fetchedAt)}</span>
        {dariCache && <span>· jawaban upstream dari cache-nya sendiri</span>}
      </div>
      {/* Metodologi bukan peringatan: tiga paragraf + kotak berwarna di atas tabel
          membuat halaman terbaca seperti sedang error. Semuanya masuk ke satu
          disclosure netral; yang tersisa di layar hanya satu subjudul. */}
      <details className="group -mt-4 text-xs text-ink-muted">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1 hover:text-neutral-700 [&::-webkit-details-marker]:hidden dark:border-neutral-800 dark:hover:text-neutral-300">
          <span className="flex size-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold">
            ?
          </span>
          Cara membaca angka ini
          <span className="text-neutral-400 group-open:hidden">
            — kalender bulan penuh, skor lintas batch
          </span>
        </summary>
        <div className="mt-2 max-w-3xl space-y-2 leading-relaxed">
          <p>
            Rekap ini memakai <strong>kalender bulan penuh</strong> — berbeda dari periode 28→27
            yang dipakai laporan bulanan Maahir. Rentang di atas diambil apa adanya dari respons
            upstream, bukan diturunkan dari nama bulan.
          </p>
          {view.campuran > 0 && (
            <p>
              {view.campuran} dari {ringkas.pengajar} pengajar juga mengampu halaqah di batch lain.
              Maahir menjumlahkan skor per pengajar, bukan per batch, jadi kolom KBBS/on-time/stabil
              di bawah ikut menghitung halaqah tersebut. Kolom Insiden, Hutang, dan daftar laporan
              harian sudah disaring ke halaqah batch ini saja.
            </p>
          )}
          <p>
            <strong>KBBS</strong> — Kelas Berjalan Baik &amp; Sesuai, dari pertemuan non-libur.{" "}
            <strong>On-time</strong> dan <strong>Stabil</strong> memakai pembilang/penyebut upstream
            apa adanya. <strong>Hutang</strong> = saldo kelas yang masih harus dibayar.{" "}
            <strong>Laporan</strong> = cakupan laporan harian menurut Maahir (mencakup seluruh
            halaqah pengajar).
          </p>
          <p>
            Kode pelanggaran <strong>KMT</strong>, <strong>KBLA</strong>, <strong>JKG</strong>,{" "}
            <strong>TIDAK_LATIHAN</strong>, <strong>BADAL</strong> dipakai persis seperti di Maahir
            — API tidak mendokumentasikan kepanjangannya, jadi tidak dikarang di sini. Isi kolom
            detail pada tiap insiden adalah catatan upstream apa adanya.
          </p>
        </div>
      </details>

      {kosong ? (
        <EmptyState
          title={`Tidak ada pengajar batch ini di periode ${periode ?? labelBulan(bulan)}`}
          description="Rekapnya sudah ditarik, tapi tidak satu pun halaqah batch program ini muncul di dalamnya. Bisa jadi batch ini memang belum/tidak lagi berjalan pada rentang tersebut — bukan berarti nol pelanggaran."
        />
      ) : (
        <>
          <KpiStrip
            items={[
              { label: "Pengajar terpantau", value: ringkas.pengajar },
              {
                label: "Punya pelanggaran",
                value: ringkas.bermasalah,
                hint: "KMT/KBLA/JKG/tidak latihan",
                valueClassName: ringkas.bermasalah > 0 ? "text-amber-600" : undefined,
              },
              {
                label: "Insiden belum diputus",
                value: ringkas.insidenTerbuka,
                hint: `dari ${ringkas.insidenTotal} insiden`,
                valueClassName: ringkas.insidenTerbuka > 0 ? "text-red-600" : undefined,
              },
              {
                label: "Laporan harian belum lengkap",
                value: ringkas.obsBelum,
                hint: `${ringkas.obsLengkap} sudah lengkap`,
                valueClassName: ringkas.obsBelum > 0 ? "text-amber-600" : undefined,
              },
            ]}
          />

          {view.ranked.length > 0 ? (
            <DisiplinTable rows={view.ranked} />
          ) : (
            <EmptyState
              title="Belum ada pengajar dengan pertemuan tercatat"
              description="Semua pengajar batch ini masuk daftar tanpa data di bawah."
            />
          )}

          {view.noData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tanpa data di periode ini ({view.noData.length})</CardTitle>
                <p className="mt-1 text-xs text-ink-muted">
                  Pengajar tanpa pertemuan yang bisa dinilai pada rentang tersebut. Mereka sengaja
                  dipisah: kosong bukan nol, dan memasukkannya ke tabel peringkat akan menampilkan
                  0% untuk orang yang memang tidak punya kelas.
                </p>
              </CardHeader>
              <CardContent>
                <NoDataTable rows={view.noData} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Shell>
  );
}
