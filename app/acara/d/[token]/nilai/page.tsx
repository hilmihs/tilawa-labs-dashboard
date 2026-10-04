import Link from "next/link";
import { catatAksesToken, resolveDivisiToken } from "@/lib/acara/access";
import { tautkanPanitia } from "@/lib/orang/tautan-panitia";
import { getFormPic } from "@/lib/penilaian/pic";
import { FormNilaiPic } from "./FormNilaiPic";

export const metadata = { title: "Nilai anggota" };
export const dynamic = "force-dynamic";

/**
 * Tautan penilaian PIC (design "Input Penilaian" p2) — dibuka dari HP lewat
 * tautan papan divisi yang sama, tanpa akun. Nomor WA anggota tidak dikirim ke
 * klien, sama dengan papan divisi.
 */
export default async function NilaiAnggotaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const akses = await resolveDivisiToken(token);
  if (!akses) {
    return (
      <main className="mx-auto max-w-md px-4 py-6">
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Tautan tidak valid atau sudah kedaluwarsa. Hubungi tim kaderisasi untuk tautan baru.
        </div>
      </main>
    );
  }
  await tautkanPanitia(akses.acara.id);
  const acara = {
    id: akses.acara.id,
    tanggal: String(akses.acara.tanggal),
    jamMulai: akses.acara.jamMulai ?? null,
    toleransiMenit: akses.acara.toleransiMenit ?? 15,
  };
  const { kpi, anggota } = await getFormPic(acara, akses.divisi.id);
  await catatAksesToken(akses, "buka", { tabel: "penilaian", id: akses.divisi.id });

  return (
    <main className="mx-auto max-w-md space-y-3 px-4 py-5">
      <header className="space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          {akses.acara.nama} · {akses.divisi.nama}
        </div>
        <h1 className="text-xl font-bold">Nilai anggotamu</h1>
        <p className="text-xs text-neutral-500">
          ±2 menit · skala B (sangat baik) sampai E (perlu perhatian) · nilai masuk ke catatan kaderisasi, tidak
          ditampilkan ke anggota.{" "}
          <Link href={`/acara/d/${token}`} className="text-primary underline">
            Kembali ke papan divisi
          </Link>
        </p>
      </header>
      <FormNilaiPic token={token} kpi={kpi} anggota={anggota} />
    </main>
  );
}
