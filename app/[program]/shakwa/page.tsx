/**
 * `/[program]/shakwa` — antrean tiket aduan/izin HITS, dari `rekap/shakwa`.
 *
 * Tiga hal yang menentukan bentuk halaman ini:
 *
 * 1. Angkanya milik Maahir. `total`, `belumDitangani`, `perKategori`, `perStatus`
 *    diambil apa adanya dari payload; halaman tidak pernah menghitung ulang dari
 *    `items` (docs/API-PUBLIC.md §9).
 * 2. Periode SELALU dari `periodLabel(meta)` — jendela 28→27, bukan nama bulan.
 * 3. Tidak ada data ≠ nol. Belum ditarik, scope ditolak, atau snapshot lama:
 *    masing-masing punya empty state / label sendiri, dan data lama tetap
 *    ditampilkan dengan cap "terakhir ditarik".
 *
 * Catatan cakupan: `rekap/shakwa` tidak mengirim penanda batch, jadi tiketnya
 * tidak bisa disaring ke satu program HITS. Yang ada cuma `halaqahLabel` per
 * tiket ("HITS JUNI"), dan itu ditampilkan di tiap baris. Menebak pemetaan
 * label→program akan diam-diam menyembunyikan tiket, jadi jendela ini
 * ditampilkan utuh dan dinyatakan lintas batch di layar.
 */
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { SyncStatus } from "@/components/ui/sync-status";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import { periodLabel, readShakwa } from "@/lib/maahir/rekap";
import { hasMaahirPin } from "@/lib/programs/nav";
import { getProgram } from "@/lib/programs/resolve";
import { ShakwaTickets } from "./ShakwaTickets";
import { isShakwaForbidden } from "./scope";
import { kategoriBuckets, statusBuckets } from "./view-model";

export const metadata = { title: "Shakwa — HITS" };
// Angkanya berubah tiap sync; tidak ada yang aman di-prerender.
export const dynamic = "force-dynamic";

/**
 * Shakwa hanya ada di HITS. Penanda yang dipakai adalah slug (`hits`, `hits-*`)
 * — bukan `reportFormat: "hits"`, yang juga dipasang di program kolaborasi
 * (tahsin-keluarga, tahfizh-nurul-iman) yang bukan HITS. Pin batch Maahir
 * (`config.maahirHitsBatchId`) dihitung sebagai penanda juga supaya program HITS
 * baru yang sudah dipin tidak perlu menunggu perubahan kode.
 *
 * Cabang pin itu dulu ditulis `typeof config.maahirHitsBatchId === "string"` dan
 * karena itu **tidak pernah benar**: `scripts/pin-maahir-batches.ts` selalu
 * menyimpan pin sebagai daftar, "even for the six programs with a single batch",
 * supaya pembacanya tidak perlu menebak bentuk. Cacatnya tak terlihat hanya
 * karena ketujuh program yang dipin kebetulan ber-slug `hits-*` dan lolos di
 * cabang pertama. Sekarang dipakai `maahirHitsBatchIds()` yang sama dengan yang
 * dipakai nav, jadi tab dan gerbang route tidak bisa berselisih.
 */
function isHitsProgram(program: { slug: string; config: unknown }): boolean {
  return /^hits(-|$)/.test(program.slug) || hasMaahirPin(program.config);
}

