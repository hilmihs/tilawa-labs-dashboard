import QRCode from "qrcode";
import { baseUrl } from "@/lib/hadir/base-url";
import { getOrangByKode, listHadirOrang } from "@/lib/hadir/queries";
import { ekstrakKode, urlQr } from "@/lib/hadir/kode";
import { jamWibDari } from "@/lib/hadir/view-model";

export const metadata = { title: "QR Kehadiran" };
export const dynamic = "force-dynamic";

/**
 * Halaman publik per orang: QR + riwayat hadir. Kode di URL adalah satu-satunya
 * kredensial (49 bit acak), pola sama dengan /rekap dan /acara/d. Tidak ada
 * WA/email di layar — halaman ini dibagikan lewat grup dan tangkapan layar.
 */
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function tgl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
}

export default async function HalamanQr({ params }: { params: Promise<{ kode: string }> }) {
  const { kode: mentah } = await params;
  const kode = ekstrakKode(mentah);
  const o = kode ? await getOrangByKode(kode) : null;
  if (!o) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-14 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Kode QR tidak dikenal. Periksa tautan yang Anda terima, atau hubungi panitia.
        </div>
      </main>
    );
  }
  const url = urlQr(await baseUrl(), o.kodeQr);
  const [svg, riwayat] = await Promise.all([
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 320 }),
    listHadirOrang(o.id),
  ]);
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <p className="text-11 uppercase tracking-wide text-muted-foreground">Kartu kehadiran · Education Board</p>
      <h1 className="mt-1 text-20 font-semibold leading-tight">{o.nama}</h1>
      <p className="text-13 text-muted-foreground">{o.programTeks ?? "—"} · {o.gender === "P" ? "Akhwat" : "Ikhwan"}</p>

      <div className="mx-auto mt-5 w-full max-w-[320px] rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-2 text-center font-mono text-14 tracking-[0.2em]">{o.kodeQr}</p>
      <p className="mt-1 text-center text-12 text-muted-foreground">Tunjukkan QR ini kepada panitia saat datang. Simpan tangkapan layar agar bisa dibuka tanpa sinyal.</p>

      <div className="mt-4 flex justify-center gap-2">
        <a href={`/h/${o.kodeQr}/qr.png`} className="rounded bg-neutral-900 px-4 py-2 text-13 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900" download={`QR - ${o.nama}.png`}>
          Simpan gambar
        </a>
      </div>

      <a
        href={`/h/${o.kodeQr}/riwayat`}
        className="mt-6 block rounded-xl border border-neutral-200 px-4 py-3 text-13 hover:border-neutral-400 dark:border-neutral-700"
      >
        <span className="font-semibold">Lengkapi riwayat kegiatan 2022–2025 →</span>
        <span className="block text-12 text-muted-foreground">Centang kegiatan yang pernah diikuti; diverifikasi tim kaderisasi.</span>
      </a>

      <section className="mt-8">
        <h2 className="text-14 font-semibold">Riwayat kehadiran</h2>
        {riwayat.length === 0 ? (
          <p className="mt-1 text-12 text-muted-foreground">Belum ada kajian yang tercatat.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 text-13 dark:divide-neutral-800">
            {riwayat.map((r, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>{r.acaraNama}{r.pemateri && <span className="block text-11 text-muted-foreground">{r.pemateri}</span>}</span>
                <span className="tabular-nums text-muted-foreground">{tgl(r.tanggal)} · {jamWibDari(r.waktu)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
