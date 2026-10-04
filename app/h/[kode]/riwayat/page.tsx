import Link from "next/link";
import { getOrangByKode } from "@/lib/hadir/queries";
import { ekstrakKode } from "@/lib/hadir/kode";
import { listRiwayatMandiri } from "@/lib/orang/riwayat";
import { FormRiwayat } from "./FormRiwayat";

export const metadata = { title: "Riwayat kegiatan" };
export const dynamic = "force-dynamic";

/**
 * Isian riwayat kegiatan 2022–2025 oleh orangnya sendiri (rekomendasi Batch 3).
 * Dibuka dari halaman QR pribadi; kode QR adalah kredensialnya, sama dengan
 * /h/[kode]. Tidak ada data pribadi lain di layar.
 */
export default async function RiwayatMandiriPage({ params }: { params: Promise<{ kode: string }> }) {
  const { kode: mentah } = await params;
  const kode = ekstrakKode(mentah);
  const o = kode ? await getOrangByKode(kode) : null;
  if (!o) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-14 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Kode tidak dikenal. Periksa tautan yang Anda terima.
        </div>
      </main>
    );
  }
  const awal = await listRiwayatMandiri(o.id);
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <header>
        <Link href={`/h/${o.kodeQr}`} className="text-12 text-ink-muted hover:text-primary">
          ← Kartu QR
        </Link>
        <h1 className="mt-1 text-20 font-bold">Riwayat kegiatan 2022–2025</h1>
        <p className="mt-1 text-13 text-ink-muted">
          {o.nama} — centang kegiatan yang pernah Anda ikuti tiap tahun beserta peran Anda. Isian ini diverifikasi tim
          kaderisasi sebelum masuk CV. Kegiatan sejak 2026 sudah tercatat otomatis dari presensi QR.
        </p>
      </header>
      <FormRiwayat kode={o.kodeQr} awal={awal} />
    </main>
  );
}
