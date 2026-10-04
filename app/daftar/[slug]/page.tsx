import { getAcaraBySlug } from "@/lib/acara/queries";
import { FormDaftar } from "./FormDaftar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daftar kehadiran kajian" };

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
function tgl(iso: string): string { const [y, m, d] = iso.split("-"); return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`; }

/** Formulir daftar mandiri: dapat kartu QR (/h/[kode]) begitu selesai. Publik, tanpa akun. */
export default async function DaftarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acara = await getAcaraBySlug(slug);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      {!acara || !acara.terimaPendaftaran ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-14 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">Pendaftaran tidak dibuka.</div>
      ) : (
        <>
          <p className="text-11 uppercase tracking-wide text-muted-foreground">Education Board · Pendaftaran</p>
          <h1 className="mt-1 text-20 font-semibold leading-tight">{acara.nama}</h1>
          {acara.pemateri && <p className="mt-1 text-15 font-medium">{acara.pemateri}</p>}
          <p className="text-13 text-muted-foreground">{tgl(acara.tanggal)}{acara.jamMulai ? ` · ${acara.jamMulai.slice(0, 5)} WIB` : ""}{acara.lokasi ? ` · ${acara.lokasi}` : ""}</p>
          <p className="mt-3 text-13">Isi sekali; Anda akan langsung mendapat kartu QR yang berlaku untuk kajian ini dan kajian-kajian berikutnya. Kalau nomor WhatsApp Anda sudah terdaftar, kartu lama yang dipakai.</p>
          <FormDaftar slug={slug} />
        </>
      )}
    </main>
  );
}
