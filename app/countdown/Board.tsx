"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { bagiHalaman, computeBoard, jamWib, type PaksaState } from "@/lib/countdown/board";
import { BOARD_TITLE, MOMEN, TICKER_SOURCE, TICKER_TEXT } from "./momen";

/**
 * Papan countdown, digambar pada kanvas tetap 3840×2160 lalu diskalakan ke
 * layar apa pun. Kanvas tetap itu yang membuat 720p dan 4K menampilkan komposisi
 * yang persis sama — bukan layout responsif yang menyusun ulang dirinya dan
 * membuat angka 440 px kehilangan maksudnya di layar kecil.
 */

const MUTED = "#8FA5A0";
const CANVAS_W = 3840;
const CANVAS_H = 2160;
const PAD = 96;
const GAP = 48;
/** Lebar kartu saat barisnya penuh enam — juga ukuran rancangan tipografinya. */
const CARD_W = 568;
const MENIT_MS = 60_000;
const DETIK_MS = 1_000;
const CURSOR_HIDE_MS = 3_000;
/**
 * Lama satu halaman kartu tampil. Cukup untuk membaca lima kartu dari seberang
 * ruangan, cukup pendek supaya halaman kedua tidak terasa hilang.
 */
const ROTASI_MS = 15_000;

/**
 * Jam dinding sebagai external store, bukan state yang di-set dari efek.
 *
 * Snapshot-nya adalah nomor menit, bukan milidetik: papan hanya menampilkan
 * sampai satuan menit, jadi nilainya berubah tepat 60 kali sejam dan React
 * hanya me-render sebanyak itu — meski store-nya diperiksa tiap detik supaya
 * pergantian menitnya tidak telat sampai satu menit penuh.
 *
 * Snapshot server sengaja null: server tidak boleh merender angka menit, karena
 * jamnya bukan jam TV dan hasilnya akan beda saat hydration.
 */
function subscribeMinute(onChange: () => void) {
  const timer = setInterval(onChange, 1_000);
  return () => clearInterval(timer);
}
function subscribeNever() {
  return () => {};
}
function getMinuteSnapshot(): number | null {
  return Math.floor(Date.now() / MENIT_MS);
}
function getServerSnapshot(): number | null {
  return null;
}

/**
 * Store kedua, sedetik sekali, khusus jam dinding. Dipisah dari store menit
 * dengan sengaja: hanya jam yang berhak menyala sekencang ini, sementara
 * perhitungan papan — kartu, hero, sisa hari — tetap berganti per menit.
 *
 * Diperiksa empat kali per detik, dengan alasan yang sama seperti store menit:
 * yang dipakai React nomor detiknya, jadi render tetap 60× semenit sementara
 * pergantian angkanya tidak pernah telat lebih dari seperempat detik.
 */
function subscribeSecond(onChange: () => void) {
  const timer = setInterval(onChange, 250);
  return () => clearInterval(timer);
}
function getSecondSnapshot(): number | null {
  return Math.floor(Date.now() / DETIK_MS);
}

/**
 * Store ketiga: nomor slot rotasi kartu. Diturunkan dari jam dinding, bukan
 * dari state yang di-increment — dua TV yang membuka papan yang sama berganti
 * halaman bersamaan, dan render ulang lain tidak pernah menggeser halamannya.
 */
function subscribeRotasi(onChange: () => void) {
  const timer = setInterval(onChange, 500);
  return () => clearInterval(timer);
}
function getRotasiSnapshot(): number | null {
  return Math.floor(Date.now() / ROTASI_MS);
}

/**
 * Jam WIB berjalan di header. Komponen sendiri supaya tick per detiknya hanya
 * me-render tiga baris ini, bukan seluruh kanvas 3840×2160.
 *
 * `frozenAt` bukan sekadar tanda jeda: sama seperti papannya, jam ikut membeku
 * pada instant tombol ditekan — kalau tidak, JEDA akan menampilkan papan menit
 * lalu dengan jam yang masih berlari.
 */
