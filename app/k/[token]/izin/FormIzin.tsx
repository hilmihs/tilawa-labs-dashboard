"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ALASAN_IZIN, CATATAN_MAKS, type AlasanIzin } from "@/lib/kantor/izin";
import { AR, AR_IZIN } from "@/lib/kantor/teks-ar";
import { ajukanIzin } from "./actions";

type Kapan = "hari-ini" | "besok" | "beberapa";

const pilihDasar = "rounded-2xl border-[1.5px] font-[inherit] transition-colors";
const pilihAktif = "border-2 border-[#1F4D3A] bg-[#E3EDE6] font-semibold text-[#1F4D3A]";
const pilihPasif = "border-[#E0D4BB] bg-white text-[#1C2A23]";

/** Desain 1d — kabar tidak hadir: pilih kapan dan alasan dengan satu ketukan, catatan opsional. */
export function FormIzin({ token, hariIni, besok }: { token: string; hariIni: string; besok: string }) {
  const router = useRouter();
  const [kapan, setKapan] = useState<Kapan>("hari-ini");
  const [dari, setDari] = useState(hariIni);
  const [sampai, setSampai] = useState(besok);
  const [alasan, setAlasan] = useState<AlasanIzin | null>(null);
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const rentang =
    kapan === "hari-ini" ? { dari: hariIni, sampai: hariIni } : kapan === "besok" ? { dari: besok, sampai: besok } : { dari, sampai };

  async function kirim() {
    if (!alasan) return setGalat(AR_IZIN.tolak["alasan-tidak-sah"]);
    setGalat(null);
    setSibuk(true);
    try {
      const h = await ajukanIzin(token, { ...rentang, alasan, catatan });
      if (h.ok) router.push(`/k/${token}/izin/${h.id}`);
      else setGalat(h.alasan === "tautan-tidak-sah" ? AR.tautanTidakSah : AR_IZIN.tolak[h.alasan]);
    } catch {
      setGalat(AR_IZIN.gagalKirim);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center gap-3 px-5 pt-5">
        <Link
          href={`/k/${token}`}
          aria-label={AR_IZIN.kembali}
          className="flex size-11 items-center justify-center rounded-xl border border-[#E0D4BB] bg-white text-xl"
        >
          →
        </Link>
        <h1 className="text-[19px] font-bold">{AR_IZIN.mintaIzin}</h1>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-5 pt-6 pb-6">
        <fieldset>
          <legend className="mb-2.5 text-[15px] font-semibold">{AR_IZIN.kapan}</legend>
          <div className="flex gap-2">
            {(
              [
                ["hari-ini", AR_IZIN.hariIni],
                ["besok", AR_IZIN.besok],
                ["beberapa", AR_IZIN.beberapaHari],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={kapan === k}
                onClick={() => setKapan(k)}
                className={`h-[52px] flex-1 text-base ${pilihDasar} ${kapan === k ? pilihAktif : pilihPasif}`}
              >
                {label}
              </button>
            ))}
          </div>
          {kapan === "beberapa" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm text-[#5B6A62]">
                {AR_IZIN.dari}
                <input
                  type="date"
                  min={hariIni}
                  value={dari}
                  onChange={(e) => {
                    setDari(e.target.value);
                    if (e.target.value > sampai) setSampai(e.target.value);
                  }}
                  className="h-12 rounded-xl border-[1.5px] border-[#E0D4BB] bg-white px-3 text-base text-[#1C2A23]"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-[#5B6A62]">
                {AR_IZIN.sampai}
                <input
                  type="date"
                  min={dari}
                  value={sampai}
                  onChange={(e) => setSampai(e.target.value)}
                  className="h-12 rounded-xl border-[1.5px] border-[#E0D4BB] bg-white px-3 text-base text-[#1C2A23]"
                />
              </label>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 text-[15px] font-semibold">{AR_IZIN.sebab}</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {ALASAN_IZIN.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={alasan === a}
                onClick={() => {
                  setAlasan(a);
                  setGalat(null);
                }}
                className={`flex h-16 items-center justify-between px-4 text-right text-[17px] ${pilihDasar} ${alasan === a ? pilihAktif : pilihPasif}`}
              >
                {AR_IZIN.alasan[a]}
                {alasan === a && (
                  <span className="flex size-[22px] items-center justify-center rounded-full bg-[#1F4D3A] text-[13px] text-white">✓</span>
                )}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-2.5 block text-[15px] font-semibold">
            {AR_IZIN.catatan} <span className="font-normal text-[#5B6A62]">{AR_IZIN.opsional}</span>
          </span>
          <textarea
            value={catatan}
            maxLength={CATATAN_MAKS}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder={AR_IZIN.catatanContoh}
            rows={3}
            className="w-full rounded-2xl border-[1.5px] border-[#E0D4BB] bg-white p-3.5 text-base leading-relaxed text-[#1C2A23] placeholder:text-[#A89E88]"
          />
        </label>

        <p className="flex gap-2 text-sm leading-relaxed text-[#5B6A62]">
          <span className="text-[#B8893B]">●</span>
          {AR_IZIN.keMasul}
        </p>
        {galat && (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-base text-red-900">
            {galat}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-[#E6DCC7] bg-[#F7F2E8] px-5 pt-4 pb-6">
        <button
          type="button"
          onClick={kirim}
          disabled={sibuk}
          className="h-[62px] w-full rounded-[18px] bg-[#7A4A1E] text-[19px] font-semibold text-white shadow-[0_6px_16px_rgba(122,74,30,.28)] disabled:opacity-70"
        >
          {sibuk ? AR_IZIN.mengirim : AR_IZIN.kirim}
        </button>
      </div>
    </main>
  );
}
