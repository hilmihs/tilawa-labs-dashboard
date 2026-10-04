/**
 * `/[program]/inspeksi` — penilaian pedagogis bulanan yang diisi ketua kelompok,
 * dicerminkan dari entitas `penilaian-pedagogis` milik Maahir.
 *
 * Layar ini menjawab satu pertanyaan: **siapa yang belum dinilai bulan ini.**
 * Karena itu isinya cacahan baris dan kelima skor mentah — tidak ada rata-rata,
 * peringkat, atau persentase kelengkapan. `rata_rata_pedagogis` (yang hanya
 * mencakup empat dari lima skor ini) sudah tersaji di tab Matrix pada
 * `/[program]/pengajar`, datang jadi dari snapshot `rekap/matrix-guru`, dan
 * `docs/API-PUBLIC.md` §9 melarang menurunkannya ulang dari entitas mentah.
 *
 * Rutenya hanya untuk program dengan pin batch Maahir: tanpa pin tidak ada cara
 * memisahkan pengajar kelompok ini dari 183 pengajar HITS lainnya, dan
 * menampilkan semuanya lebih buruk daripada tidak menampilkan apa pun — sama
 * dengan gerbang di `lib/programs/nav.ts`, yang juga baru menawarkan tab ini
 * setelah pinnya ada.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncStatus } from "@/components/ui/sync-status";
import { hasMaahirPin } from "@/lib/programs/nav";
import { getProgram } from "@/lib/programs/resolve";
import { InspeksiTable } from "./InspeksiTable";
import { loadInspeksi } from "./queries";
import { labelBulan, type InspeksiKelompok } from "./view-model";

export const metadata = { title: "Inspeksi Pengajar" };
// Baca DB tiap request — isinya berubah setiap sync Maahir jalan.
export const dynamic = "force-dynamic";

/**
 * Next menyerahkan `?bulan=a&bulan=b` sebagai array, bukan string. Diambil yang
 * pertama, sama seperti `app/[program]/asesmen/page.tsx` — mengetiknya sebagai
 * `string` saja membuat tipe berbohong tentang apa yang benar-benar tiba.
 */
function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}


const SHELL = "mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8";

/**
 * Nilai `?kelompok=` untuk pengajar yang belum berkelompok. `kelompok_id`-nya
 * string kosong di view-model, yang tidak bisa dibawa lewat URL.
 */
const TANPA_KELOMPOK = "tanpa-kelompok";

/** Kunci URL satu kelompok. */
function kunci(k: InspeksiKelompok): string {
  return k.id || TANPA_KELOMPOK;
}

/** Semua kelompok, atau satu saja bila `?kelompok=` menunjuk yang memang ada. */
function pilihKelompok(semua: InspeksiKelompok[], id: string | undefined): InspeksiKelompok[] {
  if (!id || id === "semua") return semua;
  const satu = semua.filter((k) => kunci(k) === id);
  // Id yang tidak dikenal (kelompok bubar, tautan lama) jatuh ke tampilan penuh,
  // bukan ke tabel kosong yang tidak bisa dijelaskan.
  return satu.length > 0 ? satu : semua;
}

function PickerRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

