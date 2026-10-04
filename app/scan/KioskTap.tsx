"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Keyboard, LogOut, Nfc, SwitchCamera, WifiOff } from "lucide-react";
import { isian, kartu, labelMikro, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import { ekstrakKode } from "@/lib/hadir/kode";
import { jamTitik, jamWibDari, sesiDari } from "@/lib/kerja/sesi";
import { nadaTap } from "@/lib/kerja/terpadu";
import { LABEL_SESI, type BatasSesi, type HasilTap, type InputTap, type JawabanTap, type MetodeTap, type Sesi } from "@/lib/kerja/types";
import { jakartaDate } from "@/lib/time/jakarta";
import { toneBadgeClass, type StatusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";
import { kirimTap } from "./actions";

// ── penyimpanan lokal (semua dibungkus try/catch: mode privat/penuh tidak boleh mematikan kiosk) ──
const K_ANTREAN = "kerja:antrean";
const K_RIWAYAT = "kerja:riwayat";
const K_KAMERA = "kerja:kamera";
function baca<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function tulis(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penuh/privat: abaikan */ } }
function idAcak(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Tanpa randomUUID (HTTP biasa di tablet lama): UUID v4 dari getRandomValues — server menuntut bentuk uuid.
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Keadaan satu tap di layar: hasil server, atau belum sampai ke server. */
type Keadaan = HasilTap | "mengirim" | "antre" | "kedaluwarsa";
type Riwayat = InputTap & { keadaan: Keadaan; jawaban: JawabanTap | null; /** QR asing: ditolak di perangkat, tak dikirim. */ lokal?: true };

/** Antrean lebih tua dari ini dibuang: server toh tak lagi mempercayai jamnya (waktuTepercaya). */
const UMUR_ANTREAN_MS = 3 * 86_400_000;
const JEDA_ULANG_MS = 5000;
const TAMPIL_UMPAN_MS = 4000;
const BATAS_KIRIM_MS = 12_000;

const NADA_UMPAN: Record<Keadaan, string> = {
  tercatat: "bg-emerald-600 text-white dark:bg-emerald-700",
  sudah: "bg-neutral-200 text-foreground dark:bg-neutral-800",
  di_luar_sesi: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  bukan_anggota: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  tak_dikenal: "bg-red-600 text-white dark:bg-red-700",
  mengirim: "bg-card text-foreground",
  antre: toneBadgeClass.info,
  kedaluwarsa: toneBadgeClass.danger,
};
const NADA_RIWAYAT: Record<Keadaan, StatusTone> = {
  tercatat: "success", sudah: "neutral", di_luar_sesi: "warning", bukan_anggota: "warning",
  tak_dikenal: "danger", mengirim: "neutral", antre: "info", kedaluwarsa: "danger",
};
const LABEL_KEADAAN: Record<Keadaan, string> = {
  tercatat: "Tercatat", sudah: "Sudah", di_luar_sesi: "Di luar sesi", bukan_anggota: "Belum terdaftar",
  tak_dikenal: "Tak dikenal", mengirim: "Mengirim…", antre: "Antre", kedaluwarsa: "Kedaluwarsa",
};
const LABEL_METODE: Record<MetodeTap, string> = { qr: "QR", nfc: "Kartu NFC", ketik: "Ketik" };

const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** "2026-09-29" → "Selasa, 29 September 2026" — tanpa Intl supaya sama di semua tablet. */
function tanggalPanjang(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const jamTap = (r: InputTap) => jamTitik(jamWibDari(new Date(Number.isFinite(Date.parse(r.waktu)) ? r.waktu : Date.now())));

/**
 * Keadaan layar dari jawaban server. Scan terpadu: bila tap punya arti apa pun
 * (kerja, kegiatan, mengajar), nadanya ikut arti itu — orang yang bukan anggota
 * logbook tapi baru hadir di kajian tetap hijau.
 */
function keadaanDari(j: JawabanTap): Keadaan {
  const arti = j.arti ?? [];
  if (arti.length === 0) return j.hasil;
  const n = nadaTap(arti);
  return n === "baru" ? "tercatat" : n === "sudah" ? "sudah" : "di_luar_sesi";
}

/** Teks kartu umpan balik besar. */
function teksUmpan(r: Riwayat): { judul: string; sub: string | null } {
  const j = r.jawaban;
  const arti = j?.arti ?? [];
  if (arti.length > 0 && (r.keadaan === "tercatat" || r.keadaan === "sudah" || r.keadaan === "di_luar_sesi")) {
    const n = nadaTap(arti);
    return { judul: n === "baru" ? "Tercatat" : n === "sudah" ? "Sudah tercatat" : "Perlu ditinjau admin", sub: null };
  }
  const jam = jamTitik(j?.jam ?? jamWibDari(new Date(r.waktu)));
  const sesi = j?.sesi ? `Sesi ${LABEL_SESI[j.sesi]}` : null;
  switch (r.keadaan) {
    case "mengirim": return { judul: "Memeriksa kartu…", sub: LABEL_METODE[r.metode] };
    case "antre": return { judul: "Tersimpan, dikirim nanti", sub: `Koneksi terputus — tap ${jamTap(r)} aman di perangkat ini.` };
    case "kedaluwarsa": return { judul: "Tap kedaluwarsa", sub: "Lebih dari 3 hari tak terkirim — isi manual di logbook." };
    case "tercatat": return { judul: `Tercatat — ${sesi ?? "Sesi"} ${jam}`, sub: null };
    case "sudah": return { judul: `Sudah tercatat ${jam}`, sub: sesi ? `${sesi} — jam datang pertama yang dipakai.` : null };
    case "di_luar_sesi": return { judul: `Di luar jam sesi — ${jam}`, sub: "Tap disimpan, tapi tidak mengisi logbook." };
    case "bukan_anggota": return { judul: "Belum terdaftar di logbook", sub: "Minta admin menambahkan ke daftar pengurus." };
    case "tak_dikenal":
      if (r.lokal) return { judul: "Bukan QR kartu kehadiran", sub: "Tunjukkan QR dari kartu pengurus." };
      return { judul: "Kartu tidak dikenal", sub: r.metode === "nfc" ? `UID ${r.dibaca} belum terhubung ke siapa pun.` : `Kode ${r.dibaca} tidak cocok dengan siapa pun.` };
  }
}

// ── bunyi & getar (opsional; gagal diam-diam) ─────────────────────────────
let ctxAudio: AudioContext | null = null;
function bunyi(jenis: "ok" | "ulang" | "gagal") {
  try {
    ctxAudio ??= new AudioContext();
    const ctx = ctxAudio;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = jenis === "ok" ? 880 : jenis === "ulang" ? 520 : 220;
    g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + (jenis === "gagal" ? 0.35 : 0.15));
  } catch { /* tanpa audio */ }
  try { if (typeof navigator.vibrate === "function") navigator.vibrate(jenis === "ok" ? 80 : jenis === "ulang" ? [60, 60, 60] : 300); } catch { /* */ }
}
const bunyiHasil = (k: Keadaan) => bunyi(k === "tercatat" ? "ok" : k === "sudah" || k === "antre" ? "ulang" : "gagal");

/** BarcodeDetector bawaan (Chrome/Android) kalau ada; kalau tidak, jsQR dari canvas. */
type Detector = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
function buatDetector(): Detector | null {
  const w = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
  try { return w.BarcodeDetector ? new w.BarcodeDetector({ formats: ["qr_code"] }) : null; } catch { return null; }
}

/** Elemen yang sah memegang fokus keyboard — selain itu, fokus dikembalikan ke pembaca kartu. */
const bolehFokus = (el: Element | null) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable);

function rentangSesi(b: BatasSesi, s: Sesi): string {
  const [a, z] = s === "pagi" ? [b.pagiMulai, b.siangMulai] : s === "siang" ? [b.siangMulai, b.soreMulai] : [b.soreMulai, b.selesai];
  return `${jamTitik(a)}–${jamTitik(z)}`;
}

export function KioskTap({ batas, kiosk, namaKantor, urlKeluar }: { batas: BatasSesi; kiosk: boolean; namaKantor: string; urlKeluar: string | null }) {
  const [sekarang, setSekarang] = useState<Date | null>(null); // null sampai terpasang: jam server ≠ jam tablet
  const [online, setOnline] = useState(true);
  const [antrean, setAntrean] = useState<InputTap[]>([]);
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const [umpan, setUmpan] = useState<Riwayat | null>(null);
  const [kamera, setKamera] = useState<{ aktif: boolean; arah: "environment" | "user" }>({ aktif: true, arah: "environment" });
  const [keadaanKamera, setKeadaanKamera] = useState<"mati" | "hidup" | "ditolak">("mati");
  const [kameraCoba, setKameraCoba] = useState(0);
  const [nfcBuf, setNfcBuf] = useState("");
  const [nfcSiap, setNfcSiap] = useState(false);
  const [ketik, setKetik] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nfcRef = useRef<HTMLInputElement>(null);
  const antreanRef = useRef<InputTap[]>([]);
  const riwayatRef = useRef<Riwayat[]>([]);
  const sibukRef = useRef(new Set<string>());
  const mengurasRef = useRef(false);
  const terakhirRef = useRef<{ kunci: string; t: number } | null>(null);
  const nfcBufRef = useRef("");

  // Antrean & riwayat diubah lewat ref dulu (sinkron), baru state + localStorage —
  // kiriman yang selesai bersamaan tidak saling menimpa.
  const ubahAntrean = useCallback((fn: (q: InputTap[]) => InputTap[]) => {
    const q = fn(antreanRef.current); antreanRef.current = q; setAntrean(q); tulis(K_ANTREAN, q);
  }, []);
  const ubahRiwayat = useCallback((fn: (r: Riwayat[]) => Riwayat[]) => {
    const r = fn(riwayatRef.current).slice(0, 10); riwayatRef.current = r; setRiwayat(r); tulis(K_RIWAYAT, r);
  }, []);
  /** Perbarui satu tap di riwayat + kartu umpan (bila tap itu yang sedang tampil). */
  const perbarui = useCallback((klienId: string, ubah: Partial<Riwayat>) => {
    ubahRiwayat((rs) => rs.map((r) => (r.klienId === klienId ? { ...r, ...ubah } : r)));
    setUmpan((u) => (u && u.klienId === klienId ? { ...u, ...ubah } : u));
  }, [ubahRiwayat]);

  // ── muat dari localStorage ────────────────────────────────────────────────
  useEffect(() => {
    antreanRef.current = baca<InputTap[]>(K_ANTREAN, []);
    setAntrean(antreanRef.current);
    // Tap yang "mengirim" saat halaman ditutup belum pasti sampai — tampilkan sebagai antre.
    riwayatRef.current = baca<Riwayat[]>(K_RIWAYAT, []).map((r) => (r.keadaan === "mengirim" ? { ...r, keadaan: "antre" as const } : r));
    setRiwayat(riwayatRef.current);
    setKamera((k) => ({ ...k, ...baca<Partial<typeof k>>(K_KAMERA, {}) }));
    setSekarang(new Date());
    setOnline(navigator.onLine);
    const t = setInterval(() => setSekarang(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  // ── kirim ke server ───────────────────────────────────────────────────────
  const kirimSatu = useCallback(async (t: InputTap): Promise<{ ok: true; j: JawabanTap } | { ok: false; sibuk?: true }> => {
    if (sibukRef.current.has(t.klienId)) return { ok: false, sibuk: true };
    sibukRef.current.add(t.klienId);
    try {
      // Server action yang menggantung (sinyal setengah hidup) jangan menahan layar; catatTap idempoten per klienId.
      const j = await Promise.race([
        kirimTap(t),
        new Promise<never>((_, gagal) => setTimeout(() => gagal(new Error("batas waktu")), BATAS_KIRIM_MS)),
      ]);
      ubahAntrean((q) => q.filter((x) => x.klienId !== t.klienId));
      perbarui(t.klienId, { keadaan: keadaanDari(j), jawaban: j });
      return { ok: true, j };
    } catch {
      return { ok: false };
    } finally {
      sibukRef.current.delete(t.klienId);
    }
  }, [ubahAntrean, perbarui]);

  const kirimAntrean = useCallback(async () => {
    if (mengurasRef.current || antreanRef.current.length === 0) return;
    mengurasRef.current = true;
    try {
      const batasUmur = Date.now() - UMUR_ANTREAN_MS;
      const basi = antreanRef.current.filter((t) => Date.parse(t.waktu) < batasUmur);
      if (basi.length) {
        const id = new Set(basi.map((t) => t.klienId));
        ubahAntrean((q) => q.filter((t) => !id.has(t.klienId)));
        for (const t of basi) perbarui(t.klienId, { keadaan: "kedaluwarsa" });
      }
      // Satu tap gagal belum tentu offline (bisa satu baris yang ditolak server) — jangan
      // biarkan ia menahan antrean; tiga gagal beruntun = jaringan, coba lagi nanti.
      let gagal = 0;
      for (const t of [...antreanRef.current]) {
        const r = await kirimSatu(t);
        if (r.ok) gagal = 0;
        else if (!r.sibuk && ++gagal >= 3) break;
      }
    } finally {
      mengurasRef.current = false;
    }
  }, [kirimSatu, ubahAntrean, perbarui]);

  useEffect(() => {
    const on = () => { setOnline(true); void kirimAntrean(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const t = setInterval(() => void kirimAntrean(), 20_000);
    void kirimAntrean();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, [kirimAntrean]);

  // ── satu tap ──────────────────────────────────────────────────────────────
  const tap = useCallback((dibaca: string, metode: MetodeTap) => {
    const t: InputTap = { klienId: idAcak(), dibaca: dibaca.slice(0, 200), metode, waktu: new Date().toISOString() };
    // Masuk antrean dulu: bila tab tertutup di tengah kiriman, tap tetap ada.
    ubahAntrean((q) => [...q, t]);
    const r: Riwayat = { ...t, keadaan: "mengirim", jawaban: null };
    ubahRiwayat((rs) => [r, ...rs]);
    setUmpan(r);
    void kirimSatu(t).then((h) => {
      if (h.ok) { bunyiHasil(h.j.hasil); return; }
      if (h.sibuk) return;
      perbarui(t.klienId, { keadaan: "antre" });
      bunyiHasil("antre");
    });
  }, [ubahAntrean, ubahRiwayat, kirimSatu, perbarui]);

  /** Kartu yang sama dalam 5 detik diabaikan. Kamera memperpanjang jendela selama kartu masih dipegang. */
  const lolos = useCallback((kunci: string, perpanjang: boolean) => {
    const now = Date.now(); const l = terakhirRef.current;
    if (l && l.kunci === kunci && now - l.t < JEDA_ULANG_MS) { if (perpanjang) l.t = now; return false; }
    terakhirRef.current = { kunci, t: now };
    return true;
  }, []);

  const tanganiQr = useCallback((teks: string) => {
    const kode = ekstrakKode(teks);
    if (!lolos(kode ?? teks, true)) return;
    if (kode) { tap(kode, "qr"); return; }
    // QR asing (menu, wifi, …): tolak di sini, tidak perlu jadi baris tap di server.
    const r: Riwayat = { klienId: idAcak(), dibaca: teks.slice(0, 60), metode: "qr", waktu: new Date().toISOString(), keadaan: "tak_dikenal", jawaban: null, lokal: true };
    ubahRiwayat((rs) => [r, ...rs]);
    setUmpan(r);
    bunyi("gagal");
  }, [lolos, tap, ubahRiwayat]);

  /** Isi pembaca USB (UID + Enter). Pemindai QR USB juga mengetik — kalau isinya kode kita, catat sebagai QR. */
  const kirimNfc = useCallback((mentah: string) => {
    const v = mentah.trim();
    nfcBufRef.current = ""; setNfcBuf("");
    if (v.length < 4) return;
    const kode = ekstrakKode(v);
    if (kode) { if (lolos(kode, false)) tap(kode, "qr"); return; }
    if (lolos(`nfc:${v.replace(/[^0-9a-f]/gi, "").toUpperCase() || v}`, false)) tap(v, "nfc");
  }, [lolos, tap]);

  // ── fokus pembaca kartu ───────────────────────────────────────────────────
  // Kiosk merebut fokus dari apa pun selain isian teks. Di dalam AppShell hanya
  // bila fokus lepas ke badan halaman — menu dan tombol navigasi tetap bisa dipakai.
  const fokusBebas = useCallback(() => {
    const a = document.activeElement;
    return !a || a === document.body || (kiosk && !bolehFokus(a));
  }, [kiosk]);
  const fokusNfc = useCallback(() => {
    if (fokusBebas()) nfcRef.current?.focus({ preventScroll: true });
  }, [fokusBebas]);
  useEffect(() => {
    fokusNfc();
    // Fokus sempat lepas: ketikan pembaca tetap ditangkap ke penyangga.
    const tekan = (e: KeyboardEvent) => {
      if (!fokusBebas() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") { if (!nfcBufRef.current) return; e.preventDefault(); kirimNfc(nfcBufRef.current); return; }
      if (e.key.length === 1) { nfcBufRef.current += e.key; setNfcBuf(nfcBufRef.current); nfcRef.current?.focus({ preventScroll: true }); e.preventDefault(); }
    };
    const t = setInterval(fokusNfc, 3000);
    window.addEventListener("keydown", tekan);
    return () => { window.removeEventListener("keydown", tekan); clearInterval(t); };
  }, [fokusBebas, fokusNfc, kirimNfc]);

  // ── kamera ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!kamera.aktif) return;
    let stream: MediaStream | null = null; let raf = 0; let hidup = true;
    const detector = buatDetector();
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: kamera.arah }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!hidup) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current; if (!v) return;
        v.srcObject = stream; await v.play(); setKeadaanKamera("hidup");
        let sibuk = false; let terakhir = 0;
        const loop = async (t: number) => {
          if (!hidup) return;
          raf = requestAnimationFrame(loop);
          if (sibuk || t - terakhir < 150 || v.readyState < 2) return;
          terakhir = t; sibuk = true;
          try {
            if (detector) {
              const codes = await detector.detect(v);
              if (codes[0]?.rawValue) tanganiQr(codes[0].rawValue);
            } else {
              const c = canvasRef.current; if (!c) return;
              const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480) || 360;
              c.width = w; c.height = h;
              const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
              ctx.drawImage(v, 0, 0, w, h);
              const q = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
              if (q?.data) tanganiQr(q.data);
            }
          } catch { /* frame gagal, lanjut */ } finally { sibuk = false; }
        };
        raf = requestAnimationFrame(loop);
      } catch { if (hidup) setKeadaanKamera("ditolak"); }
    })();
    return () => { hidup = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); setKeadaanKamera("mati"); };
  }, [kamera.aktif, kamera.arah, kameraCoba, tanganiQr]);

  const setelKamera = (ubah: Partial<typeof kamera>) => {
    setKamera((k) => { const n = { ...k, ...ubah }; tulis(K_KAMERA, n); return n; });
  };

  // ── kartu umpan hilang sendiri; kiosk: layar jangan tidur ─────────────────
  useEffect(() => {
    if (!umpan || umpan.keadaan === "mengirim") return;
    const t = setTimeout(() => setUmpan(null), TAMPIL_UMPAN_MS);
    return () => clearTimeout(t);
  }, [umpan]);
  useEffect(() => {
    if (!kiosk) return;
    let lock: { release: () => Promise<void> } | null = null;
    const n = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    n.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release(); };
  }, [kiosk]);

  const sesiKini = sekarang ? sesiDari(sekarang, batas) : null;
  const u = umpan ? teksUmpan(umpan) : null;
  const besar = kiosk ? "text-3xl sm:text-4xl" : "text-28";

  const isi = (
    <div className="flex flex-col gap-4">
      {/* kepala: tanggal, sesi sekarang, status jaringan & pembaca */}
      <div className={cn(kartu, "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3")}>
        <div className="min-w-0 flex-1">
          <div className={labelMikro}>{namaKantor}</div>
          <div className="mt-0.5 text-16 font-semibold">{sekarang ? tanggalPanjang(jakartaDate(sekarang)) : "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-28 font-extrabold leading-none tracking-[-0.03em] tabular-nums">{sekarang ? jamTitik(jamWibDari(sekarang)) : "--.--"}</div>
          <div className="mt-1 text-12 text-ink-muted">
            {sekarang ? (sesiKini ? <>Sesi <b className="text-foreground">{LABEL_SESI[sesiKini]}</b> · {rentangSesi(batas, sesiKini)}</> : "Di luar jam sesi") : " "}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 text-12">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium", online ? toneBadgeClass.success : toneBadgeClass.danger)}>
            {online ? <span className="size-2 rounded-full bg-current" /> : <WifiOff className="size-3.5" />}
            {online ? "Online" : "Offline"}
          </span>
          {antrean.length > 0 && (
            <span className={cn("rounded-full px-2.5 py-1 font-medium tabular-nums", toneBadgeClass.info)}>{antrean.length} tap menunggu dikirim</span>
          )}
          {/* Pembaca USB mengetik ke isian ini. inputMode="none": fokus permanen tanpa memunculkan keyboard layar. */}
          <label className={cn("relative ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 font-medium", nfcSiap ? toneBadgeClass.success : toneBadgeClass.neutral)}>
            <Nfc className="size-3.5" />
            {nfcSiap ? (nfcBuf ? "Membaca kartu…" : "Pembaca kartu siap") : "Ketuk untuk aktifkan pembaca"}
            <input
              ref={nfcRef}
              aria-label="Pembaca kartu NFC"
              inputMode="none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={nfcBuf}
              onChange={(e) => { nfcBufRef.current = e.target.value; setNfcBuf(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); kirimNfc(e.currentTarget.value); } }}
              onFocus={() => setNfcSiap(true)}
              onBlur={() => { setNfcSiap(false); setTimeout(fokusNfc, 250); }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* kamera */}
        <div className="relative aspect-[4/3] max-h-[45vh] w-full overflow-hidden rounded-[14px] bg-neutral-900 text-white md:max-h-none">
          <video ref={videoRef} className={cn("h-full w-full object-cover", kamera.arah === "user" && "-scale-x-100", !kamera.aktif && "hidden")} muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {!kamera.aktif && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-14 opacity-80">
              <CameraOff className="size-8" /> Kamera dimatikan — pakai pembaca kartu atau ketik kode.
            </div>
          )}
          {kamera.aktif && keadaanKamera === "ditolak" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-14">
              Kamera tidak bisa dibuka. Izinkan kamera di browser (butuh HTTPS), atau pakai pembaca kartu.
              <button type="button" onClick={() => setKameraCoba((n) => n + 1)} className="h-11 rounded-[9px] bg-white/15 px-4 text-14">Coba kamera lagi</button>
            </div>
          )}
          {kamera.aktif && keadaanKamera === "hidup" && (
            <div className="pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b from-black/60 to-transparent px-3 py-2 text-12">Tunjukkan QR kartu ke kamera</div>
          )}
          <div className="absolute right-2 bottom-2 flex gap-2">
            {kamera.aktif && (
              <button type="button" onClick={() => setelKamera({ arah: kamera.arah === "user" ? "environment" : "user" })} className="flex size-11 items-center justify-center rounded-full bg-black/55 backdrop-blur" aria-label="Ganti kamera depan/belakang">
                <SwitchCamera className="size-5" />
              </button>
            )}
            <button type="button" onClick={() => setelKamera({ aktif: !kamera.aktif })} className="flex size-11 items-center justify-center rounded-full bg-black/55 backdrop-blur" aria-label={kamera.aktif ? "Matikan kamera" : "Nyalakan kamera"}>
              {kamera.aktif ? <CameraOff className="size-5" /> : <Camera className="size-5" />}
            </button>
          </div>
        </div>

        {/* umpan balik */}
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex min-h-[220px] flex-col items-center justify-center rounded-[14px] border border-neutral-300 p-6 text-center transition-colors dark:border-neutral-800",
            umpan ? NADA_UMPAN[umpan.keadaan] : "bg-card",
          )}
        >
          {!umpan || !u ? (
            <>
              <Nfc className="size-10 text-ink-faint" />
              <div className="mt-3 text-20 font-semibold">Tempelkan kartu atau tunjukkan QR</div>
              <div className="mt-1 text-14 text-ink-muted">Satu tap untuk semua: check-in kerja, hadir kegiatan, dan mengajar.</div>
            </>
          ) : (
            <>
              {umpan.jawaban?.nama && <div className={cn("font-bold leading-tight tracking-[-0.02em] text-balance", besar)}>{umpan.jawaban.nama}</div>}
              <div className={cn(umpan.jawaban?.nama ? "mt-2 text-20 font-semibold" : cn("font-bold leading-tight", besar))}>{u.judul}</div>
              {u.sub && <div className="mt-2 max-w-md text-14 opacity-85 text-pretty break-words">{u.sub}</div>}
              {(umpan.jawaban?.arti?.length ?? 0) > 0 && (
                <ul className="mt-3 flex max-w-md flex-col gap-1.5 text-left">
                  {umpan.jawaban!.arti.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-14 font-medium">
                      <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", a.status === "sudah" ? "bg-current opacity-40" : a.status === "perlu_tinjau" ? "bg-amber-400" : "bg-current")} />
                      <span className="text-pretty">{a.label}</span>
                      {a.status === "menunggu_sinkron" && <span className="text-11 opacity-75">(menunggu sinkron)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {/* ketik kode manual */}
      <form
        className={cn(kartu, "flex flex-wrap items-center gap-2 px-4 py-3")}
        onSubmit={(e) => {
          e.preventDefault();
          const v = ketik.trim();
          if (!v) return;
          tap(ekstrakKode(v) ?? v, "ketik");
          setKetik("");
          (document.activeElement as HTMLElement | null)?.blur();
          fokusNfc();
        }}
      >
        <label htmlFor="ketik-kode" className="flex items-center gap-1.5 text-14 font-medium">
          <Keyboard className="size-4 text-ink-muted" /> Ketik kode
        </label>
        <div className="flex min-w-0 flex-1 basis-56 gap-2">
          <input
            id="ketik-kode"
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            onBlur={() => setTimeout(fokusNfc, 250)}
            placeholder="10 huruf di bawah QR kartu"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={200}
            className={cn(isian, "h-11 min-w-0 flex-1 font-mono uppercase")}
          />
          <button type="submit" disabled={!ketik.trim()} className={cn(tombolUtama, "h-11")}>Catat</button>
        </div>
      </form>

      {/* riwayat perangkat ini */}
      <section className={cn(kartu, "overflow-hidden")}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 className={labelMikro}>Tap terakhir di perangkat ini</h2>
          {antrean.length > 0 && (
            <button type="button" onClick={() => void kirimAntrean()} className={cn(tombolGaris, "h-8")}>Kirim sekarang</button>
          )}
        </div>
        {riwayat.length === 0 ? (
          <p className="px-4 pb-4 text-14 text-ink-muted">Belum ada tap.</p>
        ) : (
          <ul className="divide-y divide-border">
            {riwayat.map((r) => (
              <li key={r.klienId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-11 shrink-0 text-14 font-semibold tabular-nums">{jamTap(r)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-14 font-medium">{r.jawaban?.nama ?? (r.lokal ? "QR asing" : r.dibaca)}</div>
                  <div className="truncate text-12 text-ink-muted">
                    {LABEL_METODE[r.metode]}
                    {r.jawaban?.sesi ? ` · Sesi ${LABEL_SESI[r.jawaban.sesi]}` : ""}
                    {r.keadaan === "sudah" && r.jawaban?.jam ? ` · pertama ${jamTitik(r.jawaban.jam)}` : ""}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-11 font-semibold", toneBadgeClass[NADA_RIWAYAT[r.keadaan]])}>{LABEL_KEADAAN[r.keadaan]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  if (!kiosk) return isi;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-20 font-bold tracking-[-0.02em]">Kiosk kehadiran</h1>
          {urlKeluar && (
            <Link href={urlKeluar} className={cn(tombolGaris, "h-10")}>
              <LogOut className="size-4" /> Keluar kiosk
            </Link>
          )}
        </div>
        {isi}
      </div>
    </div>
  );
}
