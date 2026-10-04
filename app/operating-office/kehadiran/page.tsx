import { ChevronLeft, ChevronRight, FileSpreadsheet, Printer, ScanLine, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { KartuAngka, KepalaHalaman, kartu, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import { requireSuperUser } from "@/lib/auth/require";
import { getKantor } from "@/lib/kantor/queries";
import { hariDalamBulan, susunLogbook } from "@/lib/kerja/logbook";
import {
  bulanAtauIni,
  geserBulan,
  hitungHariIni,
  labelRentang,
  namaBulan,
  pekanAktif,
  pekanBulan,
  ringkasBulan,
  totalPerOrang,
} from "@/lib/kerja/logbook-view";
import { batasKantor, hadirRentang, listAnggota } from "@/lib/kerja/queries";
import { sesiDari } from "@/lib/kerja/sesi";
import { LABEL_SESI, SESI } from "@/lib/kerja/types";
import { getNewsNav } from "@/lib/news/auth";
import { jakartaDate, jamWib } from "@/lib/time/jakarta";
import { cn } from "@/lib/utils";
import { Logbook } from "./Logbook";

export const dynamic = "force-dynamic";
export const metadata = { title: "Logbook kehadiran pengurus" };

/**
 * Logbook kehadiran pengurus di layar — pengganti lembar kertas "Logbook
 * Kehadiran Pengurus Pendidikan". Satu bulan per halaman, tabel satu pekan
 * (Senin–Ahad) sekali tampil; lihat pekanBulan untuk alasannya. Lembar cetak
 * (5 tanggal per halaman) ada di ./cetak.
 */
export default async function LogbookKehadiranPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; minggu?: string }>;
}) {
  const user = await requireSuperUser();
  const sp = await searchParams;
  const sekarang = new Date();
  const hariIni = jakartaDate(sekarang);
  const bulan = bulanAtauIni(sp.bulan, hariIni);
  const hariBulan = hariDalamBulan(bulan);
  const pekan = pekanBulan(bulan);
  const iPekan = pekanAktif(pekan, sp.minggu, hariIni);
  const hari = pekan[iPekan];
  const bulanIni = bulan === hariIni.slice(0, 7);

  const [news, kantor, anggota, hadir, hadirHariIni] = await Promise.all([
    getNewsNav(user),
    getKantor(),
    listAnggota(),
    hadirRentang(hariBulan[0], hariBulan[hariBulan.length - 1]),
    // Kartu "hari ini" tetap tentang hari ini walau bulan lain yang dibuka.
    bulanIni ? Promise.resolve(null) : hadirRentang(hariIni, hariIni),
  ]);

  const ids = anggota.map((a) => a.orangId);
  const lb = susunLogbook(anggota, hadir, hari);
  const idSet = new Set(ids);
  const totalBulan = Object.fromEntries(totalPerOrang(hadir.filter((h) => idSet.has(h.orangId))));
  const r = ringkasBulan(ids, hadir, hariIni);
  const kini = hitungHariIni(ids, hadirHariIni ?? hadir, hariIni);
  const batas = batasKantor(kantor);
  const sesiKini = sesiDari(sekarang, batas);
  const nIkhwan = anggota.filter((a) => a.gender !== "P").length;

  const href = (b: string, m?: number) => `/operating-office/kehadiran?bulan=${b}${m ? `&minggu=${m}` : ""}`;
  const navBulan = "inline-flex size-9 items-center justify-center rounded-[9px] border border-border-strong/60 bg-card hover:border-border-strong";

  return (
    <AppShell
      email={user.email}
      title="Logbook kehadiran"
      railItems={divisionRail({ isSuper: true, kabar: news.kabar, kurasi: news.kurasi, includeOverview: true })}
    >
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 pt-6 pb-14 sm:px-8 sm:pt-7">
        <KepalaHalaman
          judul="Logbook kehadiran pengurus"
          aksi={
            <>
              <Link href="/scan?kiosk=1" className={tombolUtama}>
                <ScanLine className="size-4" /> Buka kiosk
              </Link>
              <Link href={`/operating-office/kehadiran/cetak?bulan=${bulan}`} className={tombolGaris}>
                <Printer className="size-3.5" /> Cetak logbook
              </Link>
              <a href={`/operating-office/kehadiran/unduh?bulan=${bulan}`} className={tombolGaris}>
                <FileSpreadsheet className="size-3.5" /> Unduh Excel
              </a>
              <Link href="/operating-office/pengurus" className={tombolGaris}>
                <Users className="size-3.5" /> Kelola pengurus
              </Link>
            </>
          }
        >
          Pengurus Pendidikan · jam datang per sesi (WIB) dari tap kartu. P = Pagi {batas.pagiMulai}, Si = Siang {batas.siangMulai}, Sr =
          Sore {batas.soreMulai}–{batas.selesai}.
        </KepalaHalaman>

        {/* ── Bulan/Tahun ────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href(geserBulan(bulan, -1))} className={navBulan} aria-label="Bulan sebelumnya">
            <ChevronLeft className="size-4" />
          </Link>
          <h2 className="min-w-[150px] text-center text-20 font-semibold">{namaBulan(bulan)}</h2>
          <Link href={href(geserBulan(bulan, 1))} className={navBulan} aria-label="Bulan berikutnya">
            <ChevronRight className="size-4" />
          </Link>
          {!bulanIni && (
            <Link href={href(hariIni.slice(0, 7))} className="ml-1 text-12 text-primary hover:underline">
              Bulan ini
            </Link>
          )}
          <form className="ml-auto flex items-center gap-1.5" action="/operating-office/kehadiran">
            <label className="sr-only" htmlFor="pilih-bulan">
              Pilih bulan
            </label>
            <input
              id="pilih-bulan"
              type="month"
              name="bulan"
              defaultValue={bulan}
              className="h-9 rounded-[9px] border border-border-strong/60 bg-card px-2 text-12 tabular-nums"
            />
            <button className={cn(tombolGaris, "px-2.5")}>Buka</button>
          </form>
        </div>

        {anggota.length === 0 ? (
          <section className={cn(kartu, "flex flex-col items-start gap-3 px-5 py-8")}>
            <h2 className="text-16 font-semibold">Belum ada pengurus di logbook</h2>
            <p className="max-w-xl text-14 text-ink-muted">
              Tambahkan daftar pengurus Ikhwan dan Akhwat dulu, lalu cetak kartu QR mereka. Setelah itu setiap tap di kiosk mengisi logbook
              ini otomatis.
            </p>
            <Link href="/operating-office/pengurus" className={tombolUtama}>
              <Users className="size-4" /> Kelola pengurus
            </Link>
          </section>
        ) : (
          <>
            {/* ── Angka ──────────────────────────────────────────── */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KartuAngka label="Anggota aktif" nilai={anggota.length} catatan={`${nIkhwan} ikhwan · ${anggota.length - nIkhwan} akhwat`} />
              <KartuAngka
                label={bulanIni ? "Sesi terisi bulan ini" : `Sesi terisi ${namaBulan(bulan)}`}
                nilai={r.sesiTerisi}
                catatan={r.sesiTerisi ? `${r.lewatKartu} kartu · ${r.manual} manual` : undefined}
              />
              <KartuAngka
                label="Rata-rata kehadiran"
                nilai={r.persen == null ? "—" : `${r.persen}%`}
                catatan={r.hariBuka ? `sesi terisi dari 3 tap × ${r.hariBuka} hari kantor buka` : "belum ada isian"}
              />
              <KartuAngka label={`Hari ini · ${jamWib(sekarang)}`} nilai={kini.orang} catatan={`dari ${anggota.length} sudah tap`}>
                <div className="mt-2 flex flex-wrap gap-1.5 text-11 tabular-nums">
                  {SESI.map((s) => (
                    <span
                      key={s}
                      className={cn(
                        "rounded-full px-2 py-0.5",
                        s === sesiKini ? "bg-primary text-primary-foreground" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
                      )}
                    >
                      {LABEL_SESI[s]} {kini[s]}
                    </span>
                  ))}
                </div>
              </KartuAngka>
            </section>

            {/* ── Pekan ──────────────────────────────────────────── */}
            <nav aria-label="Pekan" className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-12 text-ink-muted">Pekan</span>
              {pekan.map((p, i) => (
                <Link
                  key={p[0]}
                  href={href(bulan, i + 1)}
                  aria-current={i === iPekan ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3 text-12 tabular-nums",
                    i === iPekan
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border-strong/60 bg-card hover:border-border-strong",
                    p.includes(hariIni) && i !== iPekan && "font-semibold text-primary",
                  )}
                >
                  {labelRentang(p)}
                </Link>
              ))}
            </nav>

            <Logbook
              hari={lb.hari}
              ikhwan={lb.ikhwan}
              akhwat={lb.akhwat}
              hariIni={hariIni}
              totalBulan={totalBulan}
              batas={batas}
            />
          </>
        )}
      </main>
    </AppShell>
  );
}