function PickerLink({
  href,
  aktif,
  children,
}: {
  href: string;
  aktif: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-2.5 py-1 text-12 ${
        aktif
          ? "border-neutral-900 font-medium dark:border-neutral-100"
          : "border-neutral-300 text-ink-muted hover:text-foreground dark:border-neutral-800"
      }`}
    >
      {children}
    </Link>
  );
}

function Header({ judul, sub }: { judul: string; sub: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-20 font-bold tracking-[-0.01em]">{judul}</h1>
      <p className="mt-1 text-sm text-ink-muted">{sub}</p>
    </div>
  );
}

export default async function InspeksiPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ program: slug }, sp] = await Promise.all([params, searchParams]);
  const bulanParam = pick(sp.bulan);
  const kelompokParam = pick(sp.kelompok);
  const programRow = await getProgram(slug);
  if (!programRow || !hasMaahirPin(programRow.config)) notFound();

  const data = await loadInspeksi(programRow.config, bulanParam);

  // `tanpa-pin` sudah dicegat gerbang di atas, tapi tetap ditangani: keadaannya
  // milik `loadInspeksi`, dan pemanggil lain tidak boleh jatuh ke layar kosong
  // tanpa kalimat.
  if (data.state === "tanpa-pin") {
    return (
      <main className={SHELL}>
        <Header judul="Inspeksi" sub="Penilaian pedagogis bulanan oleh ketua kelompok." />
        <EmptyState
          title="Pin batch Maahir belum diisi"
          description="Program ini belum punya config.maahirHitsBatchId, jadi pengajarnya tidak bisa dipisahkan dari 183 pengajar HITS lainnya. Jalankan skrip pengisian pin batch lebih dulu."
        />
      </main>
    );
  }

  if (data.state === "scope-ditolak") {
    return (
      <main className={SHELL}>
        <Header judul="Inspeksi" sub="Penilaian pedagogis bulanan oleh ketua kelompok." />
        <EmptyState
          title="Scope penilaian belum diberikan"
          description="Kunci API Maahir dijawab 403 forbidden_scope untuk penilaian-pedagogis, jadi lembar penilaiannya tidak pernah sampai ke sini. Ini soal izin, bukan soal sync — dan bukan berarti belum ada yang dinilai."
        />
      </main>
    );
  }

  if (data.state === "belum-ditarik") {
    return (
      <main className={SHELL}>
        <Header judul="Inspeksi" sub="Penilaian pedagogis bulanan oleh ketua kelompok." />
        <EmptyState
          title="Penilaian pedagogis belum pernah ditarik"
          description="Belum ada satu pun baris penilaian-pedagogis di cermin Maahir, jadi tidak ada penilaian yang bisa ditampilkan — bukan nol pengajar dinilai. Jalankan sync Maahir lebih dulu."
        />
      </main>
    );
  }

  if (data.state === "mirror-kosong") {
    return (
      <main className={SHELL}>
        <Header judul="Inspeksi" sub="Penilaian pedagogis bulanan oleh ketua kelompok." />
        <EmptyState
          title="Daftar halaqah batch ini belum tersinkron"
          description={`Penilaiannya ada, tapi cermin hits/halaqah dan hits/pengajar tidak memuat baris untuk batch ${data.batchIds.join(", ")} — tanpa itu penilaian tidak bisa disaring ke program ini. Jalankan sync Maahir lebih dulu.`}
        />
      </main>
    );
  }

  const { view, bulan, pilihanBulan, ditarikPada, rubrikKosong, teguranAktif } = data;
  const { ringkas } = view;
  const tampil = pilihKelompok(view.kelompok, kelompokParam);
  const kelompokAktif = tampil.length === view.kelompok.length ? "semua" : kunci(tampil[0]);
  const qs = (next: { bulan?: string; kelompok?: string }) => {
    const p = new URLSearchParams();
    p.set("bulan", next.bulan ?? bulan);
    const k = next.kelompok ?? kelompokAktif;
    if (k && k !== "semua") p.set("kelompok", k);
    return `/${slug}/inspeksi?${p.toString()}`;
  };

  return (
    <main className={SHELL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header
          judul={`Inspeksi — ${labelBulan(bulan)}`}
          sub={
            <>
              Pantau pengisian penilaian oleh ketua kelompok ·{" "}
              <span className="tabular-nums">
                {ringkas.dinilai} dari {ringkas.ditagih} pengajar dinilai
              </span>
            </>
          }
        />
        <PickerRow>
          {pilihanBulan.map((b) => (
            <PickerLink key={b} href={qs({ bulan: b })} aktif={b === bulan}>
              {labelBulan(b)}
            </PickerLink>
          ))}
        </PickerRow>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-ink-muted">
        <SyncStatus at={ditarikPada} prefix="Terakhir ditarik" />
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {ringkas.kelompok} kelompok · {ringkas.pengajar} pengajar batch ini
        </span>
        {ringkas.dikecualikan > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>
              {ringkas.dikecualikan} pengajar ber-<code>matrix_exclude</code> di Maahir tidak ikut
              ditagih penilaian
            </span>
          </>
        )}
        {ringkas.tanpaProfil > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>
              {ringkas.tanpaProfil} pengajar batch ini belum punya baris di hits/pengajar, jadi
              tidak bisa ditampilkan
            </span>
          </>
        )}
      </div>

      {/* Kolom SOP ikut satu formulir, tapi bukan komponen pedagogis. Dinyatakan
          di kepala halaman supaya tidak ada yang menjumlahkan kelimanya sendiri
          dan mengira hasilnya sama dengan rata_rata_pedagogis di tab Matrix. */}
      <p className="max-w-3xl text-12 text-ink-muted">
        Kepatuhan SOP diisi pada lembar yang sama, tetapi Maahir mengarsipkannya sebagai{" "}
        <strong>soft skill</strong> — <code>rata_rata_pedagogis</code> di tab Matrix hanya mencakup
        empat kolom lainnya. Karena itu SOP berdiri di kolomnya sendiri di sini, dan skor apa pun di
        halaman ini tidak dirata-ratakan.
        {rubrikKosong && " Rubrik indikator-standar belum tersinkron, jadi tidak ada ambang yang bisa ditandai."}
      </p>

      {view.kelompok.length > 1 && (
        <PickerRow>
          <PickerLink href={qs({ kelompok: "semua" })} aktif={kelompokAktif === "semua"}>
            Semua kelompok
          </PickerLink>
          {view.kelompok.map((k) => (
            <PickerLink
              key={kunci(k)}
              href={qs({ kelompok: kunci(k) })}
              aktif={kelompokAktif === kunci(k)}
            >
              {k.nama}{" "}
              <span className="text-ink-faint tabular-nums">
                {k.dinilai}/{k.dinilai + k.belumDinilai}
              </span>
            </PickerLink>
          ))}
        </PickerRow>
      )}

      {ringkas.pengajar === 0 ? (
        <EmptyState
          title="Tidak ada pengajar batch ini di daftar pengajar HITS"
          description="Halaqah batch ini tersinkron, tapi tidak satu pun pengajarnya punya baris di hits/pengajar — jadi tidak ada yang bisa didaftar. Bukan berarti tidak ada yang mengajar."
        />
      ) : (
        <>
          {/* Nol pengajar dinilai BUKAN alasan menyembunyikan tabel — layar ini
              ada justru untuk menjawab "siapa yang belum dinilai bulan ini",
              dan jawabannya "semuanya" adalah jawaban paling berguna, bukan
              paling kosong. Diukur 7 Sep 2026: hits-nurul-iman (0/8) dan
              hits-safar-jan (0/4) mendarat tepat di keadaan ini pada bulan
              bawaan, dan dulu keduanya hanya melihat empty state.
              Satu-satunya empty state yang sah di sini adalah `pengajar === 0`
              di atas: tidak ada orang untuk didaftar sama sekali. */}
          {ringkas.dinilai === 0 && (
            <Alert variant="info">
              Belum ada satu pun penilaian {labelBulan(bulan)} untuk {ringkas.ditagih} pengajar
              batch ini — bulannya bisa jadi memang masih berjalan. Semua sel di bawah kosong
              karena belum diisi, bukan karena bernilai nol.
            </Alert>
          )}
          <InspeksiTable kelompok={tampil} legenda={view.legenda} teguranAktif={teguranAktif} />
        </>
      )}
    </main>
  );
}
