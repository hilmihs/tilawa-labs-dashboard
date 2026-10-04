import { AlertTriangle, CalendarDays, FileSpreadsheet, MapPin, PenLine, Settings2 } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { Inisial, KepalaHalaman, kartu, labelMikro } from "@/components/lintas/brand";
import { Badge } from "@/components/ui/badge";
import { requireSuperUser } from "@/lib/auth/require";
import { getNewsNav } from "@/lib/news/auth";
import { baseUrl } from "@/lib/hadir/base-url";
import { statusHari } from "@/lib/kantor/aturan";
import { izinAktif, terlambat } from "@/lib/kantor/izin";
import { absenRentang, getKantor, izinRentang, listPetugas, type Absen, type Izin } from "@/lib/kantor/queries";
import { diffDaysISO, jakartaDate, jamWib } from "@/lib/time/jakarta";
import type { StatusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";
import { CatatManual } from "./CatatManual";
import { KelolaIzin, type BarisIzin } from "./KelolaIzin";
import { KelolaPetugas } from "./KelolaPetugas";
import { SetelKantor } from "./SetelKantor";
import { PanelKehadiran } from "./_kehadiran/PanelKehadiran";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operating Office" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function menit(a: Date, b: Date): string {
  const m = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
  return `${Math.floor(m / 60)} j ${m % 60} m`;
}

function durasi(a: Date | null, b: Date | null): string {
  return a && b ? menit(a, b) : "—";
}

const ALASAN: Record<string, string> = { sakit: "Sakit", keluarga: "Urusan keluarga", safar: "Safar", lain: "Lainnya" };

