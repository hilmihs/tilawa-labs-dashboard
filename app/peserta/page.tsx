import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { BadgeStatus, Chip, KotakAngka, Pager, TabStatusNav, inputKelas, labelKelas, tombolGaris, tombolUtama, warnaHadir } from "@/components/lintas/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDirektoriPeserta } from "@/lib/lintas/direktori";
import {
  AMBANG_HADIR,
  PER_HALAMAN,
  bacaSaringPeserta,
  hadirTerendah,
  halaman,
  qs,
  saringPeserta,
  saringPesertaDasar,
  type TabStatus,
} from "@/lib/lintas/saringan";
import { phoneLokal } from "@/lib/wa";

export const metadata = { title: "Peserta" };
export const dynamic = "force-dynamic";

/**
 * Seluruh peserta aktif lintas program — daftar di balik angka "Peserta aktif"
 * di Beranda, dengan aturan hitung yang sama (lib/lintas/direktori.ts).
 */
export default async function PesertaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = bacaSaringPeserta(await searchParams);
  const semua = await getDirektoriPeserta(user);
  const dasar = saringPesertaDasar(semua, s);
  const rows = saringPeserta(semua, s);
  const { isi, hal, jumlahHal } = halaman(rows, s.hal);
  const programs = [...new Set(semua.flatMap((r) => r.kelas.map((k) => k.program)))].sort();
  const rendah = dasar.filter((r) => {
    const h = hadirTerendah(r);
    return h != null && h < AMBANG_HADIR;
  }).length;
  const kosong = dasar.filter((r) => hadirTerendah(r) == null).length;
  const disaring = Boolean(s.q || s.program || s.g || s.hadir);
  const saring = { q: s.q, program: s.program, g: s.g, hadir: s.hadir, status: s.status };
  const nTab = (status: TabStatus | undefined) => saringPesertaDasar(semua, { ...s, status, hadir: undefined }).length;

  return (
    <AppShell
      email={user.email}
      title="Peserta"
      railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}
    >
      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <nav className="text-xs text-ink-muted">
              <Link href="/" className="hover:text-primary hover:underline">
                Beranda
              </Link>{" "}
              › Peserta
            </nav>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">Peserta</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              Satu baris per orang, lintas semua program. Berjalan = masih ikut kelas yang belum tamat; Selesai = semua
              kelasnya sudah tamat (riwayat batch yang tersimpan).
            </p>
          </div>
          <a href={`/peserta/unduh${qs(saring)}`} className={tombolGaris}>
            <Download className="size-3.5" /> Unduh CSV
          </a>
        </header>

        <TabStatusNav
          dasar="/peserta"
          saring={saring}
          aktif={s.status}
          n={{ berjalan: nTab(undefined), selesai: nTab("selesai"), semua: nTab("semua") }}
          satuan="peserta"
        />

        <KotakAngka
          items={[
            { label: "Peserta", nilai: dasar.length },
            { label: "Ikhwan", nilai: dasar.filter((r) => r.gender === "L").length },
            { label: "Akhwat", nilai: dasar.filter((r) => r.gender === "P").length },
            { label: "Ikut >1 kelas", nilai: dasar.filter((r) => r.kelas.length > 1).length },
          ]}
        />

        <form action="/peserta" className="flex flex-wrap items-end gap-2">
          {s.hadir && <input type="hidden" name="hadir" value={s.hadir} />}
          {s.status && <input type="hidden" name="status" value={s.status} />}
          <label className={`${labelKelas} min-w-[200px] flex-1`}>
            Cari nama, no HP, halaqah, atau pengajar
            <input name="q" defaultValue={s.q ?? ""} placeholder="mis. Aisyah, 0812…, HITS 012" className={inputKelas} />
          </label>
          <label className={labelKelas}>
            Program
            <select name="program" defaultValue={s.program ?? ""} className={`${inputKelas} max-w-[240px] px-2`}>
              <option value="">Semua program</option>
              {programs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className={labelKelas}>
            Gender
            <select name="g" defaultValue={s.g ?? ""} className={`${inputKelas} px-2`}>
              <option value="">Semua</option>
              <option value="L">Ikhwan</option>
              <option value="P">Akhwat</option>
            </select>
          </label>
          <button type="submit" className={tombolUtama}>
            Terapkan
          </button>
          {disaring && (
            <Link href={`/peserta${qs({ status: s.status })}`} className="h-9 px-2 text-sm leading-9 text-ink-muted hover:text-primary hover:underline">
              Hapus saringan
            </Link>
          )}
        </form>

        <nav aria-label="Saring kehadiran" className="flex flex-wrap gap-2">
          <Chip href={`/peserta${qs(saring, { hadir: undefined })}`} aktif={!s.hadir} label="Semua" n={dasar.length} />
          <Chip
            href={`/peserta${qs(saring, { hadir: s.hadir === "rendah" ? undefined : "rendah" })}`}
            aktif={s.hadir === "rendah"}
            label={`Kehadiran < ${AMBANG_HADIR}%`}
            n={rendah}
            peringatan
          />
          <Chip
            href={`/peserta${qs(saring, { hadir: s.hadir === "kosong" ? undefined : "kosong" })}`}
            aktif={s.hadir === "kosong"}
            label="Belum ada data hadir"
            n={kosong}
          />
        </nav>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
            Tidak ada peserta yang cocok dengan saringan ini.
          </p>
        ) : (
          <>
            <p className="text-xs text-ink-muted">
              {NUMF(rows.length)} peserta{disaring ? " cocok" : ""} · menampilkan {NUMF((hal - 1) * PER_HALAMAN + 1)}–
              {NUMF((hal - 1) * PER_HALAMAN + isi.length)}
            </p>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-12" numeric>
                      #
                    </TH>
                    <TH>Nama</TH>
                    <TH className="w-12">L/P</TH>
                    <TH className="min-w-[260px]">Kelas</TH>
                    <TH numeric>Hadir</TH>
                    <TH>No HP</TH>
                  </TR>
                </THead>
                <TBody>
                  {isi.map((r, i) => (
                    <TR key={r.kunci} className="align-top">
                      <TD numeric className="text-neutral-400">
                        {(hal - 1) * PER_HALAMAN + i + 1}
                      </TD>
                      <TD className="font-medium">{r.nama}</TD>
                      <TD className={r.gender ? "" : "text-neutral-400"}>{r.gender ?? "?"}</TD>
                      <TD>
                        <ul className="space-y-1">
                          {r.kelas.map((k, j) => (
                            <li key={j} className="text-[13px]">
                              {k.halaqahId != null && k.programSlug ? (
                                <Link href={`/${k.programSlug}/halaqah/${k.halaqahId}`} className="font-medium hover:text-primary hover:underline">
                                  {k.halaqah}
                                </Link>
                              ) : (
                                <span className="font-medium">{k.halaqah}</span>
                              )}
                              <span className="text-ink-muted">
                                {" "}
                                · {k.program}
                                {k.batch ? ` ${k.batch}` : ""}
                                {k.pengajar ? ` · ${k.pengajar}` : ""}
                              </span>
                              <BadgeStatus status={k.status} akhir={k.akhir} />
                            </li>
                          ))}
                        </ul>
                      </TD>
                      <TD numeric className="whitespace-nowrap">
                        {r.kelas.map((k, j) => (
                          <div key={j} className={`text-[13px] ${warnaHadir(k.hadir, AMBANG_HADIR)}`}>
                            {k.hadir != null ? `${k.hadir}%` : "—"}
                          </div>
                        ))}
                      </TD>
                      <TD className="whitespace-nowrap font-mono text-xs">{phoneLokal(r.hp) ?? <span className="text-neutral-400">—</span>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <Pager hal={hal} jumlahHal={jumlahHal} href={(h) => `/peserta${qs(saring, { hal: h })}`} />
          </>
        )}

        <details className="text-xs leading-relaxed text-ink-muted">
          <summary className="cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300">Cara menghitung</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Tab Berjalan = angka Peserta aktif di Beranda: pendaftaran aktif, sudah punya kelas, bukan kelas uji (DEMO),
              dan minimal satu kelasnya belum tamat. Kelas tamat = pertemuan terakhirnya sudah lewat (Mabni: periode
              kelas berakhir).
            </li>
            <li>
              Satu baris per orang: akun ganda (HP dan nama sama), salinan HKM→RBI, dan peserta yang ikut dua kelas
              Maahir digabung. Nama sama tanpa bukti lain tetap dua baris.
            </li>
            <li>Riwayat hanya sejauh batch yang masih tersimpan di dashboard (batch sebelumnya belum ditarik).</li>
            <li>Hadir = hadir ÷ pertemuan yang sudah terjadi (izin tidak dihitung). Kelas Maahir dari rekap kehadiran bulan berjalan.</li>
            <li>Peserta yang belum ditempatkan di kelas (daftar tunggu) tidak termasuk.</li>
          </ul>
        </details>
      </main>
    </AppShell>
  );
}

const NUMF = (n: number) => n.toLocaleString("id-ID");
