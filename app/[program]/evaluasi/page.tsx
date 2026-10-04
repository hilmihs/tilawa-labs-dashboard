/**
 * `/[program]/evaluasi` — hasil ujian peserta.
 *
 * Datanya sudah ada di lokal sejak lama, hanya belum pernah ditampilkan: CMS
 * tilawah menandai sebagian pertemuan dengan `type_pertemuan = "ujian"`, lalu
 * guru menulis hasilnya ke baris presensi pertemuan itu (`lahn_jaliy`,
 * `lahn_khofiy`, `status`). Tidak ada endpoint nilai terpisah di upstream —
 * lihat catatan di `lib/insights/evaluasi/index.ts`.
 *
 * Rute ini hanya berlaku untuk program bersumber tilawah; di program lain
 * `notFound()`, karena halaman kosong bertuliskan "belum ada ujian" akan
 * terbaca sebagai "nol peserta lulus", bukan sebagai rute yang memang tidak
 * berlaku di sana.
 */
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { SyncStatus } from "@/components/ui/sync-status";
import { getProgram } from "@/lib/programs/resolve";
import { loadEvaluasi, programPunyaEvaluasi, resolveFilter } from "@/lib/insights/evaluasi";
import { loadEvaluasiMaahir, type EvaluasiMaahirData } from "@/lib/insights/evaluasi/maahir";
import { HalaqahMaahirTable } from "./HalaqahMaahirTable";
import { HasilTable } from "./HasilTable";
import { NilaiMaahirTable } from "./NilaiMaahirTable";
import { UjianTable } from "./UjianTable";

export const metadata = { title: "Hasil Ujian" };
// Angkanya berubah tiap sync tilawah jalan — jangan dibekukan saat build.
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      <div className="max-w-3xl">
        <h1 className="text-20 font-bold tracking-[-0.01em]">Hasil Ujian</h1>
        <p className="mt-1 text-14 text-ink-muted">
          Nilai bacaan peserta dari Evaluasi Halaqah di Maahir (sesi QN, PB, ujian, dan rapot), serta
          hasil ujian dari pertemuan yang ditandai <em>ujian</em> di CMS tilawah.
        </p>
      </div>
      {children}
    </main>
  );
}

