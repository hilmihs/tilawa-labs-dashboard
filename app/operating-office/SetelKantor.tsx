"use client";

import { useState } from "react";
import { Crosshair, ExternalLink, MapPin } from "lucide-react";
import { isian, kartu, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import { bacaKoordinat, tautanPendek } from "@/lib/kantor/koordinat";
import { cn } from "@/lib/utils";
import { simpanKantor } from "./actions";

type Pesan = { teks: string; tone: "muted" | "ok" | "danger" };

function peta(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

const label = "flex flex-col gap-1.5 text-12 font-medium text-neutral-700 dark:text-neutral-300";

export function SetelKantor(props: {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  masulNama: string | null;
  masulWa: string | null;
}) {
  const [teks, setTeks] = useState(props.lat != null ? `${props.lat}, ${props.lng}` : "");
  const [radius, setRadius] = useState(String(props.radiusM));
  const [masulNama, setMasulNama] = useState(props.masulNama ?? "");
  const [masulWa, setMasulWa] = useState(props.masulWa ?? "");
  const [pesan, setPesan] = useState<Pesan | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const terbaca = teks.trim() ? bacaKoordinat(teks) : null;

  function pakaiLokasiSaya() {
    setPesan({ teks: "Mengambil lokasi…", tone: "muted" });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setTeks(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
        setPesan({ teks: `Lokasi didapat (akurasi ±${Math.round(p.coords.accuracy)} m). Tekan Simpan.`, tone: "muted" });
      },
      () => setPesan({ teks: "Lokasi tidak bisa diambil — izinkan akses lokasi di browser.", tone: "danger" }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  async function simpan() {
    const k = bacaKoordinat(teks);
    if (!k) {
      return setPesan({
        tone: "danger",
        teks: tautanPendek(teks)
          ? "Tautan pendek (maps.app.goo.gl) tidak memuat koordinat. Buka tautannya di browser, lalu salin alamat panjang dari address bar — atau salin angka koordinat dari Google Maps."
          : "Koordinat tidak terbaca. Contoh: -6.2700, 106.8400",
      });
    }
    setSibuk(true);
    const h = await simpanKantor({ lat: k.lat, lng: k.lng, radiusM: Number(radius), masulNama, masulWa });
    setSibuk(false);
    // Tampilkan titik yang benar-benar tersimpan, bukan tautan mentahnya.
    if (h.ok) setTeks(`${k.lat}, ${k.lng}`);
    setPesan(h.ok ? { teks: `Tersimpan: ${k.lat}, ${k.lng}.`, tone: "ok" } : { teks: h.error, tone: "danger" });
  }

  return (
    <div className={cn(kartu, "overflow-hidden")}>
      {/* Hiasan, bukan peta sungguhan: titik tersimpan dibuka di Google Maps. */}
      <div
        className="relative flex h-[150px] items-center justify-center bg-[repeating-linear-gradient(45deg,#f1efe6_0_10px,#e9e5d8_10px_20px)] dark:bg-[repeating-linear-gradient(45deg,#1b2220_0_10px,#222a27_10px_20px)]"
        aria-hidden={props.lat == null}
      >
        <span
          className={cn(
            "flex size-[120px] items-center justify-center rounded-full border-[1.5px] border-dashed",
            props.lat != null ? "border-emerald-500 bg-emerald-500/10" : "border-neutral-400 bg-neutral-400/10",
          )}
        >
          <MapPin className={cn("size-[26px]", props.lat != null ? "text-emerald-700 dark:text-emerald-300" : "text-ink-faint")} />
        </span>
        <span className="absolute bottom-2 left-2.5 font-mono text-11 text-ink-muted">
          {props.lat != null ? `radius ${props.radiusM} m` : "titik belum disetel"}
        </span>
        {props.lat != null && (
          <a
            className="absolute right-2.5 bottom-2 inline-flex items-center gap-1 rounded-md bg-card/90 px-2 py-1 text-11 font-medium text-primary shadow-sm hover:underline"
            target="_blank"
            rel="noreferrer"
            href={peta(props.lat, props.lng!)}
          >
            Buka di Google Maps <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className={label}>
          <label htmlFor="titik">Koordinat</label>
          <div className="flex gap-2">
            <input
              id="titik"
              value={teks}
              onChange={(e) => {
                setTeks(e.target.value);
                setPesan(null);
              }}
              placeholder="-6.2700, 106.8400 atau tautan Google Maps"
              className={cn(isian, "h-[38px] min-w-0 flex-1 font-mono text-12")}
            />
            <button type="button" onClick={pakaiLokasiSaya} className={cn(tombolGaris, "h-[38px] rounded-[10px]")}>
              <Crosshair className="size-3.5" /> Lokasi saya
            </button>
          </div>
          <span className="text-11 font-normal text-ink-muted">
            {terbaca && !pesan ? (
              <>
                Terbaca: {terbaca.lat}, {terbaca.lng} ·{" "}
                <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={peta(terbaca.lat, terbaca.lng)}>
                  cek di peta
                </a>
              </>
            ) : (
              "Angka koordinat atau tautan Google Maps versi panjang."
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <div className={label}>
            <label htmlFor="radius">Radius</label>
            <div className="flex h-[38px] w-[110px] items-center gap-1 rounded-[10px] border border-border-strong/70 bg-card px-3 focus-within:border-brand-bronze focus-within:ring-[3px] focus-within:ring-brand-gold/30">
              <input
                id="radius"
                inputMode="numeric"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-10 min-w-0 bg-transparent text-14 tabular-nums outline-none"
              />
              <span className="text-12 font-normal text-ink-muted">meter</span>
            </div>
          </div>
          <span className="max-w-[16rem] pb-2 text-11 text-ink-muted">Jadwal masuk diatur per syaikh di daftar sebelah.</span>
        </div>

        <fieldset className="flex flex-col gap-2.5 border-t border-border pt-3">
          <legend className="float-left mb-1 w-full text-12 font-semibold text-neutral-700 dark:text-neutral-300">
            Mas&apos;ul — penerima kabar tidak hadir
          </legend>
          <p className="clear-both text-11 text-ink-muted">
            Syaikh yang berhalangan mengirim kabar (ikhbar) ke nomor ini lewat WA, pesan berbahasa Arab. Tanpa persetujuan — cukup
            tercatat.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className={label}>
              <label htmlFor="masul-nama">Nama</label>
              <input
                id="masul-nama"
                value={masulNama}
                onChange={(e) => setMasulNama(e.target.value)}
                placeholder="mis. Amina Anisa Hidayat"
                className={cn(isian, "h-[38px]")}
              />
            </div>
            <div className={label}>
              <label htmlFor="masul-wa">Nomor WA</label>
              <input
                id="masul-wa"
                inputMode="tel"
                value={masulWa}
                onChange={(e) => setMasulWa(e.target.value)}
                placeholder="+62 858 …"
                className={cn(isian, "h-[38px] tabular-nums")}
              />
            </div>
          </div>
        </fieldset>

        <button type="button" onClick={simpan} disabled={sibuk} className={cn(tombolUtama, "h-[38px] self-end rounded-[10px] text-12")}>
          {sibuk ? "Menyimpan…" : "Simpan"}
        </button>

        {pesan && (
          <p
            className={cn(
              "text-sm",
              pesan.tone === "ok" && "text-ok",
              pesan.tone === "danger" && "text-danger",
              pesan.tone === "muted" && "text-ink-muted",
            )}
          >
            {pesan.teks}
          </p>
        )}
      </div>
    </div>
  );
}
