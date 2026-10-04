import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { pesanIkhbar, tautanWa } from "@/lib/kantor/ikhbar";
import { izinAktif, type AlasanIzin, type StatusIzin } from "@/lib/kantor/izin";
import { getIzin, getKantor, getPetugasByToken } from "@/lib/kantor/queries";
import { rentangAr } from "@/lib/kantor/tanggal-ar";
import { AR, AR_IZIN } from "@/lib/kantor/teks-ar";
import { tokenSah } from "@/lib/kantor/token";
import { jakartaDate } from "@/lib/time/jakarta";
import { IkonCentang, IkonSilang } from "../../ikon";
import { TombolBatal } from "./TombolBatal";

export const dynamic = "force-dynamic";
export const metadata = { title: "إخبار بالغياب", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Desain 1e — kabar tidak hadir sudah tercatat. Tidak ada persetujuan yang ditunggu;
 * langkah tersisa hanyalah mengirim kabarnya ke mas'ul lewat WA (pesan Arab siap kirim).
 */
export default async function StatusIzin({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const petugas = tokenSah(token) ? await getPetugasByToken(token) : null;
  const [izin, kantor] = petugas && UUID.test(id) ? await Promise.all([getIzin(petugas.id, id), getKantor()]) : [null, null];
  if (!petugas || !izin || !kantor) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">{AR.tautanTidakSah}</p>
      </main>
    );
  }

  const status = izin.status as StatusIzin;
  const berlaku = izinAktif(status);
  const wa = berlaku && kantor.masulWa ? tautanWa(kantor.masulWa, pesanIkhbar({ namaArab: petugas.namaArab, ...izin })) : null;
  const bisaBatal = status === "dikabarkan" && izin.sampai >= jakartaDate();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center px-7 text-center">
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-3.5 py-10">
        <div
          className={`flex size-24 items-center justify-center rounded-full ${
            berlaku ? "bg-[#1F4D3A] text-white" : "bg-[#EDE5D4] text-[#5B6A62]"
          }`}
        >
          {berlaku ? <IkonCentang size={44} /> : <IkonSilang />}
        </div>
        <h1 className="[font-family:var(--font-k-judul),serif] text-[30px] font-bold text-[#1F4D3A]">
          {berlaku ? AR_IZIN.tercatat : AR_IZIN.statusIzin[status]}
        </h1>
        <p className="text-base leading-relaxed text-[#5B6A62]">
          {berlaku ? (
            <>
              {izin.alasan === "sakit" ? AR_IZIN.doaSakit : AR_IZIN.doaUmum}
              <br />
              {wa ? AR_IZIN.kirimKeMasul : AR_IZIN.tanpaMasul}
            </>
          ) : (
            status === "dibatalkan" && AR_IZIN.sudahDibatalkan
          )}
        </p>
        <dl className="mt-3.5 w-full rounded-[18px] border border-[#E6DCC7] bg-white px-4.5 py-1.5 text-right text-[15px]">
          <div className="flex justify-between gap-4 border-b border-[#F0E8D8] py-3">
            <dt className="text-[#5B6A62]">{AR_IZIN.tanggal}</dt>
            <dd className="font-semibold">{rentangAr(izin.dari, izin.sampai)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-[#F0E8D8] py-3">
            <dt className="text-[#5B6A62]">{AR_IZIN.sebab}</dt>
            <dd className="font-semibold">{AR_IZIN.alasan[izin.alasan as AlasanIzin] ?? izin.alasan}</dd>
          </div>
          {izin.catatan && (
            <div className="flex justify-between gap-4 border-b border-[#F0E8D8] py-3">
              <dt className="shrink-0 text-[#5B6A62]">{AR_IZIN.catatan}</dt>
              <dd className="text-left break-words">{izin.catatan}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-[#5B6A62]">{AR_IZIN.status}</dt>
            <dd
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                berlaku ? "bg-[#DCE8DF] text-[#1F4D3A]" : "bg-[#EDE5D4] text-[#5B6A62]"
              }`}
            >
              {AR_IZIN.statusIzin[status] ?? status}
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex w-full flex-col gap-2.5 pb-6">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="flex h-[62px] w-full items-center justify-center gap-2.5 rounded-[18px] bg-[#1F7A4A] text-[19px] font-semibold text-white shadow-[0_6px_16px_rgba(31,122,74,.28)]"
          >
            <MessageCircle className="size-6" aria-hidden />
            {AR_IZIN.tombolWa}
          </a>
        )}
        <Link
          href={`/k/${token}`}
          className={
            wa
              ? "flex h-[54px] w-full items-center justify-center rounded-[18px] border-[1.5px] border-[#C9B894] text-lg font-semibold text-[#1F4D3A]"
              : "flex h-[58px] w-full items-center justify-center rounded-[18px] bg-[#1F4D3A] text-lg font-semibold text-white"
          }
        >
          {AR_IZIN.keBeranda}
        </Link>
        {bisaBatal && <TombolBatal token={token} id={izin.id} />}
      </div>
    </main>
  );
}
