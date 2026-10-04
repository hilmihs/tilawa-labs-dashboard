import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Download, QrCode, Search, Users, X } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { Inisial, KartuAngka, KepalaHalaman, isian, kartu, labelMikro, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import { requireStaff } from "@/lib/acara/access";
import { listOrang, type OrangRingkas } from "@/lib/orang/cv";
import { LABEL_SUMBER, NADA_SUMBER } from "@/lib/orang/cv-view";
import { listAcara } from "@/lib/acara/queries";
import { listOrangDiLuarAcara } from "@/lib/hadir/queries-ekspor";
import { toneBadgeClass } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Daftar Individu" };
export const dynamic = "force-dynamic";

const NUM = new Intl.NumberFormat("id-ID");
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tglPendek = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
};

const TAB = {
  semua: { label: "Semua", cocok: () => true },
  pengajar: { label: "Pengajar", cocok: (r: OrangRingkas) => r.kategori === "pengajar" },
  pengurus: { label: "Pengurus", cocok: (r: OrangRingkas) => r.kategori === "pengurus" },
  tanpa: { label: "Tanpa akun", cocok: (r: OrangRingkas) => r.jumlahTautan === 0 },
  cek: { label: "Perlu dicek", cocok: (r: OrangRingkas) => r.perluReview },
} as const;
type Tab = keyof typeof TAB;

/**
 * Direktori orang lintas program — pintu masuk CV. Satu baris per manusia,
 * bukan per akun: kolom "akun" menghitung tautan ke tilawah/Mabni/Maahir
 * (lihat scripts/seed-orang-tautan.ts). Tampilan: desain "Overhaul Pengajar
 * Orang Acara Office" (02 Daftar Individu).
 *
 * Peserta kelas tatap muka (kategori 'peserta', ±850 baris dari
 * lib/orang/sinkron-peserta.ts) disembunyikan secara bawaan supaya direktori
 * pengajar/pengurus tidak tenggelam; `?peserta=1` menampilkannya. Pencarian
 * tetap menyebut berapa peserta yang cocok tapi tersembunyi.
 */
