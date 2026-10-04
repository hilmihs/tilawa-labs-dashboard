import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDashed, Download, Info, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { Inisial, KartuAngka, KepalaHalaman, kartu, labelMikro, tombolGaris } from "@/components/lintas/brand";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDirektoriPengajar } from "@/lib/pengajar/direktori";
import {
  LABEL_BEBAN,
  bacaSaringan,
  daftarProgram,
  hitungBeban,
  labelBulan,
  peranTambahan,
  saringDasar,
  terapkanSaringan,
  type Beban,
  type PengajarBaris,
  type Saringan,
} from "@/lib/pengajar/direktori-view";
import { sejak } from "@/lib/insights/beranda";
import { cn } from "@/lib/utils";
import { phoneLokal, waLink } from "@/lib/wa";
import { SaringanPengajar } from "./SaringanPengajar";

export const metadata = { title: "Pengajar" };
export const dynamic = "force-dynamic";

const NUM = new Intl.NumberFormat("id-ID");

/** Query string dari saringan, dengan sebagian nilai ditimpa. */
function qs(s: Saringan, ubah: Partial<Saringan> = {}): string {
  const m = { ...s, ...ubah };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
  const t = p.toString();
  return t ? `?${t}` : "";
}

/**
 * Warna kelompok beban — satu rona forest yang makin pekat, "tanpa halaqah"
 * oker supaya yang longgar langsung terlihat. Dark: forest tak terbaca di kartu
 * gelap, jadi 3+ pindah ke emas (seperti --primary).
 */
const WARNA_BEBAN: Record<Beban, { isi: string; teks: string }> = {
  "0": { isi: "bg-amber-400 dark:bg-amber-500", teks: "text-brand-ink" },
  "1": { isi: "bg-[#b9c7c1] dark:bg-[#4d615b]", teks: "text-brand-ink dark:text-white" },
  "2": { isi: "bg-[#6f8a83] dark:bg-[#8aa39b]", teks: "text-white dark:text-brand-ink" },
  "3": { isi: "bg-brand-forest dark:bg-brand-gold", teks: "text-white dark:text-brand-ink" },
};
const kelompok = (n: number): Beban => (n >= 3 ? "3" : (String(n) as Beban));

/**
 * Direktori pengajar lintas program: satu baris per orang, di program dan batch
 * mana dia mengajar, berapa halaqah yang dia pegang, dan berapa kali membadal.
 * Aturan hitung di lib/pengajar/direktori-view.ts. Permintaan pemilik 28 Sep
 * 2026 — dipakai untuk memetakan siapa yang masih longgar sebelum batch baru.
 * Tampilan: desain "Overhaul Pengajar Orang Acara Office" (01 Pengajar).
 */
