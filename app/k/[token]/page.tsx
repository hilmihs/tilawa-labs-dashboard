import Link from "next/link";
import { statusHari } from "@/lib/kantor/aturan";
import { hariKerjaPekan, izinAktif, ringkasanPekan, type SelPekan } from "@/lib/kantor/izin";
import { absenPetugasRentang, getPetugasByToken, izinPetugas } from "@/lib/kantor/queries";
import { hijriPendek } from "@/lib/kantor/tanggal-ar";
import { AR, AR_IZIN, jamAr } from "@/lib/kantor/teks-ar";
import { tokenSah } from "@/lib/kantor/token";
import { jakartaDate, jamWib } from "@/lib/time/jakarta";
import { IkonIzin } from "./ikon";
import { TombolAbsen } from "./TombolAbsen";

export const dynamic = "force-dynamic";
export const metadata = { title: "تسجيل الحضور", robots: { index: false, follow: false } };

export default async function HalamanAbsen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const petugas = tokenSah(token) ? await getPetugasByToken(token) : null;
  if (!petugas) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">{AR.tautanTidakSah}</p>
      </main>
    );
  }

  const sekarang = new Date();
  const hariIni = jakartaDate(sekarang);
  const pekan = hariKerjaPekan(hariIni);
  const awal = pekan[0] < hariIni ? pekan[0] : hariIni;
  const [absen, izin] = await Promise.all([
    absenPetugasRentang(petugas.id, awal, pekan[4] > hariIni ? pekan[4] : hariIni),
    izinPetugas(petugas.id, awal, "9999-12-31"),
  ]);
  const hari = statusHari(absen.filter((a) => a.tanggal === hariIni));
  const ringkas = ringkasanPekan(
    hariIni,
    new Set(absen.filter((a) => a.jenis === "masuk").map((a) => a.tanggal)),
    izin,
  );
  // Kabar terbaru yang belum berakhir — pintas ke halamannya (kirim ulang WA / batalkan).
  const izinBerjalan = izin.find((i) => i.sampai >= hariIni && izinAktif(i.status));

  const statusBaris = hari.keluar && hari.masuk
    ? AR.sudahPulang(jamAr(jamWib(hari.masuk), true), jamAr(jamWib(hari.keluar), true))
    : hari.masuk
      ? AR.hadirSejak(jamAr(jamWib(hari.masuk), true))
      : `${AR.belumHadir} · ${AR_IZIN.dinas(petugas.jamMasuk)}`;

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden bg-[#1F4D3A] text-[#F7F2E8]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[70dvh] bg-[radial-gradient(circle_at_50%_48%,rgba(247,242,232,.10)_0,rgba(247,242,232,0)_55%)]" />
      <header className="relative flex items-center justify-between gap-3 px-6 pt-6">
        <p className="text-sm font-semibold opacity-90">{AR.judul}</p>
        <p className="text-[13px] text-[#E9CE95]">{hijriPendek(sekarang)}</p>
      </header>

      <div className="relative px-6 pt-6 text-center">
        <p className="text-base opacity-80">{AR.salam}</p>
        <h1 className="[font-family:var(--font-k-judul),serif] text-[30px] leading-snug font-bold">{petugas.namaArab}</h1>
      </div>

      <section className="relative flex flex-1 flex-col items-center justify-center gap-4 py-8">
        <TombolAbsen
          token={token}
          jenis={hari.keluar ? null : hari.masuk ? "keluar" : "masuk"}
          jamAwal={jamWib(sekarang)}
        />
        <p className="px-6 text-center text-[15px] text-[#E9CE95]">{statusBaris}</p>
      </section>

      <section className="relative flex flex-col gap-4 rounded-t-[28px] bg-[#F7F2E8] px-6 pt-6 pb-7 text-[#1C2A23]">
        <div>
          <div className="mb-2.5 flex justify-between text-sm text-[#5B6A62]">
            <span>{AR_IZIN.pekanIni}</span>
            <span className="font-semibold text-[#1F4D3A]">{AR_IZIN.ringkasPekan(ringkas.hadir, ringkas.izin)}</span>
          </div>
          <ol className="grid grid-cols-5 gap-2 text-center text-[13px]">
            {ringkas.sel.map((s, i) => (
              <li key={s.tanggal} className="flex flex-col items-center gap-1.5">
                <span className={s.hariIni ? "font-bold text-[#1F4D3A]" : "text-[#5B6A62]"}>{AR_IZIN.hariPendek[i]}</span>
                <Sel s={s} />
              </li>
            ))}
          </ol>
        </div>

        {izinBerjalan && (
          <Link
            href={`/k/${token}/izin/${izinBerjalan.id}`}
            className="flex items-center justify-between rounded-2xl bg-[#F5E6CB] px-4 py-3 text-[15px] text-[#7A4A1E]"
          >
            <span>
              {AR_IZIN.pesanIzinTerakhir} · {AR_IZIN.statusIzin[izinBerjalan.status as keyof typeof AR_IZIN.statusIzin]}
            </span>
            <span className="font-semibold">{AR_IZIN.lihat} ←</span>
          </Link>
        )}

        <Link
          href={`/k/${token}/izin`}
          className="flex h-[58px] items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] border-[#C9B894] text-lg font-semibold text-[#7A4A1E] hover:bg-[#EFE6D3]"
        >
          <IkonIzin />
          {AR_IZIN.mintaIzin}
        </Link>
      </section>
    </main>
  );
}

function Sel({ s }: { s: SelPekan }) {
  const dasar = "flex h-11 w-12 items-center justify-center rounded-xl font-bold";
  if (s.keadaan === "hadir") return <span className={`${dasar} bg-[#DCE8DF] text-[#1F4D3A]`} aria-label="حاضر">✓</span>;
  if (s.keadaan === "izin") return <span className={`${dasar} bg-[#F5E6CB] text-xs text-[#7A4A1E]`}>{AR_IZIN.izin}</span>;
  if (s.hariIni)
    return <span className={`${dasar} border-2 border-dashed border-[#1F4D3A] text-xs text-[#1F4D3A]`}>{AR_IZIN.hariIni}</span>;
  return <span className={`${dasar} bg-[#EDE5D4] text-[#B5A98F]`} aria-hidden>{s.lewat ? "—" : ""}</span>;
}
