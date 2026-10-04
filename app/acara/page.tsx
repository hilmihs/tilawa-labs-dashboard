import Link from "next/link";
import { ChartColumn, ClipboardList, ListChecks, QrCode, ScanLine, Tags, Users } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { KepalaHalaman, kartu, labelMikro, tombolGaris } from "@/components/lintas/brand";
import { requireStaff } from "@/lib/acara/access";
import { listAcara } from "@/lib/acara/queries";
import { listKlasifikasi, listSeri } from "@/lib/hadir/queries-golongan";
import { listTanggalLepas } from "@/lib/hadir/queries-lepas";
import { hitungKehadiranPerAcara } from "@/lib/hadir/queries";
import { hMinus } from "@/lib/acara/view-model";
import { todayJakarta } from "@/lib/time/jakarta";
import { cn } from "@/lib/utils";
import { BuatAcaraForm } from "./BuatAcaraForm";
import { TarikSemuaNawa } from "./TarikNawa";

export const metadata = { title: "Acara" };
export const dynamic = "force-dynamic";

const BLN = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** "2026-09-26" → { hari: 26, bln: "SEP", panjang: "Jum, 26 Sep 2026" } — tanggal kalender, bukan instan. */
function tanggal(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const m = d.getUTCMonth();
  return {
    hari: d.getUTCDate(),
    bln: BLN[m],
    panjang: `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[m]} ${d.getUTCFullYear()}`,
  };
}

const jarakHari = (h: number) => (h > 0 ? `H-${h}` : h === 0 ? "Hari-H" : `H+${-h}`);

function Petak({ iso, className }: { iso: string; className?: string }) {
  const t = tanggal(iso);
  return (
    <div className={cn("flex size-[52px] shrink-0 flex-col items-center justify-center rounded-[11px]", className)}>
      <span className="text-[10px] tracking-[0.09em] opacity-75">{t.bln}</span>
      <span className="text-20 font-bold leading-none">{t.hari}</span>
    </div>
  );
}

