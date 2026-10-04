"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { ekstrakKode } from "@/lib/hadir/kode";
import { dalamJendela, jamWibDari, labelKonfirmasi, terlambat, type RosterEntri, type StatusScan } from "@/lib/hadir/view-model";
import { FormTambahOrang, type AksiTambahOrang } from "../hadir/FormTambahOrang";

export type SumberScan = {
  /** Awalan kunci localStorage: slug acara, atau 'lepas'. */
  kunciLokal: string;
  urlRoster: string;
  urlScan: string;
  /** Tautan "← Panel". */
  urlPanel: string;
  /** redirectTo saat sesi login habis. */
  urlKembali: string;
};

type Roster = {
  // null = mode lepas: tanpa jendela scan, tanpa hitungan terlambat, tanpa target.
  acara: { slug: string; nama: string; tanggal: string; jamMulai: string | null; toleransiMenit: number; scanBukaAt: string | null; scanTutupAt: string | null } | null;
  diambilAt: string;
  orang: RosterEntri[];
};
type Antrean = { klienId: string; orangId: string | null; kode: string | null; waktu: string; metode: "qr" | "cari_nama"; perangkatId: string };
type Hasil =
  | { jenis: "baru"; o: RosterEntri; waktu: string; telat: boolean }
  | { jenis: "sudah"; o: RosterEntri; waktu: string }
  | { jenis: "tak_dikenal"; kode: string | null; klienId?: string }
  | { jenis: "jendela"; waktu: string }
  | { jenis: "server_baru"; nama: string; waktu: string; kode?: string }
  | { jenis: "server_sudah"; nama: string };

const kunci = (slug: string, k: string) => `hadir:${slug}:${k}`;
function baca<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function tulis(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penuh/privat: abaikan */ } }
function idAcak(): string { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

/** BarcodeDetector bawaan (Chrome/Android) kalau ada; kalau tidak, jsQR dari canvas. */
type Detector = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
function buatDetector(): Detector | null {
  const w = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
  try { return w.BarcodeDetector ? new w.BarcodeDetector({ formats: ["qr_code"] }) : null; } catch { return null; }
}

function bunyi(jenis: "ok" | "ulang" | "gagal") {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = jenis === "ok" ? 880 : jenis === "ulang" ? 520 : 220;
    g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + (jenis === "gagal" ? 0.35 : 0.15));
  } catch { /* tanpa audio */ }
  try { navigator.vibrate?.(jenis === "ok" ? 80 : jenis === "ulang" ? [60, 60, 60] : 300); } catch { /* */ }
}