/** "2026-09-29" → "Sel, 29 Sep" (tahun ikut bila `tahun`). Tanggal ISO dibaca sebagai tanggal kalender, bukan instan. */
function tgl(iso: string, tahun = false): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(tahun ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function tglJam(d: Date): string {
  return `${tgl(jakartaDate(d))} · ${jamWib(d)}`;
}

function barisIzin(i: Izin, nama: Map<string, string>): BarisIzin {
  const hari = diffDaysISO(i.sampai, i.dari) + 1;
  return {
    id: i.id,
    petugas: nama.get(i.petugasId) ?? "?",
    rentang: i.dari === i.sampai ? tgl(i.dari) : `${tgl(i.dari)} – ${tgl(i.sampai)}`,
    hari,
    alasan: ALASAN[i.alasan] ?? i.alasan,
    catatan: i.catatan,
    status: i.status,
    dikabarkan: tglJam(i.dibuatAt),
  };
}

// ── Garis waktu 06:00–22:00 (masyaikh sore pulang malam) ────────────────
const AWAL = 6 * 60;
const RENTANG = 16 * 60;
const JAM_GRID = ["06", "08", "10", "12", "14", "16", "18", "20", "22"];

/** "08:14" → 494 menit sejak tengah malam. */
function keMenit(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Posisi (persen) sebuah menit pada garis 06–22, dijepit ke 0–100. */
function posisi(m: number): number {
  return Math.min(100, Math.max(0, ((m - AWAL) / RENTANG) * 100));
}

function Titik({ a }: { a: Absen | undefined }) {
  if (!a) return null;
  if (a.dicatatOleh)
    return (
      <span className="inline-flex items-center gap-0.5 text-11 text-ink-muted" title={`Dicatat manual oleh ${a.dicatatOleh}`}>
        <PenLine className="size-3" /> manual
      </span>
    );
  return (
    <a
      className="inline-flex items-center gap-0.5 text-11 text-ink-muted hover:text-primary hover:underline"
      target="_blank"
      rel="noreferrer"
      title="Lihat titik absen di Google Maps"
      href={`https://www.google.com/maps?q=${a.lat},${a.lng}`}
    >
      <MapPin className="size-3" />± {Math.round(a.jarakM)} m dari titik
    </a>
  );
}

type Keadaan = { label: string; tone: StatusTone; titik: string };

export default async function OperatingOfficePage({
  searchParams,
}: {
  searchParams: Promise<{ dari?: string; sampai?: string }>;
}) {
  const user = await requireSuperUser();
  const sp = await searchParams;
  const sekarang = new Date();
  const hariIni = jakartaDate(sekarang);
  const dari = sp.dari && ISO.test(sp.dari) ? sp.dari : `${hariIni.slice(0, 7)}-01`;
  const sampai = sp.sampai && ISO.test(sp.sampai) ? sp.sampai : hariIni;

  const [news, kantor, petugas, absen, base, izinRiwayat] = await Promise.all([
    getNewsNav(user),
    getKantor(),
    listPetugas(),
    absenRentang(dari < hariIni ? dari : hariIni, sampai > hariIni ? sampai : hariIni),
    baseUrl(),
    // Kabar mendatang selalu ikut, supaya terlihat sebelum harinya tiba.
    izinRentang(dari < hariIni ? dari : hariIni, "9999-12-31"),
  ]);
  const izinHariIni = (pid: string) =>
    izinRiwayat.find((i) => i.petugasId === pid && izinAktif(i.status) && i.dari <= hariIni && i.sampai >= hariIni);
  const nama = new Map(petugas.map((p) => [p.id, p.namaLatin]));
  // Jadwal masuk per syaikh; riwayat lama dinilai dengan jadwal yang berlaku sekarang.
  const jadwal = new Map(petugas.map((p) => [p.id, p.jamMasuk]));
  const per = (pid: string, t: string) => absen.filter((a) => a.petugasId === pid && a.tanggal === t);
  const telat = (pid: string, masuk: Date | null) => masuk != null && terlambat(jamWib(masuk), jadwal.get(pid) ?? "00:00");
  const menitTelat = (pid: string, masuk: Date) => keMenit(jamWib(masuk)) - keMenit(jadwal.get(pid) ?? "00:00");

  const menitSekarang = keMenit(jamWib(sekarang));
  const posSekarang = menitSekarang >= AWAL && menitSekarang <= AWAL + RENTANG ? posisi(menitSekarang) : null;

  const aktif = petugas.filter((p) => p.aktif);
  const hari = aktif.map((p) => {
    const rows = per(p.id, hariIni);
    const h = statusHari(rows);
    const iz = izinHariIni(p.id);
    const keadaan: Keadaan = h.keluar
      ? { label: "Sudah pulang", tone: "info", titik: "bg-blue-400" }
      : h.masuk
        ? { label: "Di kantor", tone: "success", titik: "bg-emerald-500" }
        : iz
          ? { label: `Berhalangan · ${(ALASAN[iz.alasan] ?? iz.alasan).toLowerCase()}`, tone: "indigo", titik: "bg-[#8a5a82]" }
          : { label: "Belum hadir", tone: "neutral", titik: "bg-neutral-300 dark:bg-neutral-600" };
    return { p, rows, h, iz, keadaan };
  });
  const hitung = {
    diKantor: hari.filter((x) => x.h.masuk && !x.h.keluar).length,
    pulang: hari.filter((x) => x.h.keluar).length,
    izin: hari.filter((x) => !x.h.masuk && x.iz).length,
    belum: hari.filter((x) => !x.h.masuk && !x.iz).length,
    telat: hari.filter((x) => telat(x.p.id, x.h.masuk)).length,
  };

  const riwayatHari = [...new Set(absen.filter((a) => a.tanggal >= dari && a.tanggal <= sampai).map((a) => a.tanggal))].sort().reverse();
  const riwayat = riwayatHari
    .map((t) => ({
      t,
      rows: petugas.flatMap((p) => {
        const rows = per(p.id, t);
        const h = statusHari(rows);
        return h.masuk || h.keluar ? [{ p, h, manual: rows.some((a) => a.dicatatOleh) }] : [];
      }),
    }))
    .filter((d) => d.rows.length > 0);
  const jumlahCatatan = riwayat.reduce((n, d) => n + d.rows.length, 0);

  const kpi = [
    {
      label: "Di kantor",
      nilai: hitung.diKantor,
      catatan: hitung.telat ? `${hitung.telat} terlambat` : null,
      catatanNada: "text-warn",
      garis: "bg-emerald-500",
    },
    { label: "Sudah pulang", nilai: hitung.pulang, catatan: null, catatanNada: "", garis: "bg-blue-400" },
    { label: "Berhalangan", nilai: hitung.izin, catatan: null, catatanNada: "", garis: "bg-[#8a5a82]" },
    {
      label: "Belum hadir",
      nilai: hitung.belum,
      catatan: `dari ${aktif.length} syaikh aktif`,
      catatanNada: "text-ink-muted",
      garis: "bg-neutral-300 dark:bg-neutral-600",
    },
  ];

  return (
    <AppShell
      email={user.email}
      title="Operating Office"
      railItems={divisionRail({ isSuper: true, kabar: news.kabar, kurasi: news.kurasi, includeOverview: true })}
    >
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 pt-6 pb-14 sm:px-8 sm:pt-7">
        <KepalaHalaman
          judul="Kehadiran masyaikh"
          aksi={
            <div className="flex h-9 flex-wrap items-center gap-3 rounded-full border border-neutral-300 bg-card px-3.5 text-12 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
              {kantor.lat != null && (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-ok" /> Radius {kantor.radiusM} m
                  </span>
                  <span aria-hidden className="h-3.5 w-px bg-border" />
                </>
              )}
              <a href="#pengaturan" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                <Settings2 className="size-3.5" /> Pengaturan
              </a>
            </div>
          }
        >
          {tgl(hariIni, true)} · jam dicatat server (WIB)
        </KepalaHalaman>

        {kantor.lat == null && (
          <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              <b>Titik kantor belum disetel — semua absen akan ditolak.</b> Buka halaman ini di Rumah Belajar lalu tekan
              “Lokasi saya” di <a className="underline" href="#pengaturan">Pengaturan</a>.
            </p>
          </div>
        )}

        {/* ── Angka hari ini ─────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpi.map((k) => (
            <div key={k.label} className={cn(kartu, "relative min-w-0 overflow-hidden px-[18px] py-4")}>
              <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", k.garis)} />
              <div className={labelMikro}>{k.label}</div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{k.nilai}</span>
                {k.catatan && <span className={cn("text-12", k.catatanNada)}>{k.catatan}</span>}
              </div>
            </div>
          ))}
        </section>

        <PanelKehadiran />

        {/* ── Hari ini ───────────────────────────────────────────── */}
        <section className={cn(kartu, "overflow-hidden")}>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
            <h2 className="text-16 font-semibold">Hari ini</h2>
            <span className="flex items-center gap-1.5 font-mono text-12 text-ink-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-red-600" />
              sekarang {jamWib(sekarang)}
            </span>
          </div>
          {aktif.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-muted">
              Belum ada syaikh aktif. Tambahkan di <a className="text-primary hover:underline" href="#pengaturan">Pengaturan</a>.
            </p>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(220px,1fr)_minmax(280px,1.6fr)_230px] items-center border-b border-border bg-neutral-50 px-5 py-2 md:grid dark:bg-neutral-900/50">
                <span className={labelMikro}>Syaikh</span>
                <div className="flex justify-between px-1 font-mono text-11 text-ink-muted" aria-hidden>
                  {JAM_GRID.map((j) => (
                    <span key={j}>{j}</span>
                  ))}
                </div>
                <div className={cn(labelMikro, "grid grid-cols-3 gap-2 pl-5")}>
                  <span>Masuk</span>
                  <span>Keluar</span>
                  <span>Durasi</span>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {hari.map(({ p, rows, h, iz, keadaan }) => {
                  const mMasuk = h.masuk ? keMenit(jamWib(h.masuk)) : null;
                  const mAkhir = h.keluar ? keMenit(jamWib(h.keluar)) : menitSekarang;
                  const kiri = mMasuk != null ? posisi(mMasuk) : 0;
                  const lebar = mMasuk != null ? Math.max(0.8, posisi(mAkhir) - kiri) : 0;
                  const isTelat = telat(p.id, h.masuk);
                  const posDinas = posisi(keMenit(p.jamMasuk));
                  return (
                    <li
                      key={p.id}
                      className="grid grid-cols-1 items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-5 md:grid-cols-[minmax(220px,1fr)_minmax(280px,1.6fr)_230px] md:gap-x-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Inisial nama={p.namaLatin} className="bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                          <span
                            className={cn("absolute -right-px -bottom-px size-[11px] rounded-full border-2 border-card", keadaan.titik)}
                          />
                        </Inisial>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-14 font-semibold">{p.namaLatin}</span>
                            <span dir="rtl" lang="ar" className="text-14 text-ink-muted">
                              {p.namaArab}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge tone={keadaan.tone} className="text-11">
                              {keadaan.label}
                            </Badge>
                            {isTelat && h.masuk && (
                              <Badge tone="warning" className="text-11">
                                Terlambat {menitTelat(p.id, h.masuk)} m
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        className="relative mx-1 hidden h-[26px] rounded-[7px] bg-neutral-50 md:block dark:bg-neutral-900"
                        aria-label={
                          h.masuk
                            ? `Masuk ${jamWib(h.masuk)}${h.keluar ? `, keluar ${jamWib(h.keluar)}` : ", masih di kantor"}`
                            : iz
                              ? "Berhalangan, sudah dikabarkan"
                              : `Belum absen, jadwal masuk ${p.jamMasuk}`
                        }
                        role="img"
                      >
                        {/* Garis tiap 2 jam — elemen sendiri, gradien berulang berpersen hilang sebagian di Chrome. */}
                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <span key={i} aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ left: `${(i / 8) * 100}%` }} />
                        ))}
                        <span
                          aria-hidden
                          className="absolute -top-1 -bottom-1 w-0 border-l-[1.5px] border-dashed border-neutral-400"
                          style={{ left: `${posDinas}%` }}
                        />
                        {posSekarang != null && (
                          <span
                            aria-hidden
                            className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-sm bg-red-600 dark:bg-red-400"
                            style={{ left: `${posSekarang}%` }}
                          />
                        )}
                        {mMasuk != null ? (
                          <span
                            aria-hidden
                            className={cn(
                              "absolute top-[5px] bottom-[5px] rounded-[5px]",
                              isTelat
                                ? "bg-gradient-to-r from-amber-500 from-0% to-emerald-500 to-30%"
                                : h.keluar
                                  ? "bg-blue-300 dark:bg-blue-400"
                                  : "bg-emerald-500",
                            )}
                            style={{ left: `${kiri}%`, width: `${lebar}%` }}
                          />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-11 text-ink-muted">
                            {iz ? "Berhalangan (dikabarkan)" : `Belum absen · jadwal ${p.jamMasuk}`}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 tabular-nums md:pl-5">
                        <div>
                          <div className={cn(labelMikro, "md:hidden")}>Masuk</div>
                          <div className={cn("text-14 font-semibold", !h.masuk && "text-ink-faint", isTelat && "text-warn")}>
                            {h.masuk ? jamWib(h.masuk) : "—"}
                          </div>
                          <Titik a={rows.find((r) => r.jenis === "masuk")} />
                        </div>
                        <div>
                          <div className={cn(labelMikro, "md:hidden")}>Keluar</div>
                          <div className={cn("text-14 font-semibold", !h.keluar && "text-ink-faint")}>
                            {h.keluar ? jamWib(h.keluar) : "—"}
                          </div>
                          <Titik a={rows.find((r) => r.jenis === "keluar")} />
                        </div>
                        <div>
                          <div className={cn(labelMikro, "md:hidden")}>Durasi</div>
                          <div className={cn("text-14 font-semibold", !h.masuk && "text-ink-faint")}>
                            {h.masuk ? menit(h.masuk, h.keluar ?? sekarang) : "—"}
                          </div>
                          {h.masuk && !h.keluar && <div className="text-11 text-ok">berjalan</div>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden flex-wrap gap-4 border-t border-border bg-neutral-50 px-5 py-2.5 text-11 text-ink-muted md:flex dark:bg-neutral-900/50">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="w-3.5 border-t-[1.5px] border-dashed border-neutral-400" />
                  jadwal masuk
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-3 w-0.5 rounded-sm bg-red-600 dark:bg-red-400" />
                  sekarang
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-[3px] bg-emerald-500" />
                  di kantor
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-[3px] bg-blue-300 dark:bg-blue-400" />
                  sudah pulang
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-[3px] bg-amber-500" />
                  terlambat
                </span>
              </div>
            </>
          )}
        </section>

        {/* ── Izin + Riwayat ─────────────────────────────────────── */}
        <section className="grid items-start gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <h2 className="text-16 font-semibold">Kabar tidak hadir</h2>
              <p className="text-12 text-ink-muted">Dikirim masyaikh lewat tautan absen — tercatat tanpa persetujuan.</p>
            </div>
            <KelolaIzin izin={izinRiwayat.map((i) => barisIzin(i, nama))} />
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-16 font-semibold">Riwayat absen</h2>
                <p className="text-12 text-ink-muted">
                  {jumlahCatatan} catatan · {riwayat.length} hari
                </p>
              </div>
              <form className="flex flex-wrap items-center gap-1.5">
                <label className="flex h-8 items-center gap-1.5 rounded-[9px] border border-border-strong/60 bg-card px-2 text-12">
                  <CalendarDays className="size-3.5 text-ink-muted" aria-hidden />
                  <span className="sr-only">Dari</span>
                  <input type="date" name="dari" defaultValue={dari} className="bg-transparent tabular-nums outline-none" />
                  <span className="text-ink-muted">–</span>
                  <span className="sr-only">Sampai</span>
                  <input type="date" name="sampai" defaultValue={sampai} className="bg-transparent tabular-nums outline-none" />
                </label>
                <button className="h-8 rounded-[9px] border border-border-strong/60 bg-card px-2.5 text-12 font-medium hover:border-border-strong">
                  Tampilkan
                </button>
                <a
                  className="inline-flex h-8 items-center gap-1 rounded-[9px] px-2 text-12 text-primary hover:underline"
                  href={`/api/kantor/xlsx?dari=${dari}&sampai=${sampai}`}
                >
                  <FileSpreadsheet className="size-3.5" /> xlsx
                </a>
              </form>
              <CatatManual
                masyaikh={aktif.map((p) => ({ id: p.id, namaLatin: p.namaLatin, jamMasuk: p.jamMasuk }))}
                hariIni={hariIni}
              />
            </div>
            <div className={cn(kartu, "max-h-[60vh] overflow-y-auto")}>
              {riwayat.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">Belum ada absen di rentang ini.</p>
              ) : (
                riwayat.map((d) => {
                  const nTelat = d.rows.filter((r) => telat(r.p.id, r.h.masuk)).length;
                  return (
                    <div key={d.t}>
                      <div className="sticky top-0 flex justify-between gap-2 border-b border-border bg-neutral-50 px-4 py-2 text-12 font-semibold text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                        <span>{tgl(d.t)}</span>
                        <span className="font-normal text-ink-muted">
                          {d.rows.length} hadir{nTelat > 0 && ` · ${nTelat} terlambat`}
                        </span>
                      </div>
                      {d.rows.map(({ p, h, manual }) => {
                        const tt = telat(p.id, h.masuk);
                        return (
                          <div
                            key={p.id}
                            className="grid grid-cols-[1fr_52px_52px_72px] items-center gap-2 border-b border-border/60 px-4 py-2 text-12 tabular-nums sm:text-14"
                          >
                            <span className="min-w-0 truncate">
                              {p.namaLatin}
                              {manual && (
                                <span className="ml-1.5 text-11 text-ink-muted" title="Dicatat manual oleh admin">
                                  · manual
                                </span>
                              )}
                            </span>
                            <span
                              className={cn("text-right", tt && "font-semibold text-warn")}
                              title={tt ? `Lewat jadwal masuk ${p.jamMasuk}` : undefined}
                            >
                              {h.masuk ? jamWib(h.masuk) : "—"}
                            </span>
                            <span className="text-right">{h.keluar ? jamWib(h.keluar) : "—"}</span>
                            <span className="text-right text-ink-muted">{durasi(h.masuk, h.keluar)}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* ── Pengaturan ─────────────────────────────────────────── */}
        <section id="pengaturan" className="flex scroll-mt-20 flex-col gap-3.5 border-t border-neutral-300 pt-6 dark:border-neutral-800">
          <div>
            <h2 className="text-16 font-semibold">Pengaturan</h2>
            <p className="text-12 text-ink-muted">Titik kantor, mas&apos;ul penerima kabar, serta jadwal dan tautan absen tiap syaikh.</p>
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <SetelKantor
              lat={kantor.lat}
              lng={kantor.lng}
              radiusM={kantor.radiusM}
              masulNama={kantor.masulNama}
              masulWa={kantor.masulWa}
            />
            <KelolaPetugas
              petugas={petugas.map((p) => ({
                id: p.id,
                namaArab: p.namaArab,
                namaLatin: p.namaLatin,
                wa: p.wa,
                jamMasuk: p.jamMasuk,
                aktif: p.aktif,
                tautan: `${base}/k/${p.token}`,
              }))}
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