export default async function EvaluasiPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  const [{ program: slug }, { f }] = await Promise.all([params, searchParams]);
  const programRow = await getProgram(slug);
  if (!programRow || !programPunyaEvaluasi(programRow)) notFound();

  const [data, maahir] = await Promise.all([loadEvaluasi(slug), loadEvaluasiMaahir([slug], [programRow.id])]);
  if (!data) notFound();

  const { hasil, ujian, ringkas, syncedAt } = data;

  if (ujian.length === 0 && maahir.halaqah.length === 0) {
    return (
      <Shell>
        <EmptyState
          title="Belum ada data evaluasi di program ini"
          description="Belum ada halaqah program ini di Evaluasi Halaqah Maahir, dan belum ada pertemuan berjenis ujian di CMS tilawah. Ini bukan berarti tidak ada peserta yang lulus — datanya belum masuk. Nilai Maahir tertarik lewat sync Maahir; ujian tilawah muncul setelah jenis pertemuan disetel ke 'ujian' di CMS."
        />
      </Shell>
    );
  }

  const filter = resolveFilter(f);

  return (
    <Shell>
      {maahir.halaqah.length > 0 && <SeksiMaahir data={maahir} />}

      {ujian.length > 0 && (
        <>
      <h2 className="pt-2 text-16 font-semibold">Ujian di CMS tilawah</h2>
      <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-ink-muted">
        <SyncStatus at={syncedAt ?? undefined} />
        <span>
          Nilai ditulis guru di panel pertemuan; dashboard hanya membacanya, tidak menghitung ulang.
        </span>
      </div>

      <KpiStrip
        hero={{
          label: "Peserta ujian sudah ada hasilnya",
          value: ringkas.persenAdaHasil == null ? "—" : ringkas.persenAdaHasil.toLocaleString("id-ID"),
          unit: ringkas.persenAdaHasil == null ? undefined : "%",
          progress: ringkas.persenAdaHasil ?? undefined,
          target: 100,
        }}
        support={[
          { label: "Pertemuan ujian", value: ringkas.ujianTotal, hint: `${ringkas.ujianLewat} sudah lewat` },
          { label: "Peserta diuji", value: ringkas.pesertaDiuji, hint: `${ringkas.lulus} lulus` },
          {
            label: "Rata² lahn jaliy",
            value: ringkas.rataJaliy == null ? "—" : ringkas.rataJaliy.toLocaleString("id-ID"),
            hint:
              ringkas.rataKhofiy == null
                ? "belum ada nilai"
                : `khofiy ${ringkas.rataKhofiy.toLocaleString("id-ID")}`,
          },
        ]}
        issues={[
          {
            label: "peserta belum ada hasil",
            value: ringkas.belum,
            href: `/${slug}/evaluasi?f=belum`,
          },
          {
            label: "peserta tidak lulus",
            value: ringkas.tidak,
            href: `/${slug}/evaluasi?f=tidak`,
            tone: "danger",
          },
          { label: "ujian lewat belum dinilai", value: ringkas.ujianTanpaHasil, href: "#daftar-ujian" },
        ]}
        allClearText="Semua peserta pada ujian yang sudah berlangsung punya hasil, dan semuanya lulus."
      />

      {/* Cara bacanya bukan peringatan — satu disclosure netral, bukan kotak
          berwarna yang membuat halaman terlihat sedang error. */}
      <details className="group text-12 text-ink-muted">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1 hover:text-neutral-700 [&::-webkit-details-marker]:hidden dark:border-neutral-800 dark:hover:text-neutral-300">
          <span className="flex size-4 items-center justify-center rounded-full border border-current text-11 font-semibold">
            ?
          </span>
          Cara membaca angka ini
          <span className="text-ink-faint group-open:hidden">— lahn, dan arti “lulus”</span>
        </summary>
        <div className="mt-2 max-w-3xl space-y-2 leading-relaxed">
          <p>
            <strong>Lahn jaliy</strong> adalah jumlah kesalahan fatal (mengubah makna atau melanggar
            kaidah yang wajib), <strong>lahn khofiy</strong> jumlah kesalahan halus. Keduanya adalah
            hitungan kesalahan, jadi <strong>makin kecil makin baik</strong> — 0 adalah nilai
            terbaik. Angka-angka ini ditulis guru di panel “Hasil Ujian” pertemuan, dan disimpan
            menempel pada baris presensi peserta.
          </p>
          <p>
            Kolom <strong>Hasil</strong> menyalin apa adanya verdict yang dipakai CMS: nilai lahn
            yang sudah terisi dinyatakan <em>lulus</em> bila peserta tercatat hadir pada pertemuan
            ujian itu, dan <em>tidak lulus</em> bila tidak. Peserta yang tidak hadir dihitung tidak
            lulus walau nilainya belum diisi. Jadi verdict ini bersandar pada kehadiran, bukan pada
            ambang jumlah lahn — kolom kehadiran sengaja ditampilkan agar bisa ditelusuri.
          </p>
          <p>
            <strong>Belum dinilai</strong> berarti peserta hadir tapi guru belum menuliskan nilainya
            — bukan nol dan bukan tidak lulus. Baris tanpa nama muncul bila peserta ada di presensi
            tapi belum ikut tertarik ke daftar peserta; namanya menyusul pada sync berikutnya.
          </p>
        </div>
      </details>

      {hasil.some((r) => r.presensiId != null) ? (
        // `key` memaksa remount saat saringan datang dari URL (chip KPI), supaya
        // state saringan di klien tidak tertinggal di nilai lama.
        <HasilTable
          key={filter}
          rows={hasil.filter((r) => r.presensiId != null)}
          initialFilter={filter}
        />
      ) : (
        <EmptyState
          title="Pertemuan ujiannya ada, presensinya belum"
          description="Semua pertemuan ujian di program ini belum punya satu baris presensi pun, jadi belum ada peserta yang bisa ditampilkan hasilnya. Daftar ujiannya tetap ada di bawah."
        />
      )}

      <Card id="daftar-ujian">
        <CardHeader>
          <CardTitle>Pertemuan ujian ({ujian.length})</CardTitle>
          <p className="mt-1 text-12 text-ink-muted">
            Satu baris per pertemuan ujian. “Belum dinilai” hanya diberikan pada ujian yang
            tanggalnya sudah lewat — ujian yang belum berlangsung bukan tunggakan.
          </p>
        </CardHeader>
        <CardContent>
          <UjianTable rows={ujian} />
        </CardContent>
      </Card>
        </>
      )}
    </Shell>
  );
}