export default async function DaftarOrangPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; qr?: string; kecuali?: string | string[]; peserta?: string }>;
}) {
  const user = await requireStaff();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const tab: Tab = sp.tab && sp.tab in TAB ? (sp.tab as Tab) : "semua";
  const kecuali = ([] as string[]).concat(sp.kecuali ?? []).filter((s) => /^[a-z0-9-]{1,120}$/.test(s));
  const qrBuka = sp.qr === "1" || kecuali.length > 0;
  const denganPeserta = sp.peserta === "1";
  const [semua, acaraList, diLuar] = await Promise.all([
    listOrang(q),
    listAcara(),
    kecuali.length ? listOrangDiLuarAcara(kecuali) : Promise.resolve(null),
  ]);
  // Saringan "di luar acara": tabel menampilkan persis orang yang akan masuk zip,
  // supaya bisa diperiksa sebelum diunduh.
  const idDiLuar = diLuar ? new Set(diLuar.map((o) => o.id)) : null;
  const jumlahPeserta = semua.filter((r) => r.kategori === "peserta").length;
  const terlihat = denganPeserta ? semua : semua.filter((r) => r.kategori !== "peserta");
  const dasar = idDiLuar ? terlihat.filter((r) => idDiLuar.has(r.id)) : terlihat;
  const rows = dasar.filter(TAB[tab].cocok);
  const qsKecuali = kecuali.map((s) => `kecuali=${encodeURIComponent(s)}`).join("&");
  const punyaAkun = dasar.filter((r) => r.jumlahTautan > 0).length;
  const perSumber = (["tilawah", "maahir", "mabni"] as const).map((s) => ({
    s,
    n: dasar.filter((r) => r.sumber.includes(s)).length,
  }));

  /** URL /orang dengan parameter sekarang, sebagian ditimpa. */
  const href = (ubah: { q?: string; tab?: Tab; qr?: boolean; kecuali?: string[]; peserta?: boolean }) => {
    const p = new URLSearchParams();
    const qq = ubah.q ?? q;
    const tt = ubah.tab ?? tab;
    const kk = ubah.kecuali ?? kecuali;
    if (qq) p.set("q", qq);
    if (tt !== "semua") p.set("tab", tt);
    if (ubah.qr ?? qrBuka) p.set("qr", "1");
    for (const k of kk) p.append("kecuali", k);
    if (ubah.peserta ?? denganPeserta) p.set("peserta", "1");
    const t = p.toString();
    return t ? `/orang?${t}` : "/orang";
  };

  return (
    <AppShell
      email={user.email}
      title="Daftar Individu"
      railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}
    >
      <main className="mx-auto w-full max-w-[1240px] space-y-[18px] px-4 py-6 sm:px-8 sm:py-7">
        <KepalaHalaman
          judul="Daftar Individu"
          aksi={
            <Link
              href={qrBuka ? href({ qr: false, kecuali: [] }) : href({ qr: true })}
              aria-expanded={qrBuka}
              className={tombolGaris}
            >
              <QrCode className="size-4" aria-hidden /> Unduh kartu QR
              <ChevronDown className={cn("size-3.5 text-ink-faint transition-transform", qrBuka && "rotate-180")} aria-hidden />
            </Link>
          }
        >
          Satu baris per manusia, bukan per akun. Klik nama untuk membuka riwayatnya.
        </KepalaHalaman>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KartuAngka
            label="Orang"
            nilai={NUM.format(dasar.length)}
            catatan={
              [q ? "cocok pencarian" : null, !denganPeserta && jumlahPeserta ? `tanpa ${NUM.format(jumlahPeserta)} peserta kelas` : null]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          />
          <KartuAngka label="Punya akun program" nilai={NUM.format(punyaAkun)} />
          <KartuAngka
            label="Tanpa akun"
            nilai={NUM.format(dasar.length - punyaAkun)}
            nada="text-warn"
            catatan="hanya dari form kajian"
          />
          <KartuAngka label="Sumber akun">
            <div className="mt-3 flex flex-wrap gap-1.5">
              {perSumber.map(({ s, n }) => (
                <span key={s} className={cn("rounded-full px-2.5 py-[3px] text-12", toneBadgeClass[NADA_SUMBER[s]])}>
                  {LABEL_SUMBER[s]} <span className="tabular-nums opacity-75">{NUM.format(n)}</span>
                </span>
              ))}
            </div>
          </KartuAngka>
        </section>

        {qrBuka && (
          <section className={cn(kartu, "space-y-3.5 border-brand-gold px-5 py-[18px] shadow-[0_0_0_4px_var(--brand-gold-tint)] dark:shadow-[0_0_0_4px_rgb(204_187_118/0.12)]")}>
            <div className="flex justify-between gap-3">
              <div>
                <h2 className="text-16 font-semibold">Kartu QR untuk orang di luar acara tertentu</h2>
                <p className="mt-0.5 text-12 text-ink-muted">
                  Centang acara yang dikecualikan. Yang tersisa = orang aktif yang belum terdaftar maupun hadir di acara
                  itu. Tabel ikut tersaring untuk diperiksa dulu.
                </p>
              </div>
              <Link href={href({ qr: false, kecuali: [] })} aria-label="Tutup" className="shrink-0 self-start rounded-md p-1 text-ink-muted hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-800">
                <X className="size-[18px]" />
              </Link>
            </div>
            <form action="/orang" className="space-y-3.5">
              <input type="hidden" name="qr" value="1" />
              {q && <input type="hidden" name="q" value={q} />}
              {denganPeserta && <input type="hidden" name="peserta" value="1" />}
              {tab !== "semua" && <input type="hidden" name="tab" value={tab} />}
              <div className="grid gap-2 sm:grid-cols-2">
                {acaraList.map((a) => (
                  <label
                    key={a.id}
                    className="group flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-neutral-300 bg-card px-3 py-2.5 transition-colors hover:border-border-strong has-[:checked]:border-brand-bronze has-[:checked]:bg-brand-gold-tint dark:border-neutral-800 dark:has-[:checked]:border-brand-gold dark:has-[:checked]:bg-brand-gold/10"
                  >
                    <input type="checkbox" name="kecuali" value={a.slug} defaultChecked={kecuali.includes(a.slug)} className="peer sr-only" />
                    <span className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-border-strong text-transparent peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-12 font-medium">{a.nama}</span>
                    <span className="shrink-0 text-12 text-ink-muted">{tglPendek(a.tanggal)}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button className={tombolGaris}>Terapkan</button>
                {kecuali.length > 0 && (
                  <a href={`/api/hadir/qr-zip?${qsKecuali}`} className={tombolUtama}>
                    <Download className="size-4" aria-hidden /> Unduh {NUM.format(diLuar?.length ?? 0)} kartu (zip)
                  </a>
                )}
                <span className="text-12 text-ink-muted">
                  {kecuali.length === 0
                    ? "Belum ada acara dikecualikan — centang lalu tekan Terapkan."
                    : `Mengecualikan ${kecuali.length} acara.${q ? " Zip tidak ikut pencarian nama." : ""}`}
                </span>
              </div>
            </form>
          </section>
        )}

        <section className={cn(kartu, "overflow-hidden")}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-200 px-3.5 dark:border-neutral-800">
            <nav aria-label="Saring kategori" className="-mb-px flex gap-1 overflow-x-auto">
              {(Object.keys(TAB) as Tab[]).map((k) => {
                const aktif = tab === k;
                return (
                  <Link
                    key={k}
                    href={href({ tab: k })}
                    aria-current={aktif ? "page" : undefined}
                    className={cn(
                      "flex h-12 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-12 transition-colors",
                      aktif
                        ? "border-brand-bronze font-semibold text-foreground dark:border-brand-gold"
                        : "border-transparent text-ink-muted hover:text-foreground",
                    )}
                  >
                    {TAB[k].label}
                    <span className="font-mono text-11 text-ink-faint">{NUM.format(dasar.filter(TAB[k].cocok).length)}</span>
                  </Link>
                );
              })}
            </nav>
            {(jumlahPeserta > 0 || denganPeserta) && (
              <Link
                href={href({ peserta: !denganPeserta })}
                aria-pressed={denganPeserta}
                title={denganPeserta ? "Sembunyikan peserta kelas tatap muka" : "Tampilkan peserta kelas tatap muka (tilawah offline & Maahir)"}
                className={cn(
                  "my-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-12 transition-colors",
                  denganPeserta
                    ? "border-brand-bronze bg-brand-gold-tint font-semibold text-foreground dark:border-brand-gold dark:bg-brand-gold/10"
                    : "border-neutral-300 text-ink-muted hover:border-border-strong hover:text-foreground dark:border-neutral-800",
                )}
              >
                <Users className="size-3.5" aria-hidden />
                {denganPeserta ? "Peserta kelas ditampilkan" : "Tampilkan peserta kelas"}
                <span className="font-mono text-11 text-ink-faint">{NUM.format(jumlahPeserta)}</span>
                {denganPeserta && <X className="size-3" aria-hidden />}
              </Link>
            )}
            <form action="/orang" role="search" className="my-2 ml-auto w-full sm:w-80">
              {tab !== "semua" && <input type="hidden" name="tab" value={tab} />}
              {qrBuka && <input type="hidden" name="qr" value="1" />}
              {denganPeserta && <input type="hidden" name="peserta" value="1" />}
              {kecuali.map((s) => (
                <input key={s} type="hidden" name="kecuali" value={s} />
              ))}
              <label className={cn(isian, "flex h-9 items-center gap-2 focus-within:border-brand-bronze focus-within:ring-[3px] focus-within:ring-brand-gold/30")}>
                <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
                <span className="sr-only">Cari nama atau kode QR</span>
                <input name="q" defaultValue={q} placeholder="Cari nama atau kode QR" className="min-w-0 flex-1 bg-transparent text-12 outline-none placeholder:text-ink-faint" />
                {q && (
                  <Link href={href({ q: "" })} aria-label="Hapus pencarian" className="text-ink-faint hover:text-foreground">
                    <X className="size-3.5" />
                  </Link>
                )}
              </label>
            </form>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className={cn("grid grid-cols-[minmax(260px,1.4fr)_64px_minmax(220px,1.2fr)_minmax(220px,1.1fr)_150px_32px] border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900", labelMikro)}>
                <div className="px-4 py-2.5">Nama</div>
                <div className="px-3 py-2.5">L/P</div>
                <div className="px-3 py-2.5">Program (deklarasi)</div>
                <div className="px-3 py-2.5">Akun tertaut</div>
                <div className="px-3 py-2.5">Kode QR</div>
                <div />
              </div>
              {rows.map((r) => (
                <Link
                  key={r.id}
                  href={`/orang/${r.kodeQr}`}
                  className="grid grid-cols-[minmax(260px,1.4fr)_64px_minmax(220px,1.2fr)_minmax(220px,1.1fr)_150px_32px] items-center border-b border-neutral-200 transition-colors last:border-b-0 hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none dark:border-neutral-800 dark:hover:bg-neutral-900/60 dark:focus-visible:bg-neutral-900/60"
                >
                  <div className="flex min-w-0 items-center gap-3 px-4 py-2.5">
                    <Inisial nama={r.nama} gender={r.gender} className="size-8 text-11" />
                    <span className="truncate text-14 font-semibold">{r.nama}</span>
                    {r.kategori !== "pengajar" && (
                      <span className="shrink-0 rounded-full bg-neutral-100 px-[7px] py-px text-11 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {r.kategori}
                      </span>
                    )}
                    {r.perluReview && (
                      <span className={cn("shrink-0 rounded-full px-[7px] py-px text-11", toneBadgeClass.warning)}>perlu dicek</span>
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <span className={cn("rounded-md px-[7px] py-0.5 text-12 font-semibold", toneBadgeClass[r.gender === "P" ? "indigo" : "info"])}>
                      {r.gender}
                    </span>
                  </div>
                  <div className="px-3 py-2.5 text-12 text-neutral-700 dark:text-neutral-300">{r.programTeks ?? "—"}</div>
                  <div className="flex flex-wrap items-center gap-1 px-3 py-2.5">
                    {r.jumlahTautan === 0 ? (
                      <span className="text-12 text-ink-faint">Belum ada akun</span>
                    ) : (
                      <>
                        {r.sumber.map((s) => (
                          <span key={s} className={cn("rounded-full px-2 py-0.5 text-11", toneBadgeClass[NADA_SUMBER[s] ?? "neutral"])}>
                            {LABEL_SUMBER[s] ?? s}
                          </span>
                        ))}
                        <span className="ml-0.5 text-11 text-ink-faint">{r.jumlahTautan} akun</span>
                      </>
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-[3px] font-mono text-11 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                      <QrCode className="size-3 text-ink-faint" aria-hidden />
                      {r.kodeQr}
                    </span>
                  </div>
                  <ChevronRight className="size-4 text-neutral-300 dark:text-neutral-600" aria-hidden />
                </Link>
              ))}
              {rows.length === 0 && <p className="px-4 py-12 text-center text-14 text-ink-muted">Tidak ada yang cocok.</p>}
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