export default async function AcaraListPage() {
  const user = await requireStaff();
  const [rows, golongan, seriAda, lepas, hitung] = await Promise.all([
    listAcara(),
    listKlasifikasi({ hanyaAktif: true }),
    listSeri(),
    listTanggalLepas(),
    hitungKehadiranPerAcara(),
  ]);
  const today = todayJakarta();
  // listAcara urut tanggal menurun; yang akan datang dibalik supaya terdekat dulu.
  const akanDatang = rows.filter((a) => a.tanggal >= today).reverse();
  const lewat = rows.filter((a) => a.tanggal < today);
  const [sorot, ...berikutnya] = akanDatang;

  return (
    <AppShell email={user.email} title="Acara" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 sm:px-8 sm:py-7">
        <KepalaHalaman
          judul="Acara"
          aksi={
            <>
              <Link href="/acara/rekap" className={tombolGaris}>
                <ChartColumn className="size-4" /> Rekap kajian
              </Link>
              <Link href="/acara/orang" className={tombolGaris}>
                <Users className="size-4" /> Direktori orang
              </Link>
              <Link href="/acara/golongan" className={tombolGaris}>
                <Tags className="size-4" /> Golongan
              </Link>
            </>
          }
        >
          Administrasi kepanitiaan dan presensi kajian. Acara berkepanitiaan penuh dibuat lewat seed; kajian biasa lewat formulir di bawah.
        </KepalaHalaman>

        {lepas.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-14 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <ScanLine className="size-[18px] shrink-0 text-amber-700 dark:text-amber-300" />
            <span className="min-w-0 flex-1">
              <b>Ada scan belum bertaut</b> ·{" "}
              {lepas.map((l, i) => (
                <span key={l.tanggal}>
                  {i > 0 && " · "}
                  {tanggal(l.tanggal).panjang.replace(/ \d{4}$/, "")} ({l.jumlah} orang)
                </span>
              ))}
            </span>
            <Link
              href="/acara/hadir-lepas"
              className="inline-flex h-[30px] items-center rounded-lg border border-amber-500 bg-card px-3 text-12 font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              Tautkan ke kegiatan
            </Link>
          </div>
        )}

        {rows.length === 0 ? (
          <p className={cn(kartu, "px-4 py-8 text-center text-14 text-ink-muted")}>Belum ada acara.</p>
        ) : (
          <section className={cn("grid gap-4", sorot && "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]")}>
            {sorot && (
              <div className="flex flex-col gap-2.5">
                <div className={labelMikro}>Akan datang</div>
                <div className="relative flex flex-1 flex-col gap-4 rounded-2xl bg-brand-forest p-5 text-white">
                  <div className="flex items-start justify-between">
                    <Petak iso={sorot.tanggal} className="h-[62px] w-[58px] bg-white/10 text-white" />
                    <span className="rounded-full bg-brand-gold px-2.5 py-1 font-mono text-12 font-medium text-brand-ink">
                      {jarakHari(hMinus(sorot.tanggal, today))}
                    </span>
                  </div>
                  <div>
                    <Link
                      href={`/acara/${sorot.slug}`}
                      className="text-20 font-semibold tracking-[-0.01em] after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-gold"
                    >
                      {sorot.nama}
                    </Link>
                    <div className="mt-1 text-12 text-white/70">
                      {tanggal(sorot.tanggal).panjang}
                      {sorot.pemateri && ` · ${sorot.pemateri}`} · {sorot.status}
                    </div>
                  </div>
                  <div className="relative z-10 mt-auto flex flex-wrap gap-2 text-12">
                    {[
                      { href: "tugas", label: "Tugas", Icon: ListChecks },
                      { href: "pendaftaran", label: "Pendaftaran", Icon: ClipboardList },
                      { href: "scan", label: "Scan", Icon: QrCode },
                    ].map(({ href, label, Icon }) => (
                      <Link
                        key={href}
                        href={`/acara/${sorot.slug}/${href}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
                      >
                        <Icon className="size-3.5" /> {label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-2.5">
              {berikutnya.length > 0 && (
                <>
                  <div className={labelMikro}>Berikutnya</div>
                  <DaftarAcara acara={berikutnya} today={today} hitung={hitung} />
                </>
              )}
              <div className={labelMikro}>Sudah lewat</div>
              {lewat.length === 0 ? (
                <p className={cn(kartu, "px-4 py-6 text-center text-14 text-ink-muted")}>Belum ada acara yang lewat.</p>
              ) : (
                <DaftarAcara acara={lewat} today={today} hitung={hitung} />
              )}
            </div>
          </section>
        )}

        <BuatAcaraForm golongan={golongan.map((g) => ({ id: g.id, nama: g.nama }))} seriAda={seriAda} />

        <section className={cn(kartu, "flex flex-col gap-3 px-4 py-5 sm:px-[22px]")}>
          <div>
            <div className={labelMikro}>Open Lecture · Events</div>
            <p className="mt-1 text-14 text-ink-muted">
              Pendaftar dan kehadiran the open lecture diurus di events.tilawalabs.demo. Satu tarikan menyalin semua program (kecuali draft & batal) ke acara <code>nawa-&lt;slug&gt;</code> masing-masing — program baru muncul sendiri. Peserta dicocokkan ke direktori orang lewat WA lalu nama.
            </p>
          </div>
          <TarikSemuaNawa slugAwal={process.env.NAWA_ACARA_SLUG ?? ""} />
        </section>
      </main>
    </AppShell>
  );
}

type AcaraBaris = Awaited<ReturnType<typeof listAcara>>[number];

function DaftarAcara({
  acara,
  today,
  hitung,
}: {
  acara: AcaraBaris[];
  today: string;
  hitung: Map<string, { hadir: number; terdaftar: number }>;
}) {
  return (
    <ul className={cn(kartu, "divide-y divide-border overflow-hidden")}>
      {acara.map((a) => {
        const n = hitung.get(a.id);
        const pct = n && n.terdaftar > 0 ? Math.round((n.hadir / n.terdaftar) * 100) : null;
        return (
          <li key={a.id} className="relative flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-neutral-50 sm:px-[18px] dark:hover:bg-neutral-800/40">
            <Petak iso={a.tanggal} className="bg-neutral-100 text-foreground dark:bg-neutral-800" />
            <div className="min-w-0 flex-1">
              <Link
                href={`/acara/${a.slug}`}
                className="text-14 font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
              >
                {a.nama}
              </Link>
              <div className="mt-0.5 truncate text-12 text-ink-muted">
                {tanggal(a.tanggal).panjang}
                {a.pemateri && ` · ${a.pemateri}`} · {a.status}
              </div>
            </div>
            {n && n.hadir > 0 && (
              <div className="hidden flex-col items-end gap-1.5 sm:flex">
                <span className="text-12 tabular-nums text-neutral-700 dark:text-neutral-300">
                  <b>{n.hadir}</b>
                  {pct != null && n.terdaftar !== n.hadir && ` / ${n.terdaftar}`} hadir
                </span>
                {pct != null && (
                  <div
                    className="h-[5px] w-[120px] overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
                    role="img"
                    aria-label={`${pct}% hadir`}
                  >
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            )}
            <span className="w-12 shrink-0 text-right font-mono text-12 text-ink-muted">{jarakHari(hMinus(a.tanggal, today))}</span>
          </li>
        );
      })}
    </ul>
  );
}