function LiveClock({ frozenAt }: { frozenAt: number | null }) {
  const second = useSyncExternalStore<number | null>(
    frozenAt !== null ? subscribeNever : subscribeSecond,
    getSecondSnapshot,
    getServerSnapshot,
  );
  const at = frozenAt ?? (second === null ? null : second * DETIK_MS);
  if (at === null) return null;
  const { jam, detik } = jamWib(at);
  return (
    <div style={{ textAlign: "right" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "flex-end",
          gap: 10,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ fontSize: 88 }}>{jam}</span>
        <span style={{ fontSize: 44, fontWeight: 500, color: MUTED }}>{detik}</span>
      </div>
      <div style={{ fontSize: 44, fontWeight: 400, color: MUTED, marginTop: 10 }}>WIB</div>
    </div>
  );
}

export function Board({ paksa = "auto" }: { paksa?: PaksaState }) {
  // null sampai papan hidup di browser: skala harus diukur dari window, dan
  // jamnya harus jam TV. Sampai keduanya ada, papan tidak menggambar apa pun.
  const [scale, setScale] = useState<number | null>(null);
  // Bukan boolean: saat dijeda, papan dibekukan pada instant tepat saat tombol
  // ditekan. Kalau hanya menghentikan tick-nya, render lain (kursor muncul,
  // layar diubah ukuran) akan membaca jam terbaru dan angkanya melompat diam-diam.
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const [pointerVisible, setPointerVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const paused = frozenAt !== null;
  const minute = useSyncExternalStore<number | null>(
    paused ? subscribeNever : subscribeMinute,
    getMinuteSnapshot,
    getServerSnapshot,
  );
  const now = frozenAt ?? (minute === null ? null : minute * MENIT_MS);
  // JEDA ikut membekukan halaman kartu, dengan alasan yang sama seperti jamnya.
  const slotRotasi = useSyncExternalStore<number | null>(
    paused ? subscribeNever : subscribeRotasi,
    getRotasiSnapshot,
    getServerSnapshot,
  );
  const putaran = frozenAt !== null ? Math.floor(frozenAt / ROTASI_MS) : (slotRotasi ?? 0);

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Kursor disembunyikan sampai ada yang menggerakkan mouse — papan ini hidup
  // di TV tanpa operator, dan panah putih diam di tengah layar terlihat rusak.
  const wake = () => {
    setPointerVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPointerVisible(false), CURSOR_HIDE_MS);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  // Spasi / P membekukan penyegaran, untuk memotret atau memeriksa angka.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== "p") return;
      e.preventDefault();
      setFrozenAt((f) => (f === null ? Date.now() : null));
      wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const view = useMemo(
    () => (now === null ? null : computeBoard(now, MOMEN, paksa)),
    [now, paksa],
  );

  // Render server dan render pertama klien: latar kosong. Itu pula yang terlihat
  // sepersekian detik sebelum skala terukur, jadi tidak ada kedipan tambahan.
  if (!view) return <div style={{ position: "fixed", inset: 0, background: "#0A0F0E" }} />;
  const { headerMasehi, headerHijri, hero } = view;
  const halaman = bagiHalaman(view.cards, putaran);
  const cards = halaman.isi;

  // Baris kartu selalu memenuhi lebar kanvas: lebih banyak momen berarti kartu
  // yang lebih sempit, bukan kartu yang tumpah keluar layar. Di atas enam momen
  // kartunya menyempit, di bawah enam ia berhenti di lebar rancangan (568) dan
  // barisnya rata kiri — kartu selebar 800 px akan tampak seperti panel lain.
  // Lebarnya dihitung dari kartu per halaman, bukan isi halaman ini, supaya
  // halaman terakhir yang satu kartu lebih pendek tidak tiba-tiba melebar.
  const gridW = CANVAS_W - PAD * 2;
  const perBaris = Math.max(1, halaman.per);
  const cardW = Math.min(CARD_W, Math.floor((gridW - GAP * (perBaris - 1)) / perBaris));
  // Tipografi ikut menyusut sepadan lebarnya. Yang diskalakan hanya ukuran huruf
  // dan padding samping; tinggi tiap slot tetap, supaya deretan angka di semua
  // kartu tetap sejajar persis seperti pada rancangan enam kartu.
  const k = cardW / CARD_W;
  const s = (v: number) => Math.round(v * k);

  return (
    <div
      onMouseMove={wake}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0A0F0E",
        overflow: "hidden",
        display: "grid",
        placeContent: "center",
        cursor: pointerVisible ? "default" : "none",
      }}
    >
      <div
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          flex: "none",
          transform: `scale(${scale ?? 1})`,
          transformOrigin: "center",
          opacity: scale === null ? 0 : 1,
          background: "#0A0F0E",
          position: "relative",
          padding: PAD,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          color: "#F3F7F5",
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 180,
            flex: "none",
            background: "#1B2724",
            borderRadius: 32,
            padding: "0 56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
            {BOARD_TITLE}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
            {paused && (
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  color: "#8FA5A0",
                  border: "2px solid #25332F",
                  borderRadius: 999,
                  padding: "12px 28px",
                }}
              >
                JEDA
              </div>
            )}
            <LiveClock frozenAt={frozenAt} />
            {/* Pemisah tipis: jam dan tanggal sama-sama angka besar, tanpa garis
                keduanya terbaca sebagai satu blok. */}
            <div style={{ width: 2, height: 108, background: "#25332F", flex: "none" }} />
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 88,
                  fontWeight: 600,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {headerMasehi}
              </div>
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 400,
                  color: "#8FA5A0",
                  marginTop: 10,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {headerHijri}
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 48, flex: "none" }} />

        {/* Hero */}
        <div
          style={{
            height: 960,
            flex: "none",
            background: "#182320",
            border: "2px solid #2C3B36",
            borderRadius: 32,
            position: "relative",
            overflow: "hidden",
            display: "flex",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: `radial-gradient(circle at 96% 106%, ${hero.glow}, rgba(0,0,0,0) 58%)`,
            }}
          />
          <svg
            viewBox="0 0 400 400"
            style={{
              position: "absolute",
              right: -90,
              bottom: -150,
              width: 1080,
              height: 1080,
              opacity: 0.06,
              pointerEvents: "none",
            }}
            fill="none"
            strokeWidth="2.4"
            stroke={hero.accent}
          >
            <defs>
              <pattern id="araLive" width="100" height="100" patternUnits="userSpaceOnUse">
                <circle cx="50" cy="50" r="50" />
                <circle cx="0" cy="0" r="50" />
                <circle cx="100" cy="0" r="50" />
                <circle cx="0" cy="100" r="50" />
                <circle cx="100" cy="100" r="50" />
              </pattern>
            </defs>
            <rect width="400" height="400" fill="url(#araLive)" />
          </svg>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              paddingLeft: 96,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 40,
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 999,
                  border: "4px solid",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 48,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  flex: "none",
                  boxSizing: "border-box",
                  color: hero.accent,
                  borderColor: hero.accent,
                }}
              >
                01
              </div>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: hero.accent,
                }}
              >
                {hero.category}
              </div>
              {hero.pill && (
                <div
                  style={{
                    fontSize: 44,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    color: "#0A0F0E",
                    borderRadius: 999,
                    padding: "14px 36px",
                    background: hero.accent,
                    whiteSpace: "nowrap",
                  }}
                >
                  {hero.pill}
                </div>
              )}
            </div>
            <div style={{ fontSize: 112, fontWeight: 600, lineHeight: 1.06, letterSpacing: "-0.02em" }}>
              {hero.title}
            </div>
            <div
              style={{
                fontSize: 56,
                fontWeight: 400,
                color: "#8FA5A0",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {hero.dateLine}
            </div>
            {hero.lokasi && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  fontSize: 56,
                  fontWeight: 500,
                  color: "#C9D6D2",
                  marginTop: -16,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={52}
                  height={52}
                  fill="none"
                  stroke={hero.accent}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flex: "none" }}
                  aria-hidden
                >
                  <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
                {hero.lokasi}
              </div>
            )}
          </div>

          {hero.mode === "berlangsung" && (
            <div
              style={{
                width: 1376,
                flex: "none",
                paddingRight: 96,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: 44,
                position: "relative",
              }}
            >
              {hero.sampai ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 32 }}>
                  <span style={{ fontSize: 88, fontWeight: 600, letterSpacing: "0.08em", color: "#8FA5A0" }}>
                    SAMPAI
                  </span>
                  <span
                    style={{
                      fontSize: 280,
                      fontWeight: 700,
                      lineHeight: 0.9,
                      letterSpacing: "-0.03em",
                      fontVariantNumeric: "tabular-nums",
                      color: hero.accent,
                    }}
                  >
                    {hero.sampai}
                  </span>
                </div>
              ) : (
              <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
                <span style={{ fontSize: 88, fontWeight: 600, letterSpacing: "0.08em", color: "#8FA5A0" }}>
                  HARI KE-
                </span>
                <span
                  style={{
                    fontSize: 280,
                    fontWeight: 700,
                    lineHeight: 0.9,
                    letterSpacing: "-0.03em",
                    fontVariantNumeric: "tabular-nums",
                    color: hero.accent,
                  }}
                >
                  {hero.dayIndex}
                </span>
                <span
                  style={{
                    fontSize: 120,
                    fontWeight: 600,
                    color: "#8FA5A0",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  / {hero.total}
                </span>
              </div>
              )}
              <div
                style={{
                  width: 1280,
                  height: 24,
                  background: "#25332F",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 999,
                    width: `${hero.pct}%`,
                    background: hero.accent,
                  }}
                />
              </div>
              <div style={{ fontSize: 44, fontWeight: 400, color: "#8FA5A0" }}>{hero.endLine}</div>
            </div>
          )}

          {hero.mode === "counting" && (
            <div
              style={{
                width: 1376,
                flex: "none",
                paddingRight: 96,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: 440,
                  fontWeight: 700,
                  lineHeight: 0.9,
                  letterSpacing: "-0.03em",
                  fontVariantNumeric: "tabular-nums",
                  color: hero.numColor,
                }}
              >
                {hero.days}
              </div>
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  marginTop: 14,
                  color: hero.unitColor,
                }}
              >
                HARI
              </div>
              {/* Hanya muncul untuk momen yang punya jam keberangkatan. Diredam
                  ke warna muted supaya angka 440 px tetap jadi satu-satunya
                  hal yang terbaca dari seberang ruangan. */}
              {hero.jamMenit && (
                <div
                  style={{
                    fontSize: 72,
                    fontWeight: 500,
                    marginTop: 18,
                    color: MUTED,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hero.jamMenit}
                </div>
              )}
            </div>
          )}

          {hero.mode === "hari-ini" && (
            <div
              style={{
                width: 1376,
                flex: "none",
                paddingRight: 96,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: 240,
                  fontWeight: 700,
                  lineHeight: 0.9,
                  letterSpacing: "-0.02em",
                  color: hero.accent,
                }}
              >
                HARI INI
              </div>
            </div>
          )}
        </div>

        <div style={{ height: 48, flex: "none" }} />

        {/* Baris kartu — jumlahnya ikut daftar momen, lebarnya menyesuaikan */}
        {/* key = halaman: tiap rotasi me-mount ulang baris supaya fade-nya jalan. */}
        <div
          key={halaman.jumlah > 1 ? `hal-${halaman.indeks}` : "hal"}
          style={{
            height: 560,
            flex: "none",
            display: "flex",
            gap: GAP,
            animation: halaman.jumlah > 1 ? "countdownFade 600ms ease-out" : undefined,
          }}
        >
          {cards.map((card) => (
            <div
              key={card.key}
              style={{
                width: cardW,
                height: 560,
                background: "#131C1A",
                border: "2px solid #25332F",
                borderRadius: 32,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                flex: "none",
                boxSizing: "border-box",
                opacity: card.opacity,
              }}
            >
              <div style={{ height: 8, flex: "none", background: card.accent }} />
              <div
                style={{
                  flex: 1,
                  padding: `36px ${s(40)}px`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                  minHeight: 0,
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    boxSizing: "border-box",
                    border: "4px solid",
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: s(40),
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    flex: "none",
                    color: card.accent,
                    borderColor: card.accent,
                  }}
                >
                  {card.no}
                </div>
                {/* Slot tinggi tetap: dua baris judul selalu memakan ruang yang
                    sama, supaya deretan angka di bawahnya sejajar rapi. */}
                <div
                  style={{
                    height: 118,
                    flex: "none",
                    fontSize: s(56),
                    fontWeight: 600,
                    lineHeight: 1.04,
                    letterSpacing: "-0.01em",
                    overflowWrap: "anywhere",
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2,
                    overflow: "hidden",
                  }}
                >
                  {card.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: s(20),
                    height: 142,
                    flex: "none",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontSize: s(176),
                      fontWeight: 700,
                      lineHeight: 0.8,
                      letterSpacing: "-0.03em",
                      fontVariantNumeric: "tabular-nums",
                      color: card.numColor,
                    }}
                  >
                    {card.days}
                  </span>
                  <span
                    style={{
                      fontSize: s(40),
                      fontWeight: 600,
                      lineHeight: 1,
                      letterSpacing: "0.12em",
                      color: "#8FA5A0",
                    }}
                  >
                    HARI
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    height: 88,
                    flex: "none",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <div
                    style={{ fontSize: s(38), lineHeight: 1.12, whiteSpace: "nowrap", color: "#8FA5A0" }}
                  >
                    {card.masehi}
                  </div>
                  <div
                    style={{ fontSize: s(38), lineHeight: 1.12, whiteSpace: "nowrap", color: "#8FA5A0" }}
                  >
                    {card.hijri}
                    <span style={{ color: "#5F736F" }}>{card.hisab}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 48, flex: "none" }} />

        {/* Ticker */}
        <div
          style={{
            height: 124,
            flex: "none",
            background: "#1B2724",
            borderRadius: 32,
            padding: "0 56px",
            display: "flex",
            alignItems: "center",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            {/* Teksnya digandakan supaya animasi -50% menyambung tanpa jeda. */}
            <div
              style={{
                display: "flex",
                width: "max-content",
                animation: "countdownTicker 60s linear infinite",
              }}
            >
              <span style={{ fontSize: 36, color: "#8FA5A0", whiteSpace: "nowrap", paddingRight: 120 }}>
                {TICKER_TEXT}
              </span>
              <span style={{ fontSize: 36, color: "#8FA5A0", whiteSpace: "nowrap", paddingRight: 120 }}>
                {TICKER_TEXT}
              </span>
            </div>
          </div>
          {/* Penanda halaman kartu — hanya saat ada yang dirotasi. */}
          {halaman.jumlah > 1 && (
            <div
              style={{
                flex: "none",
                marginLeft: 64,
                paddingLeft: 64,
                borderLeft: "2px solid #25332F",
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              {Array.from({ length: halaman.jumlah }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === halaman.indeks ? 56 : 20,
                    height: 20,
                    borderRadius: 999,
                    background: i === halaman.indeks ? "#8FA5A0" : "#25332F",
                    transition: "width 400ms ease, background 400ms ease",
                  }}
                />
              ))}
            </div>
          )}
          <div
            style={{
              flex: "none",
              marginLeft: 64,
              paddingLeft: 64,
              borderLeft: "2px solid #25332F",
              fontSize: 36,
              color: "#5F736F",
              whiteSpace: "nowrap",
            }}
          >
            {TICKER_SOURCE}
          </div>
        </div>
      </div>
    </div>
  );
}
