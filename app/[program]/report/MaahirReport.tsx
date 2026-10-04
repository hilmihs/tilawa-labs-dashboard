/**
 * Laporan bulanan Maahir — pengunduhan workbook.
 *
 * Workbook-nya (`lib/reports/maahir-bulanan-xlsx.ts`) sudah lengkap sejak lama
 * tapi selama ini hanya bisa dipanggil dari CLI; koordinator tidak punya jalan
 * ke sana dari layar. Halaman ini jalan itu.
 *
 * Sengaja tidak menampilkan angka apa pun. Semua angkanya sudah ada di tab
 * Kehadiran / Rincian Kelas / At-Tibyan / SP, masing-masing dengan label
 * periodenya sendiri — dan periode di berkas ini bukan satu periode: Ringkasan
 * dan Kehadiran memakai jendela 28→27, SP kumulatif sejak awal program. Menaruh
 * ringkasan angka di sini berarti mengarang satu periode untuk semuanya.
 *
 * Bulan yang ditawarkan hanya bulan berjalan dan bulan lalu, karena hanya itu
 * yang ditarik sync (`rekapMonths()`). Bulan lain memang ada di URL, dan route
 * unduhannya menjawab 404 dengan penjelasan — itu perilaku yang benar, bukan
 * yang perlu disembunyikan.
 */
import Link from "next/link";
import { Download } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { SyncStatus } from "@/components/ui/sync-status";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import { periodLabel, readLaporanMaahir } from "@/lib/maahir/rekap";

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "Agustus 2026" — hanya untuk menamai tombol, bukan untuk melabeli periode. */
function labelBulan(bulan: string): string {
  const [y, m] = bulan.split("-").map(Number);
  return Number.isFinite(y) && Number.isFinite(m) ? `${NAMA_BULAN[m - 1]} ${y}` : bulan;
}

export async function MaahirReport({ program }: { program: string }) {
  const bulanList = rekapMonths();
  // Satu pembacaan per bulan supaya tombol bisa menyebut periode SEBENARNYA
  // (meta.mulai–meta.sampai) dan bukan nama bulannya. Jendela Maahir 28→27:
  // "Agustus" akan berbohong sekitar sepuluh hari di kedua ujungnya.
  const reads = await Promise.all(bulanList.map((b) => readLaporanMaahir(b)));

  return (
    <div className="space-y-4">
      <div className="max-w-3xl">
        <h1 className="text-20 font-bold tracking-[-0.01em]">Laporan Bulanan Maahir</h1>
        <p className="mt-1 text-14 text-ink-muted">
          Workbook xlsx berisi Ringkasan, Kehadiran per Kelas, At-Tibyan, SP, dan Presensi Belum
          Diisi — angkanya diambil apa adanya dari rekap Maahir, tidak dihitung ulang di sini.
        </p>
      </div>

      <Alert variant="info">
        Berkas ini memuat lebih dari satu definisi periode: Ringkasan, Kehadiran, dan At-Tibyan
        memakai jendela laporan Maahir <strong>28→27</strong>, sedangkan SP bersifat{" "}
        <strong>kumulatif sejak awal program</strong>. Tiap lembar membawa label periodenya sendiri
        — jangan diadu satu sama lain.
      </Alert>

      <ul className="space-y-2">
        {bulanList.map((bulan, i) => {
          const read = reads[i];
          const periode = read ? periodLabel(read.meta) : null;
          return (
            <li
              key={bulan}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-300 bg-card px-4 py-3 dark:border-neutral-800"
            >
              <div>
                <div className="text-sm font-medium">{labelBulan(bulan)}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-12 text-ink-muted">
                  {/* Periode dari meta, tidak pernah dari nama bulan. */}
                  <span>Periode {periode ?? "belum diketahui"}</span>
                  {read && (
                    <>
                      <span aria-hidden>·</span>
                      <SyncStatus at={read.fetchedAt} prefix="Terakhir ditarik" />
                    </>
                  )}
                </div>
              </div>

              {read ? (
                <Link
                  href={`/api/reports/${program}/maahir-bulanan?bulan=${bulan}`}
                  prefetch={false}
                  className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-12 font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  <Download className="size-3.5" />
                  Unduh xlsx
                </Link>
              ) : (
                // Belum ditarik ≠ nol. Tombolnya tidak dipasang, karena berkas
                // yang keluar akan berisi kolom kosong yang terbaca sebagai nol
                // oleh orang yang tidak pernah melihat kode ini.
                <span className="text-12 text-ink-faint">Belum ditarik — jalankan sync Maahir</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