/**
 * Evaluasi Halaqah (Maahir). Hanya peserta yang SUDAH punya nilai pada sesi
 * terkirim atau rapot aktif yang menjadi baris; sisanya dihitung di hero
 * supaya "belum dinilai" terlihat sebagai tunggakan, bukan hilang.
 */
function SeksiMaahir({ data }: { data: EvaluasiMaahirData }) {
  const r = data.ringkas;
  const persen = r.peserta === 0 ? null : Math.round((r.pesertaBernilai / r.peserta) * 1000) / 10;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-16 font-semibold">Evaluasi Halaqah (Maahir)</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-ink-muted">
          <SyncStatus at={data.syncedAt ?? undefined} />
          <span>
            Skor 0–100 dihitung Maahir dari jumlah lahn. Nilai di sesi yang belum dikirim pengajar (draft) ikut
            ditampilkan dengan tanda <span className="text-warn">*</span> — masih bisa berubah.
          </span>
        </div>
      </div>
      <KpiStrip
        hero={{
          label: `Peserta sudah bernilai · ${r.pesertaBernilai} dari ${r.peserta}`,
          value: persen == null ? "—" : persen.toLocaleString("id-ID"),
          unit: persen == null ? undefined : "%",
          progress: persen ?? undefined,
          target: 100,
        }}
        support={[
          { label: "Bernilai final", value: r.pesertaFinal, hint: `${r.pesertaBernilai - r.pesertaFinal} hanya dari draft` },
          { label: "Sesi terkirim", value: r.sesiTerkirim, hint: `${r.sesiDraft} masih draft` },
          { label: "Rapot aktif", value: r.rapotAktif, hint: `${r.rapotLulus} lulus` },
        ]}
        issues={[
          { label: "sesi belum dikirim (draft)", value: r.sesiDraft, href: "#halaqah-maahir" },
          { label: "rapot tidak lulus", value: r.rapotAktif - r.rapotLulus, tone: "danger" },
        ]}
        allClearText="Semua sesi sudah dikirim dan semua rapot yang terbit lulus."
      />
      {data.peserta.length > 0 ? (
        <NilaiMaahirTable rows={data.peserta} kodePeserta={data.kodePeserta} />
      ) : (
        <EmptyState
          title="Halaqahnya ada, nilainya belum"
          description="Halaqah program ini sudah ada di Evaluasi Halaqah Maahir, tapi belum ada sesi yang dikirim pengajar maupun rapot yang terbit. Daftar halaqahnya tetap ada di bawah."
        />
      )}
      <Card id="halaqah-maahir">
        <CardHeader>
          <CardTitle>Per halaqah ({data.halaqah.length})</CardTitle>
          <p className="mt-1 text-12 text-ink-muted">
            Sesi QN/PB/ujian = sesi yang sudah dikirim. Draft = sesi yang belum dikirim pengajar; nilainya ikut di tabel peserta
            tapi masih bisa berubah. Angka dalam kurung = peserta yang punya nilai final.
          </p>
        </CardHeader>
        <CardContent>
          <HalaqahMaahirTable rows={data.halaqah} />
        </CardContent>
      </Card>
    </section>
  );
}