export default async function PengajarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = bacaSaringan(await searchParams);
  const { rows: semua, sinkronTertua, kajianTotal } = await getDirektoriPengajar(user);

  const dasar = saringDasar(semua, s);
  const rows = terapkanSaringan(semua, s);
  const beban = hitungBeban(dasar);
  const programs = daftarProgram(semua);
  const mengajar = dasar.filter((r) => r.mengajar).length;
  const ikhwan = dasar.filter((r) => r.gender === "L").length;
  const akhwat = dasar.filter((r) => r.gender === "P").length;
  const totalBeban = (["0", "1", "2", "3"] as Beban[]).reduce((n, b) => n + beban[b], 0);
  const disaring = Boolean(s.q || s.program || s.g || s.beban);

  return (
    <AppShell
      email={user.email}
      title="Pengajar"
      railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}
    >
      <main className="mx-auto w-full max-w-[1240px] space-y-5 px-4 py-6 sm:px-8 sm:py-7">
        <KepalaHalaman
          judul="Pengajar"
          aksi={
            <>
              <CaraMenghitung />
              <a href={`/pengajar/unduh${qs(s)}`} className={tombolGaris}>
                <Download className="size-4" aria-hidden /> Unduh CSV
              </a>
            </>
          }
        >
          Siapa mengajar di mana, berapa halaqah yang dipegang, dan siapa yang masih longgar sebelum batch baru.
          {sinkronTertua && <> Data sinkron {sejak(sinkronTertua)}.</>}
        </KepalaHalaman>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KartuAngka label="Mengajar" nilai={NUM.format(mengajar)} catatan={`dari ${NUM.format(dasar.length)} terdaftar`}>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${dasar.length ? Math.round((mengajar / dasar.length) * 100) : 0}%` }}
              />
            </div>
          </KartuAngka>
          <KartuAngka label="Ikhwan · Akhwat">
            <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
              <span className="text-[32px] font-extrabold leading-none tracking-[-0.03em] text-blue-700 dark:text-blue-300">
                {NUM.format(ikhwan)}
              </span>
              <span className="text-20 text-neutral-300 dark:text-neutral-600">/</span>
              <span className="text-[32px] font-extrabold leading-none tracking-[-0.03em] text-[#6a3d63] dark:text-[#d7b3d0]">
                {NUM.format(akhwat)}
              </span>
            </div>
            <div className="mt-3.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
              {ikhwan + akhwat > 0 ? (
                <>
                  <div className="bg-blue-500" style={{ flex: ikhwan }} />
                  <div className="bg-[#8a5a82] dark:bg-[#b98aae]" style={{ flex: akhwat }} />
                </>
              ) : (
                <div className="flex-1 bg-neutral-100 dark:bg-neutral-800" />
              )}
            </div>
          </KartuAngka>

          <div className={cn(kartu, "col-span-2 min-w-0 px-[18px] py-4")}>
            <div className="flex items-baseline justify-between gap-3">
              <div className={labelMikro}>Sebaran beban · klik untuk menyaring</div>
              <Link
                href={`/pengajar${qs(s, { beban: undefined })}`}
                className={cn("shrink-0 text-12 text-primary hover:underline", !s.beban && "font-semibold")}
              >
                Semua {NUM.format(dasar.length)}
              </Link>
            </div>
            <nav aria-label="Saring jumlah halaqah">
              <div className="mt-3 flex h-7 gap-[3px]">
                {(["0", "1", "2", "3"] as Beban[]).map((b) =>
                  beban[b] > 0 ? (
                    <Link
                      key={b}
                      href={`/pengajar${qs(s, { beban: s.beban === b ? undefined : b })}`}
                      aria-current={s.beban === b ? "true" : undefined}
                      title={`${LABEL_BEBAN[b]}: ${beban[b]}`}
                      style={{ flex: beban[b] }}
                      className={cn(
                        "flex min-w-7 items-center rounded-[7px] px-2.5 text-12 font-semibold tabular-nums transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        WARNA_BEBAN[b].isi,
                        WARNA_BEBAN[b].teks,
                        s.beban && s.beban !== b && "opacity-25 hover:opacity-60",
                      )}
                    >
                      {beban[b]}
                    </Link>
                  ) : null,
                )}
                {totalBeban === 0 && <div className="flex-1 rounded-[7px] bg-neutral-100 dark:bg-neutral-800" />}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1">
                {(["0", "1", "2", "3"] as Beban[]).map((b) => (
                  <Link
                    key={b}
                    href={`/pengajar${qs(s, { beban: s.beban === b ? undefined : b })}`}
                    className={cn(
                      "flex items-center gap-1.5 text-12 text-neutral-600 hover:text-foreground dark:text-neutral-300",
                      s.beban === b && "font-semibold text-foreground",
                    )}
                  >
                    <span className={cn("size-2 rounded-[3px]", WARNA_BEBAN[b].isi)} aria-hidden />
                    {LABEL_BEBAN[b]}
                    <span className="tabular-nums text-ink-faint">{beban[b]}</span>
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </section>

        <section className={cn(kartu, "overflow-hidden")}>
          <SaringanPengajar q={s.q} g={s.g} program={s.program} urut={s.urut} beban={s.beban} programs={programs} />

          {rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-14 text-ink-muted">
              Tidak ada pengajar yang cocok dengan saringan ini.{" "}
              {disaring && (
                <Link href="/pengajar" className="text-primary hover:underline">
                  Hapus saringan
                </Link>
              )}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-14">
                <thead className="bg-neutral-50 dark:bg-neutral-900">
                  <tr className="border-b border-neutral-200 text-left dark:border-neutral-800 [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-11 [&>th]:font-bold [&>th]:text-ink-muted [&>th]:cap">
                    <th className="w-11 text-right">#</th>
                    <th className="min-w-[230px]">Nama</th>
                    <th className="w-[104px]">Halaqah</th>
                    <th className="min-w-[280px]">Mengajar di</th>
                    <th className="w-[92px]" title="Kajian Div. Kaderisasi yang dihadiri (presensi QR)">
                      Kajian
                    </th>
                    <th className="w-[132px]" title="Skor matrix Maahir bulan terakhir · ranking">
                      Matrix
                    </th>
                    <th className="w-[150px]">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <Baris key={r.kunci} r={r} no={i + 1} kajianTotal={kajianTotal} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 px-4 py-3 text-12 text-ink-muted dark:bg-neutral-900">
            <span>
              Menampilkan {NUM.format(rows.length)} dari {NUM.format(semua.length)} pengajar
            </span>
            {disaring && (
              <Link href="/pengajar" className="text-primary hover:underline">
                Hapus saringan
              </Link>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

/** Tombol "Cara menghitung" — panel lipat tanpa JS (details/summary). */
function CaraMenghitung() {
  return (
    <details className="group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-[9px] border border-transparent px-3 text-12 text-neutral-600 transition-colors select-none hover:border-border hover:bg-card group-open:border-border group-open:bg-card dark:text-neutral-300 [&::-webkit-details-marker]:hidden">
        <Info className="size-4" aria-hidden /> Cara menghitung
      </summary>
      <div className={cn(kartu, "absolute left-0 z-30 mt-2 w-[min(calc(100vw-2rem),440px)] p-4 sm:right-0 sm:left-auto text-12 leading-relaxed text-ink-muted shadow-lg")}>
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            Halaqah = kelas berjalan yang dia pegang: minimal satu peserta aktif, dalam batch yang sedang dipantau tiap
            program. Kelas uji (DEMO) tidak ikut.
          </li>
          <li>Boarding: a second teacher di satu kelas ikut dihitung dan ditandai &ldquo;pendamping&rdquo;.</li>
          <li>
            Tanpa halaqah = akun guru yang terdaftar di sebuah batch tapi tidak memegang kelas berjalan. Badal tidak
            menambah jumlah halaqah — ditulis kecil di bawah angkanya.
          </li>
          <li>
            Satu baris = satu orang di Daftar Individu: accounts from all three sources yang sudah bertaut ke orang
            yang sama digabung. Akun yang belum bertaut tetap satu baris per akun. Klik nama untuk membuka CV-nya.
          </li>
          <li>
            Maahir: syaikh aktif dihitung mengajar (tanpa angka halaqah). Roster HITS di Maahir memberi kelompok, ketua,
            dan skor matrix bulan terakhir. Musyrif hanya jadi keterangan.
          </li>
          <li>Kajian = kajian Div. Kaderisasi yang dihadiri (presensi QR), dari semua kajian yang sudah punya presensi.</li>
        </ul>
      </div>
    </details>
  );
}

function Baris({ r, no, kajianTotal }: { r: PengajarBaris; no: number; kajianTotal: number }) {
  const wa = waLink(r.hp, `Assalamu'alaikum ${r.nama}`);
  const peran = peranTambahan(r);
  const syaikhTanpaHalaqah = r.beban === 0 && r.mengajar;
  const warna = WARNA_BEBAN[kelompok(r.beban)];
  const titik = Math.max(6, Math.min(r.beban, 12));
  return (
    <tr className="border-b border-neutral-200 align-top transition-colors last:border-b-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/60">
      <td className="px-3 py-4 text-right text-12 tabular-nums text-ink-faint">{no}</td>
      <td className="p-3">
        <div className="flex items-start gap-3">
          <Inisial nama={r.nama} gender={r.gender} />
          <div className="flex min-w-0 flex-col gap-1.5">
            {r.kodeQr ? (
              <Link href={`/orang/${r.kodeQr}`} className="font-semibold leading-tight hover:text-primary hover:underline" title="Buka CV">
                {r.nama}
              </Link>
            ) : (
              <span className="font-semibold leading-tight">{r.nama}</span>
            )}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-11 text-ink-muted">{r.gender === "P" ? "Akhwat" : r.gender === "L" ? "Ikhwan" : "Gender ?"}</span>
              {peran.map((x) => (
                <span key={x} className="rounded-full bg-accent px-[7px] py-px text-11 text-accent-foreground">
                  {x}
                </span>
              ))}
              {(r.qism || r.mustawa) && (
                <span className="rounded-full bg-neutral-100 px-[7px] py-px text-11 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {[r.qism, r.mustawa && `Mustawa ${r.mustawa}`].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="p-3">
        {syaikhTanpaHalaqah ? (
          <span className="text-14 text-ink-faint" title="Syaikh Maahir — kelas Maahir tidak dihitung per halaqah">
            —
          </span>
        ) : (
          <div className="flex flex-col gap-[7px]">
            <span className={cn("text-20 font-bold leading-none tabular-nums", !r.mengajar && "text-warn")}>{r.beban}</span>
            <div className="flex flex-wrap gap-[3px]" aria-hidden>
              {Array.from({ length: titik }, (_, j) => (
                <span
                  key={j}
                  className={cn("size-[9px] rounded-[3px]", j < r.beban ? warna.isi : "bg-neutral-200 dark:bg-neutral-800")}
                />
              ))}
            </div>
            {r.badal > 0 && (
              <span className="text-11 text-ink-muted" title="Pertemuan yang sudah lewat, diampu di halaqah pengajar lain">
                +{r.badal} badal
              </span>
            )}
          </div>
        )}
      </td>
      <td className="p-3">
        {r.penugasan.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {r.penugasan.map((p) => (
              <li key={`${p.programSlug}|${p.batch}`} className="flex flex-col gap-1.5">
                <Link href={`/${p.programSlug}/pengajar`} className="text-12 hover:text-primary hover:underline">
                  <span className="font-semibold">{p.program}</span>
                  {p.batch && <span className="text-ink-muted"> · {p.batch}</span>}
                </Link>
                <div className="flex flex-wrap gap-1">
                  {p.halaqah.map((h) => (
                    <span
                      key={h.nama}
                      className="rounded-md border border-neutral-200 bg-neutral-50 px-[7px] py-0.5 font-mono text-11 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
                    >
                      {h.nama}
                      {h.pendamping && <span className="text-ink-faint"> · pendamping</span>}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : r.syaikhMaahir ? (
          <span className="text-12">
            <span className="font-semibold">Kelas Maahir</span> <span className="text-ink-muted">· syaikh</span>
          </span>
        ) : r.terdaftar.length > 0 ? (
          <div className="flex items-center gap-2 rounded-[9px] border border-dashed border-amber-300 bg-amber-50 px-2.5 py-2 text-12 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <CircleDashed className="size-3.5 shrink-0" aria-hidden />
            <span>
              Terdaftar di {r.terdaftar.map((t) => `${t.program}${t.batch ? ` · ${t.batch}` : ""}`).join(", ")}, belum
              memegang halaqah
            </span>
          </div>
        ) : (
          <span className="text-12 text-ink-faint">—</span>
        )}
      </td>
      <td className="px-3 py-3.5">
        {r.orangId ? (
          <div className="flex flex-col gap-1.5">
            {kajianTotal > 0 && kajianTotal <= 8 && (
              <div className="flex gap-1" aria-hidden>
                {Array.from({ length: kajianTotal }, (_, j) => (
                  <span
                    key={j}
                    className={cn("size-2.5 rounded-full", j < r.kajianHadir ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-800")}
                  />
                ))}
              </div>
            )}
            <span className="text-12 tabular-nums text-ink-muted">
              {r.kajianHadir}
              {kajianTotal > 0 && ` dari ${kajianTotal}`}
            </span>
          </div>
        ) : (
          <span className="text-14 text-ink-faint" title="Belum bertaut ke Daftar Individu">
            —
          </span>
        )}
      </td>
      <td className="p-3">
        {r.matrix?.skor != null ? (
          <div title={`Matrix Maahir ${labelBulan(r.matrix.bulan)}`}>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[18px] font-bold tabular-nums">{r.matrix.skor.toLocaleString("id-ID")}</span>
              {r.matrix.ranking != null && (
                <span className="text-11 text-ink-muted">
                  #{r.matrix.ranking}
                  {r.matrix.dari ? ` / ${r.matrix.dari}` : ""}
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, (r.matrix.skor / 4) * 100))}%` }} />
            </div>
            <div className="mt-1 text-11 text-ink-faint">{labelBulan(r.matrix.bulan)}</div>
          </div>
        ) : (
          <span className="text-14 text-ink-faint">—</span>
        )}
      </td>
      <td className="p-3">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 font-mono text-12 text-emerald-700 transition-colors hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
          >
            <MessageCircle className="size-3.5" aria-hidden />
            {phoneLokal(r.hp)}
          </a>
        ) : (
          <span className="text-12 text-ink-faint">—</span>
        )}
      </td>
    </tr>
  );
}