export default async function ShakwaPage({
  params,
}: {
  params: Promise<{ program: string }>;
}) {
  const { program: slug } = await params;
  // Akses sudah dijaga layout; di sini cuma perlu barisnya untuk gerbang HITS.
  const program = await getProgram(slug);
  if (!program || !isHitsProgram(program)) notFound();

  const [bulanIni, bulanLalu] = rekapMonths();
  // Sync hanya menarik jendela berjalan (lihat `maahirRekapPulls`). Jendela bulan
  // lalu masih tersimpan dari run bulan sebelumnya, jadi dipakai sebagai cadangan
  // — dengan label periodenya sendiri, supaya tidak menyamar jadi jendela ini.
  const berjalan = await readShakwa(bulanIni);
  const read = berjalan ?? (await readShakwa(bulanLalu));

  if (!read) {
    const forbidden = await isShakwaForbidden();
    return (
      <Shell periode={null} fetchedAt={null}>
        {forbidden ? (
          <EmptyState
            title="Scope shakwa belum diberikan"
            description="API key dashboard ditolak 403 forbidden_scope untuk rekap/shakwa, jadi tiket tidak bisa ditarik. Minta scope shakwa ke tim Maahir, lalu jalankan sync ulang."
          />
        ) : (
          <EmptyState
            title="Data shakwa belum ditarik"
            description="Belum ada satu pun tarikan rekap/shakwa yang tersimpan. Jalankan sync Maahir (pnpm sync:maahir atau tombol sync admin), lalu buka halaman ini lagi. Kosong di sini berarti belum ditarik — bukan nol tiket."
          />
        )}
      </Shell>
    );
  }

  const payload = read.payload;
  const periode = periodLabel(read.meta);
  const jendelaBasi = berjalan === null;

  const kategori = kategoriBuckets(payload);
  const status = statusBuckets(payload);
  const sudah = Math.max(0, payload.total - payload.belumDitangani);

  return (
    <Shell periode={periode} fetchedAt={read.fetchedAt}>
      {jendelaBasi && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Jendela laporan berjalan belum pernah ditarik. Yang tampil di bawah ini
          jendela sebelumnya{periode ? ` (${periode})` : ""} — jalankan sync Maahir
          untuk menariknya.
        </div>
      )}

      {/* Kartunya dulu merah tanpa syarat — layar tanpa tunggakan pun terbaca
          sebagai keadaan darurat. Sekarang tiket yang belum ditangani jadi chip
          masalah: nol tidak dirender, dan yang muncul satu baris "aman". */}
      <KpiStrip
        hero={{
          label: "Tiket periode ini",
          value: payload.total,
        }}
        support={[{ label: "Sudah ditangani", value: sudah }]}
        issues={[
          { label: "belum ditangani", value: payload.belumDitangani, tone: "danger" },
        ]}
        allClearText="Aman — semua tiket periode ini sudah ditangani"
      />

      {status.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="cap text-11 font-semibold text-ink-faint">Per status</span>
          {status.map((s) => (
            <Badge key={s.label} tone={s.tone}>
              {s.label} {s.jumlah} · {s.persen}%
            </Badge>
          ))}
        </div>
      )}
      <p className="text-11 text-ink-faint">
        Angka di atas datang dari Maahir apa adanya, bukan hitungan ulang daftar tiket di bawah.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-ink-muted">Per kategori</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {kategori.length === 0 ? (
            <p className="text-sm text-ink-faint">
              Tidak ada kategori pada periode ini.
            </p>
          ) : (
            kategori.map((k) => (
              <div key={k.key} className="flex items-center gap-3 text-sm">
                <div className="w-40 shrink-0 truncate">{k.label}</div>
                <div className="h-2 flex-1 overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800">
                  <div className="h-full bg-neutral-400" style={{ width: `${k.persen}%` }} />
                </div>
                <div className="w-20 shrink-0 text-right font-mono tabular-nums">
                  {k.jumlah}
                  <span className="ml-1 text-11 text-ink-faint">{k.persen}%</span>
                </div>
              </div>
            ))
          )}
          {/* Upstream hanya mengirim kategori yang benar-benar muncul di jendela
              ini, jadi kategori yang tidak ada = tidak ada tiket, bukan nol yang
              kami tebak sendiri. */}
        </CardContent>
      </Card>

      {payload.items?.length ? (
        <ShakwaTickets payload={payload} />
      ) : (
        <EmptyState
          tone="success"
          title="Tidak ada tiket shakwa di periode ini"
          description="Maahir menjawab dengan nol tiket untuk jendela ini — bukan data yang gagal ditarik."
        />
      )}
    </Shell>
  );
}

/** Kerangka halaman: judul, periode, dan cap "terakhir ditarik" selalu ada,
 *  termasuk pada empty state — supaya layar tidak pernah tampil tanpa konteks. */
function Shell({
  periode,
  fetchedAt,
  children,
}: {
  periode: string | null;
  fetchedAt: Date | null;
  children: React.ReactNode;
}) {
  return (
    // Halaman baca: isinya tiket berupa prosa, bukan tabel lebar.
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-20 font-bold tracking-[-0.01em]">Shakwa</h1>
          <p className="mt-1 text-14 text-ink-muted">
            Tiket aduan dan izin peserta serta pengajar HITS, apa adanya dari Maahir.
          </p>
        </div>
        <div className="text-right text-12 text-ink-muted">
          <div className="font-medium">{periode ?? "Periode belum diketahui"}</div>
          <SyncStatus at={fetchedAt} prefix="Terakhir ditarik" />
        </div>
      </div>
      {/* Dua caveat yang dulu berdiri sebagai paragraf sendiri — penting, tapi
          tidak setiap kali dibaca. */}
      <details className="text-12 text-ink-muted">
        <summary className="cursor-pointer font-medium">Cakupan &amp; batasan daftar ini</summary>
        <p className="mt-1.5">
          Tiket shakwa datang untuk seluruh batch HITS — API tidak mengirim penanda batch, jadi
          daftar ini tidak disaring per program; batch asal terbaca di label halaqah tiap tiket.
          Nomor WA pelapor juga tidak pernah dikirim API, jadi tidak ada kontak yang bisa
          ditampilkan di sini.
        </p>
      </details>
      {children}
    </main>
  );
}
