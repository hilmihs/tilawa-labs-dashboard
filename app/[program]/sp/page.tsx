/**
 * /[program]/sp — daftar Surat Peringatan Maahir, cermin route `rekap/sp`.
 *
 * Angka di layar ini KUMULATIF sejak awal program (`mulai`) sampai `cutoff`,
 * sementara blok SP di `/[program]/dashboard` datang dari `rekap/laporan-maahir`
 * dan hanya mencakup jendela 28→27 bulan itu (docs/API-PUBLIC.md §9). Dua angka
 * yang beda arti itu akan diadu oleh siapa pun yang membuka dua tab, jadi
 * rentangnya dinyatakan tegas di kepala halaman dan di banner — bukan sebagai
 * catatan kaki.
 *
 * Hanya untuk program ber-`dataSourceType = 'maahir_api'`; selain itu
 * `notFound()`.
 */
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { SyncStatus } from "@/components/ui/sync-status";
import { readSp } from "@/lib/maahir/rekap";
import { getProgram } from "@/lib/programs/resolve";
import { isRouteForbidden } from "./scope";
import { SpTable } from "./SpTable";
import { cutoffLabel, formatTanggal, spRows } from "./view-model";

export const metadata = { title: "Surat Peringatan (kumulatif)" };
// Baca DB tiap request — daftarnya berubah setiap sync Maahir jalan.
export const dynamic = "force-dynamic";

export default async function SpPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program: slug } = await params;
  const programRow = await getProgram(slug);
  if (programRow?.dataSourceType !== "maahir_api") notFound();

  const [read, forbidden] = await Promise.all([
    readSp(),
    isRouteForbidden(programRow.id, "rekap/sp"),
  ]);

  const header = (
    <div>
      <h1 className="text-20 font-bold tracking-[-0.01em]">Surat Peringatan — kumulatif</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Hitungan sejak awal program, bukan per bulan.
      </p>
    </div>
  );

  if (!read) {
    return (
      <main className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
        {header}
        {forbidden ? (
          <EmptyState
            title="Scope rekap SP belum diberikan"
            description="API key kita dijawab 403 forbidden_scope untuk route rekap/sp, jadi daftarnya tidak pernah sampai ke sini. Mintakan scope 'maahir' ke pengelola API Maahir — ini bukan berarti tidak ada yang ber-SP."
          />
        ) : (
          <EmptyState
            title="Daftar SP belum pernah ditarik"
            description="Belum ada baris rekap/sp di maahir_rekap. Jalankan sync Maahir lebih dulu; kosong di sini berarti belum ditarik, bukan nol orang ber-SP."
          />
        )}
      </main>
    );
  }

  const { payload, meta, fetchedAt } = read;
  const rows = spRows(payload.list);
  // `cutoff` dibaca dari payload dan dipakai sebagai cadangan kalau meta kosong;
  // rentangnya tidak boleh diturunkan dari tanggal hari ini — cutoff adalah
  // tanggal saat upstream menghitung, bukan saat halaman ini dibuka.
  const cutoff = meta.cutoff ?? payload.cutoff;
  const { summary } = payload;

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      {header}

      {/* Bukan peringatan, melainkan penjelasan rentang — nadanya info, dan
          sisa penjelasannya dilipat supaya kepala halaman tetap satu baris. */}
      <Alert variant="info">
        <span className="font-semibold">Angka kumulatif</span> —{" "}
        <span className="font-medium">{cutoffLabel({ mulai: payload.mulai, cutoff })}</span>.
        <details className="mt-1">
          <summary className="cursor-pointer text-xs opacity-80">
            Kenapa beda dengan blok SP di dashboard?
          </summary>
          <p className="mt-1 text-xs opacity-80">
            Rentang di sini sejak awal program sampai cutoff yang dipakai upstream saat
            menghitung. Blok SP di halaman dashboard hanya mencakup periode bulan itu (jendela
            28→27), sedangkan yang di sini seluruh riwayat program — dua angka yang memang
            berbeda arti.
          </p>
        </details>
      </Alert>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span>
          Cutoff{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {formatTanggal(cutoff)}
          </span>
        </span>
        <span aria-hidden>·</span>
        {/* Halaman tetap tampil dengan angka lama saat sync terakhir gagal —
            cap ini yang memberi tahu seberapa lama angkanya sudah menganggur.
            Warnanya mengikuti ambang usia data, bukan merah tanpa syarat. */}
        <SyncStatus at={fetchedAt} prefix="Terakhir ditarik" />
        {payload.perBulan && (
          // Belum pernah terjadi di tangkapan asli, tapi kalau upstream sampai
          // mengirim payload per-bulan lewat route ini, seluruh premis halaman
          // gugur — lebih baik terlihat daripada diam-diam salah label.
          <span className="font-medium text-danger">
            upstream menandai payload ini PER BULAN, bukan kumulatif
          </span>
        )}
      </div>

      {/* Satu angka yang menentukan layar ini (berapa orang ber-SP), sisanya
          konteks. Tingkat SP yang nol tidak lagi memakan slot: `issues`
          membuang nilai 0 sendiri, dan kalau semuanya nol yang muncul satu
          baris "aman" — bukan empat kotak berisi angka nol. */}
      <KpiStrip
        hero={{
          label: "Ber-SP aktif",
          value: summary.total,
          invert: true,
        }}
        support={[
          { label: "Baris terpantau", value: payload.list.length },
          ...(summary.diputihkan > 0
            ? [{ label: "Pernah diputihkan", value: summary.diputihkan }]
            : []),
        ]}
        issues={[
          { label: "SP 1", value: summary.sp1, tone: "info" },
          { label: "SP 2", value: summary.sp2, tone: "warning" },
          { label: "SP 3", value: summary.sp3, tone: "danger" },
        ]}
        allClearText="Aman — tidak ada SP aktif sepanjang program"
      />

      {rows.length === 0 ? (
        <EmptyState
          tone="success"
          title="Belum ada satu pun SP sepanjang program"
          description={`Terhitung sejak ${formatTanggal(payload.mulai)} sampai ${formatTanggal(cutoff)}.`}
        />
      ) : (
        <SpTable rows={rows} program={slug} />
      )}
    </main>
  );
}
