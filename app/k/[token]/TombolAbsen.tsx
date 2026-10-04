"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AR, AR_IZIN, jamAr } from "@/lib/kantor/teks-ar";
import type { JenisAbsen } from "@/lib/kantor/aturan";
import { JAKARTA_OFFSET_MS } from "@/lib/time/jakarta";
import { absen } from "./actions";
import { IkonCentang } from "./ikon";

type Pesan = { teks: string; bantuan?: boolean };
type Berhasil = { jenis: JenisAbsen; jam: string; terlambat: boolean };

function jamSekarang(): string {
  return new Date(Date.now() + JAKARTA_OFFSET_MS).toISOString().slice(11, 16);
}

/**
 * Tombol bulat beranda (desain 2a) + layar konfirmasi (1f). `jenis` null =
 * masuk dan keluar hari ini sudah tercatat. Jam yang tampil = jam WIB; yang
 * dicatat tetap jam server.
 */
export function TombolAbsen({ token, jenis, jamAwal }: { token: string; jenis: JenisAbsen | null; jamAwal: string }) {
  const router = useRouter();
  const [jam, setJam] = useState(jamAwal);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<Pesan | null>(null);
  const [berhasil, setBerhasil] = useState<Berhasil | null>(null);

  useEffect(() => {
    const t = setInterval(() => setJam(jamSekarang()), 10_000);
    return () => clearInterval(t);
  }, []);

  function tekan() {
    if (!jenis) return;
    setPesan(null);
    if (!("geolocation" in navigator)) {
      setPesan({ teks: AR.lokasiGagal });
      return;
    }
    setSibuk(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const h = await absen(token, jenis, {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            akurasi: p.coords.accuracy,
          });
          if (h.ok) setBerhasil({ jenis: h.jenis, jam: h.jam, terlambat: h.terlambat });
          else setPesan({ teks: h.alasan === "tautan-tidak-sah" ? AR.tautanTidakSah : AR.tolak(h.alasan, h.jarakM) });
        } catch {
          setPesan({ teks: AR.lokasiGagal });
        } finally {
          setSibuk(false);
        }
      },
      (err) => {
        setSibuk(false);
        setPesan(err.code === err.PERMISSION_DENIED ? { teks: AR.izinDitolak, bantuan: true } : { teks: AR.lokasiGagal });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  if (berhasil) {
    return (
      <Konfirmasi
        b={berhasil}
        tutup={() => {
          setBerhasil(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <>
      <div className="flex size-[236px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[#E9CE95]/50">
        {jenis ? (
          <button
            type="button"
            onClick={tekan}
            disabled={sibuk}
            className="flex size-[200px] flex-col items-center justify-center gap-0.5 rounded-full bg-[#F7F2E8] text-[#1F4D3A] shadow-[0_18px_40px_rgba(0,0,0,.28),inset_0_-6px_0_#E6DCC7] transition-transform active:scale-[.97] disabled:opacity-80"
          >
            {sibuk ? (
              <span className="px-6 text-lg font-bold">{AR.memintaLokasi}</span>
            ) : (
              <>
                <span className="text-[13px] font-semibold text-[#7A4A1E]">{AR_IZIN.tekanUntukMencatat}</span>
                <span className="text-5xl leading-tight font-bold tabular-nums">{jamAr(jam)}</span>
                <span className="text-[19px] font-bold">{jenis === "masuk" ? AR.tombolMasuk : AR.tombolKeluar}</span>
              </>
            )}
          </button>
        ) : (
          <div className="flex size-[200px] flex-col items-center justify-center gap-2 rounded-full bg-[#F7F2E8]/10 text-[#F7F2E8]">
            <span className="flex size-14 items-center justify-center rounded-full bg-[#F7F2E8] text-[#1F4D3A]">
              <IkonCentang size={30} tebal={2.6} />
            </span>
            <span className="px-4 text-center text-lg font-bold">{AR_IZIN.sudahPulangHariIni}</span>
          </div>
        )}
      </div>
      {pesan && (
        <div role="status" className="mx-6 rounded-2xl bg-[#F7F2E8] p-4 text-base leading-relaxed text-red-800">
          <p>{pesan.teks}</p>
          {pesan.bantuan && (
            <ul className="mt-2 list-disc space-y-1 pr-5 text-sm text-[#5B6A62]">
              <li>{AR.caraAndroid}</li>
              <li>{AR.caraIphone}</li>
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function Konfirmasi({ b, tutup }: { b: Berhasil; tutup: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[#F7F2E8] text-[#1C2A23]" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-md flex-col items-center px-7 text-center">
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5">
          <div className="flex size-28 items-center justify-center rounded-full bg-[#1F4D3A] text-white shadow-[0_0_0_12px_#DCE8DF]">
            <IkonCentang size={54} tebal={2.6} />
          </div>
          <p className="mt-3 [font-family:var(--font-k-judul),serif] text-[32px] font-bold text-[#1F4D3A]">
            {AR_IZIN.terimaKasih}
          </p>
          <p className="text-[17px] leading-relaxed text-[#5B6A62]">
            {b.jenis === "masuk" ? AR_IZIN.tercatatHadir : AR_IZIN.tercatatPulang}
          </p>
          <div className="mt-2.5 flex gap-2.5">
            <Kotak label={AR_IZIN.waktu} isi={jamAr(b.jam, true)} />
            {b.jenis === "masuk" && (
              <Kotak label={AR_IZIN.status} isi={b.terlambat ? AR_IZIN.terlambat : AR_IZIN.tepatWaktu} redup={b.terlambat} />
            )}
          </div>
        </div>
        <div className="w-full pb-6">
          <button
            type="button"
            onClick={tutup}
            autoFocus
            className="h-[58px] w-full rounded-[18px] border-[1.5px] border-[#C9B894] text-lg font-semibold text-[#1F4D3A]"
          >
            {AR_IZIN.selesai}
          </button>
        </div>
      </div>
    </div>
  );
}

function Kotak({ label, isi, redup }: { label: string; isi: string; redup?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#E6DCC7] bg-white px-5 py-3">
      <div className="text-[13px] text-[#5B6A62]">{label}</div>
      <div className={`text-2xl font-bold ${redup ? "text-[#7A4A1E]" : "text-[#1F4D3A]"}`}>{isi}</div>
    </div>
  );
}