export function Scanner({ sumber, namaAcara, kiosk, qrDaftarSvg, urlDaftar, aksiTambah, kegiatanHariIni = [] }: {
  sumber: SumberScan; namaAcara: string; kiosk: boolean; qrDaftarSvg: string | null; urlDaftar: string; aksiTambah: AksiTambahOrang;
  /** Mode lepas saja: kegiatan bertanggal hari ini — scan di sini tidak masuk ke sana sampai ditautkan. */
  kegiatanHariIni?: { slug: string; nama: string }[];
}) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [hadirLokal, setHadirLokal] = useState<Record<string, string>>({}); // orangId → waktu (dari server ∪ antrean)
  const [antrean, setAntrean] = useState<Antrean[]>([]);
  const [online, setOnline] = useState(true);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  // Enam hasil terakhir, terbaru di atas — panitia bisa memastikan scan sebelumnya tanpa menutupi kamera.
  const [riwayat, setRiwayat] = useState<{ id: string; teks: string; sub: string; jenis: "ok" | "ulang" | "gagal"; jam: string }[]>([]);
  const catatRiwayat = useCallback((teks: string, sub: string, jenis: "ok" | "ulang" | "gagal") => {
    setRiwayat((r) => [{ id: idAcak(), teks, sub, jenis, jam: jamWibDari(new Date().toISOString()) }, ...r].slice(0, 6));
  }, []);
  const [galat, setGalat] = useState<string | null>(null);
  const [kamera, setKamera] = useState<"mati" | "hidup" | "ditolak">("mati");
  const [kameraLama, setKameraLama] = useState(false);
  const [kameraCoba, setKameraCoba] = useState(0); // naikkan untuk membuka ulang kamera
  const [cari, setCari] = useState("");
  const [modeCari, setModeCari] = useState(false);
  const [modeTambah, setModeTambah] = useState(false);
  const [sesiHabis, setSesiHabis] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terakhirRef = useRef<{ kode: string; t: number } | null>(null);
  const perangkatId = useMemo(() => { const k = "hadir:perangkat"; const v = baca<string | null>(k, null); if (v) return v; const n = idAcak(); tulis(k, n); return n; }, []);
  const rosterRef = useRef<Roster | null>(null);
  const hadirRef = useRef<Record<string, string>>({});
  const antreanRef = useRef<Antrean[]>([]);
  rosterRef.current = roster; hadirRef.current = hadirLokal; antreanRef.current = antrean;

  // ── muat dari localStorage, lalu segarkan dari server ─────────────────────
  useEffect(() => {
    setRoster(baca<Roster | null>(kunci(sumber.kunciLokal, "roster"), null));
    setAntrean(baca<Antrean[]>(kunci(sumber.kunciLokal, "antrean"), []));
    setHadirLokal(baca<Record<string, string>>(kunci(sumber.kunciLokal, "hadir"), {}));
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [sumber]);

  const segarkan = useCallback(async () => {
    try {
      const res = await fetch(sumber.urlRoster, { cache: "no-store" });
      if (res.redirected || res.status === 401) { setSesiHabis(true); return; }
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as Roster;
      setRoster(r); tulis(kunci(sumber.kunciLokal, "roster"), r);
      // Bangun ulang dari server + antrean yang belum terkirim — JANGAN dari peta lama:
      // hadir yang dibatalkan staff di panel harus hilang dari pemindai juga.
      const h: Record<string, string> = {};
      for (const o of r.orang) if (o.hadirAt) h[o.id] = o.hadirAt;
      for (const e of antreanRef.current) if (e.orangId && !h[e.orangId]) h[e.orangId] = e.waktu;
      setHadirLokal(h); tulis(kunci(sumber.kunciLokal, "hadir"), h);
      setGalat(null);
    } catch (e) {
      setGalat(`Roster gagal dimuat (${e instanceof Error ? e.message : "?"}) — memakai salinan lokal.`);
    }
  }, [sumber]);

  useEffect(() => { void segarkan(); const t = setInterval(() => { if (navigator.onLine) void segarkan(); }, 5 * 60_000); return () => clearInterval(t); }, [segarkan]);

  // ── kirim antrean ─────────────────────────────────────────────────────────
  const kirim = useCallback(async () => {
    const q = antreanRef.current;
    if (q.length === 0 || !navigator.onLine) return;
    try {
      const res = await fetch(sumber.urlScan, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: q }) });
      if (res.redirected || res.status === 401) { setSesiHabis(true); return; }
      if (!res.ok) throw new Error(String(res.status));
      const { hasil: h } = (await res.json()) as { hasil: Record<string, { status: StatusScan; orangId: string | null; nama?: string }> };
      const sisa = q.filter((e) => !h[e.klienId]);
      const hadirBaru = { ...hadirRef.current };
      for (const e of q) {
        const r = h[e.klienId];
        if (!r) continue;
        if ((r.status === "baru" || r.status === "sudah") && r.orangId) hadirBaru[r.orangId] = hadirBaru[r.orangId] ?? e.waktu;
        // Kode yang tak ada di roster lokal tapi dikenal server (pendaftar baru): beri tahu.
        if (!e.orangId && r.nama) setHasil(r.status === "baru" ? { jenis: "server_baru", nama: r.nama, waktu: e.waktu } : r.status === "sudah" ? { jenis: "server_sudah", nama: r.nama } : { jenis: "tak_dikenal", kode: e.kode });
      }
      setHadirLokal(hadirBaru); tulis(kunci(sumber.kunciLokal, "hadir"), hadirBaru);
      setAntrean(sisa); tulis(kunci(sumber.kunciLokal, "antrean"), sisa);
      setSesiHabis(false);
    } catch { /* tetap di antrean, coba lagi nanti */ }
  }, [sumber]);

  useEffect(() => { const t = setInterval(() => void kirim(), 10_000); return () => clearInterval(t); }, [kirim]);
  useEffect(() => { if (online) void kirim(); }, [online, antrean.length, kirim]);

  // ── catat satu kehadiran (lokal dulu) ─────────────────────────────────────
  const catat = useCallback((o: RosterEntri | null, kode: string | null, metode: "qr" | "cari_nama") => {
    const r = rosterRef.current;
    const waktu = new Date().toISOString();
    // Tanpa kegiatan tidak ada jendela scan yang bisa dilanggar.
    if (r?.acara && !dalamJendela(waktu, r.acara.scanBukaAt, r.acara.scanTutupAt)) { setHasil({ jenis: "jendela", waktu }); bunyi("gagal"); catatRiwayat("Di luar jam scan", jamWibDari(waktu), "gagal"); return; }
    if (o) {
      const sudah = hadirRef.current[o.id];
      if (sudah) { setHasil({ jenis: "sudah", o, waktu: sudah }); bunyi("ulang"); catatRiwayat(o.nama, `sudah hadir ${jamWibDari(sudah)}`, "ulang"); return; }
      const h = { ...hadirRef.current, [o.id]: waktu }; setHadirLokal(h); tulis(kunci(sumber.kunciLokal, "hadir"), h);
      const telat = r?.acara ? terlambat(waktu, r.acara) : false;
      setHasil({ jenis: "baru", o, waktu, telat }); bunyi("ok");
      catatRiwayat(o.nama, `${o.program ?? "—"}${telat ? " · terlambat" : ""}`, "ok");
    } else {
      // Tidak ada di roster lokal — mungkin baru daftar. Antrekan dengan kode; server yang memutuskan.
      setHasil({ jenis: "tak_dikenal", kode }); bunyi("gagal");
      catatRiwayat(kode ? `Kode ${kode}` : "Bukan QR kami", kode ? "tidak ada di roster, dicek ke server" : "", "gagal");
      if (!kode) return;
    }
    const e: Antrean = { klienId: idAcak(), orangId: o?.id ?? null, kode, waktu, metode, perangkatId };
    const q = [...antreanRef.current, e]; setAntrean(q); tulis(kunci(sumber.kunciLokal, "antrean"), q);
  }, [sumber, perangkatId, catatRiwayat]);

  const tanganiTeks = useCallback((teks: string) => {
    const kode = ekstrakKode(teks);
    const now = Date.now();
    const kunciDedup = kode ?? teks;
    // Kartu yang terus dipegang di depan kamera = satu scan: selama kode yang sama
    // masih terlihat (jeda antar-frame < 1,5 detik) hanya perbarui waktunya. Scan baru
    // dihitung setelah kartu hilang dari bidang kamera ≥ 1,5 detik — jadi orang
    // berikutnya bisa langsung menyusul, tanpa jeda tetap.
    const t = terakhirRef.current;
    if (t && t.kode === kunciDedup && now - t.t < 1500) { t.t = now; return; }
    terakhirRef.current = { kode: kunciDedup, t: now };
    const o = kode ? rosterRef.current?.orang.find((x) => x.kode === kode) ?? null : null;
    catat(o, kode, "qr");
  }, [catat]);

  // ── kamera ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null; let raf = 0; let hidup = true;
    setKamera("mati"); setKameraLama(false);
    const detector = buatDetector();
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        const v = videoRef.current; if (!v) return;
        v.srcObject = stream; await v.play(); setKamera("hidup");
        let sibuk = false; let terakhir = 0;
        const loop = async (t: number) => {
          if (!hidup) return;
          raf = requestAnimationFrame(loop);
          if (sibuk || t - terakhir < 150 || v.readyState < 2) return;
          terakhir = t; sibuk = true;
          try {
            if (detector) {
              const codes = await detector.detect(v);
              if (codes[0]?.rawValue) tanganiTeks(codes[0].rawValue);
            } else {
              const c = canvasRef.current; if (!c) return;
              const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480) || 360;
              c.width = w; c.height = h;
              const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
              ctx.drawImage(v, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const q = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
              if (q?.data) tanganiTeks(q.data);
            }
          } catch { /* frame gagal, lanjut */ } finally { sibuk = false; }
        };
        raf = requestAnimationFrame(loop);
      } catch { setKamera("ditolak"); }
    })();
    return () => { hidup = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [tanganiTeks, kameraCoba]);

  useEffect(() => { const t = setTimeout(() => setKameraLama(true), 6000); return () => clearTimeout(t); }, [kameraCoba]);

  // ── kiosk: auto-reset & wake lock ─────────────────────────────────────────
  useEffect(() => {
    if (!hasil) return;
    const t = setTimeout(() => setHasil(null), 3000);
    return () => clearTimeout(t);
  }, [hasil, kiosk]);
  useEffect(() => {
    if (!kiosk) return;
    let lock: { release: () => Promise<void> } | null = null;
    const n = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    n.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release(); };
  }, [kiosk]);

  const jumlahHadir = Object.keys(hadirLokal).length;
  const hasilCari = useMemo(() => {
    const k = cari.trim().toLowerCase();
    if (!roster || k.length < 2) return [];
    return roster.orang.filter((o) => o.nama.toLowerCase().includes(k) || (o.waAkhir4 && k === o.waAkhir4)).slice(0, 20);
  }, [cari, roster]);

  const warnaPanel = !hasil ? "bg-neutral-900" : hasil.jenis === "baru" || hasil.jenis === "server_baru" ? "bg-green-600" : hasil.jenis === "sudah" || hasil.jenis === "server_sudah" ? "bg-amber-500" : "bg-red-600";
  const besar = kiosk ? "text-[40px] leading-tight" : "text-24 leading-tight";
  const warnaRiwayat = { ok: "bg-green-500", ulang: "bg-amber-400", gagal: "bg-red-500" } as const;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* bar status */}
      <div className="flex items-center gap-3 px-3 py-2 text-12">
        {!kiosk && <Link href={sumber.urlPanel} className="rounded border border-white/30 px-2 py-0.5">← Panel</Link>}
        <span className="truncate font-medium">{namaAcara}</span>
        <span className="ml-auto tabular-nums">Hadir <b>{jumlahHadir}</b>{roster ? ` / ${roster.orang.length}` : ""}</span>
        {antrean.length > 0 && <span className="rounded bg-amber-500/80 px-1.5 tabular-nums">antre {antrean.length}</span>}
        <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-400" : "bg-red-500"}`} title={online ? "online" : "offline"} />
        <button type="button" onClick={() => void segarkan()} className="rounded border border-white/30 px-2 py-0.5">Segarkan</button>
      </div>
      {kegiatanHariIni.length > 0 && (
        <div className="bg-amber-600 px-3 py-2 text-13">
          Hari ini ada kegiatan — scan di sini <b>tidak</b> masuk ke daftar hadirnya sampai ditautkan manual. Pakai pemindai kegiatan:{" "}
          {kegiatanHariIni.map((k, i) => (
            <span key={k.slug}>{i > 0 && " · "}<a href={`/acara/${k.slug}/scan${kiosk ? "?kiosk=1" : ""}`} className="font-semibold underline">{k.nama}</a></span>
          ))}
          {antrean.length > 0 && <> (tunggu <b>antre</b> habis dulu)</>}
        </div>
      )}
      {sesiHabis && <div className="bg-red-700 px-3 py-2 text-13">Sesi login habis — <a href={`/login?redirectTo=${encodeURIComponent(sumber.urlKembali)}`} className="underline">login ulang</a>. Scan tetap tersimpan di antrean.</div>}
      {galat && <div className="bg-amber-700 px-3 py-1 text-12">{galat}</div>}
      {!roster && <div className="bg-neutral-800 px-3 py-1 text-12">Roster belum dimuat — tekan Segarkan saat online.</div>}

      {/* kamera + panel hasil: berdampingan di layar lebar, bertumpuk di HP. Kamera tidak pernah ditutup. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {kamera === "ditolak" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-14">
              Kamera tidak bisa dibuka. Izinkan kamera di browser (butuh HTTPS), atau pakai Cari nama.
              <button type="button" onClick={() => setKameraCoba((n) => n + 1)} className="rounded bg-white/15 px-4 py-2 text-14">Coba kamera lagi</button>
            </div>
          )}
          {kamera === "mati" && kameraLama && (
            <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-3 bg-amber-700/90 px-3 py-2 text-center text-13">
              Kamera belum aktif — izinkan akses kamera bila diminta, atau pakai Cari nama.
              <button type="button" onClick={() => setKameraCoba((n) => n + 1)} className="rounded bg-white/20 px-3 py-1">Coba lagi</button>
            </div>
          )}
          {kiosk && qrDaftarSvg && (
            <div className="absolute bottom-3 right-3 w-36 rounded-lg bg-white p-2 text-center text-11 text-black">
              <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrDaftarSvg }} />
              Belum punya QR? Scan ini untuk daftar
            </div>
          )}
        </div>

        <div className={`flex flex-col md:w-[38%] md:max-w-[520px] ${kiosk ? "min-h-[40%] md:min-h-0" : "min-h-[30%] md:min-h-0"}`}>
          <div className={`flex flex-1 flex-col items-center justify-center p-4 text-center transition-colors ${warnaPanel}`} onClick={() => setHasil(null)}>
            {!hasil && (<>
              <div className="text-14 opacity-70">Arahkan kamera ke QR</div>
              <div className="mt-1 text-12 opacity-50">Tidak perlu pas di tengah — terbaca di mana pun dalam bidang kamera.</div>
            </>)}
            {hasil?.jenis === "baru" && (<>
              <div className="text-14 uppercase tracking-wide">Hadir{hasil.telat ? " · TERLAMBAT" : ""}</div>
              <div className={`mt-1 font-semibold ${besar}`}>{hasil.o.nama}</div>
              <div className="mt-1 text-15">{hasil.o.program ?? "—"} · {hasil.o.gender === "P" ? "Akhwat" : "Ikhwan"}</div>
              {/* Label RSVP dan badge target hanya bermakna bila ada kegiatan. Di mode
                  lepas `wajib` SELALU false, jadi tanpa gerbang ini badge "Tidak wajib"
                  akan menempel pada setiap orang. */}
              <div className="mt-0.5 text-13 opacity-90">
                {roster?.acara ? `${labelKonfirmasi(hasil.o.konfirmasi)} · ${jamWibDari(hasil.waktu)}` : jamWibDari(hasil.waktu)}
              </div>
              {roster?.acara && !hasil.o.wajib && <div className="mt-1 inline-block rounded bg-white/20 px-2 py-0.5 text-12">Tidak wajib — hadir tambahan</div>}
              <a href={`/h/${hasil.o.kode}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-2 text-12 underline opacity-80">Kartu QR ↗</a>
            </>)}
            {hasil?.jenis === "sudah" && (<>
              <div className="text-14 uppercase tracking-wide">Sudah hadir {jamWibDari(hasil.waktu)}</div>
              <div className={`mt-1 font-semibold ${besar}`}>{hasil.o.nama}</div>
              <div className="mt-1 text-15">{hasil.o.program ?? "—"}</div>
            </>)}
            {hasil?.jenis === "server_baru" && (<>
              <div className="text-14 uppercase">Hadir (pendaftar baru)</div>
              <div className={`mt-1 font-semibold ${besar}`}>{hasil.nama}</div>
              <div className="mt-1 text-13">{jamWibDari(hasil.waktu)}</div>
              {hasil.kode && <a href={`/h/${hasil.kode}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-3 rounded bg-white/20 px-3 py-1.5 text-13 underline">Buka kartu QR-nya ↗</a>}
            </>)}
            {hasil?.jenis === "server_sudah" && (<><div className="text-14 uppercase">Sudah hadir</div><div className={`mt-1 font-semibold ${besar}`}>{hasil.nama}</div></>)}
            {hasil?.jenis === "tak_dikenal" && (<>
              <div className={`font-semibold ${besar}`}>QR tidak dikenal</div>
              <div className="mt-1 text-13">{hasil.kode ? `Kode ${hasil.kode} tidak ada di roster${online ? " — dicek ke server…" : " — akan dicek saat online"}` : "Bukan QR kehadiran kami."}</div>
              {!kiosk && <div className="mt-2 text-13 underline" onClick={(e) => { e.stopPropagation(); setHasil(null); setModeCari(true); }}>Cari nama</div>}
            </>)}
            {hasil?.jenis === "jendela" && (<><div className={`font-semibold ${besar}`}>Di luar jam scan</div><div className="mt-1 text-13">{jamWibDari(hasil.waktu)} — hubungi koordinator.</div></>)}
          </div>
          {riwayat.length > 0 && (
            <ul className="max-h-40 divide-y divide-white/10 overflow-auto bg-neutral-900 text-12 md:max-h-none md:flex-1">
              {riwayat.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${warnaRiwayat[r.jenis]}`} />
                  <span className="min-w-0 flex-1 truncate">{r.teks}<span className="ml-1 opacity-60">{r.sub}</span></span>
                  <span className="tabular-nums opacity-60">{r.jam}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* cari nama */}
      {!kiosk && (
        <div className="border-t border-white/20 bg-neutral-900 p-3">
          {!modeCari ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setModeCari(true)} className="flex-1 rounded bg-white/10 py-3 text-14">Cari nama / 4 digit WA</button>
              <button type="button" disabled={!online} onClick={() => { setModeCari(true); setModeTambah(true); }} className="rounded bg-green-700 px-4 py-3 text-14 disabled:opacity-40" title={online ? "Peserta belum terdata: tambah & hadirkan" : "Butuh koneksi"}>+ Tambah orang</button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input autoFocus value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Ketik nama atau 4 digit akhir WA" className="flex-1 rounded bg-white px-3 py-2 text-14 text-black" />
                <button type="button" onClick={() => { setModeCari(false); setModeTambah(false); setCari(""); }} className="rounded bg-white/10 px-3 text-14">Tutup</button>
              </div>
              <ul className="mt-2 max-h-56 divide-y divide-white/10 overflow-auto">
                {hasilCari.map((o) => {
                  const sudah = hadirLokal[o.id];
                  return (
                    <li key={o.id} className="flex items-center gap-2 py-2 text-14">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{o.nama} <span className="text-12 opacity-70">{o.gender === "P" ? "A" : "I"}</span></div>
                        <div className="truncate text-12 opacity-70">{o.program ?? "—"} · {labelKonfirmasi(o.konfirmasi)}{sudah ? ` · hadir ${jamWibDari(sudah)}` : ""}</div>
                      </div>
                      <a href={`/h/${o.kode}`} target="_blank" rel="noreferrer" className="rounded border border-white/30 px-2 py-1.5 text-12" title="Buka kartu QR">QR</a>
                      {!sudah && <button type="button" onClick={() => { catat(o, o.kode, "cari_nama"); setCari(""); setModeCari(false); }} className="rounded bg-green-600 px-3 py-1.5 text-13">Hadir</button>}
                    </li>
                  );
                })}
                {cari.trim().length >= 2 && hasilCari.length === 0 && !modeTambah && (
                  <li className="flex flex-wrap items-center gap-2 py-2 text-13 opacity-90">
                    Tidak ada di data.
                    <button type="button" disabled={!online} onClick={() => setModeTambah(true)} className="rounded bg-green-600 px-3 py-1 text-13 text-white disabled:opacity-40">+ Tambah & hadirkan</button>
                    <span className="opacity-60">atau <a href={urlDaftar} target="_blank" className="underline">daftar sendiri</a> lalu scan QR-nya{!online ? " (tambah butuh koneksi)" : ""}.</span>
                  </li>
                )}
              </ul>
              {modeTambah && (
                <div className="mt-2 rounded-lg bg-neutral-800 p-3">
                  <FormTambahOrang
                    aksi={aksiTambah}
                    namaAwal={cari.trim()}
                    gelap
                    onBatal={() => setModeTambah(false)}
                    onSelesai={(h) => {
                      // Server sudah mencatat hadir; sinkronkan roster & peta lokal supaya scan ulang kartunya nanti kuning, bukan "tak dikenal".
                      const waktu = new Date().toISOString();
                      const entri: RosterEntri = { id: h.orangId, nama: h.nama, kode: h.kode, gender: "L", program: null, konfirmasi: null, waAkhir4: null, hadirAt: waktu, golongan: [], wajib: false };
                      setRoster((r) => (r && !r.orang.some((o) => o.id === h.orangId) ? { ...r, orang: [...r.orang, entri] } : r));
                      const peta = { ...hadirRef.current, [h.orangId]: hadirRef.current[h.orangId] ?? waktu };
                      setHadirLokal(peta); tulis(kunci(sumber.kunciLokal, "hadir"), peta);
                      setHasil({ jenis: "server_baru", nama: h.nama, waktu, kode: h.kode });
                      catatRiwayat(h.nama, h.sudahAda ? "sudah ada di data, dihadirkan" : "peserta baru, dihadirkan", "ok");
                      bunyi("ok");
                      setModeTambah(false); setModeCari(false); setCari("");
                      void segarkan();
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
