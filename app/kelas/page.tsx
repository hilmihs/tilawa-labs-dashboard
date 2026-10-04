import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { BadgeStatus, Chip, KotakAngka, Pager, TabStatusNav, inputKelas, labelKelas, tombolGaris, tombolUtama, warnaHadir } from "@/components/lintas/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDirektoriKelas } from "@/lib/lintas/direktori";
import { AMBANG_HADIR, PER_HALAMAN, bacaSaringKelas, halaman, qs, saringKelas, type TabStatus } from "@/lib/lintas/saringan";

export const metadata = { title: "Kelas" };
export const dynamic = "force-dynamic";

/**
 * Seluruh kelas aktif lintas program — daftar di balik angka "Kelas" di
 * Beranda: halaqah dengan ≥ 1 peserta aktif (lib/lintas/direktori.ts).
 */
export default async function KelasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = bacaSaringKelas(await searchParams);
  const semua = await getDirektoriKelas(user);
  const dasar = saringKelas(semua, { ...s, hadir: undefined, urut: undefined });
  const rows = saringKelas(semua, s);
  const programs = [...new Set(semua.map((r) => r.program))].sort();
  const rendah = dasar.filter((r) => r.hadir != null && r.hadir < AMBANG_HADIR).length;
  const disaring = Boolean(s.q || s.program || s.g || s.hadir);
  const saring = { q: s.q, program: s.program, g: s.g, hadir: s.hadir, urut: s.urut, status: s.status };
  const nTab = (status: TabStatus | undefined) => saringKelas(semua, { ...s, status, hadir: undefined, urut: undefined }).length;
  const { isi, hal, jumlahHal } = halaman(rows, s.hal ?? 1);
  const peserta = dasar.reduce((n, r) => n + r.peserta, 0);

  // Per program: berapa kelas & peserta — ringkasan di atas tabel.
  const perProgram = new Map<string, { kelas: number; peserta: number }>();
  for (const r of dasar) {
    const e = perProgram.get(r.program) ?? { kelas: 0, peserta: 0 };
    e.kelas += 1;
    e.peserta += r.peserta;
    perProgram.set(r.program, e);
  }

  return (
    <AppShell
      email={user.email}
      title="Kelas"
      railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}
    >
      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <nav className="text-xs text-ink-muted">
              <Link href="/" className="hover:text-primary hover:underline">
                Beranda
              </Link>{" "}
              › Kelas
            </nav>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">Kelas</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              Halaqah dengan minimal satu peserta, lintas program. Berjalan = pertemuan terakhirnya belum lewat; Selesai =
              sudah tamat.
            </p>
          </div>
          <a href={`/kelas/unduh${qs(saring)}`} className={tombolGaris}>
            <Download className="size-3.5" /> Unduh CSV
          </a>
        </header>

        <TabStatusNav
          dasar="/kelas"
          saring={saring}
          aktif={s.status}
          n={{ berjalan: nTab(undefined), selesai: nTab("selesai"), semua: nTab("semua") }}
          satuan="kelas"
        />

        <KotakAngka
          items={[
            { label: "Kelas", nilai: dasar.length },
            { label: "Ikhwan", nilai: dasar.filter((r) => r.jenis === "L").length },
            { label: "Akhwat", nilai: dasar.filter((r) => r.jenis === "P").length },
            { label: "Peserta di kelas ini", nilai: peserta, catatan: "pendaftaran, bukan orang unik" },
          ]}
        />

        <section className="flex flex-wrap gap-2 text-xs">
          {[...perProgram.entries()]
            .sort((a, b) => b[1].kelas - a[1].kelas)
            .map(([p, v]) => (
              <Link
                key={p}
                href={`/kelas${qs(saring, { program: s.program === p ? undefined : p })}`}
                className={`rounded-lg border px-2.5 py-1.5 ${s.program === p ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40" : "border-border hover:border-neutral-400"}`}
              >
                <span className="font-medium">{p}</span>{" "}
                <span className="text-ink-muted">
                  {v.kelas} kelas · {v.peserta} peserta
                </span>
              </Link>
            ))}
        </section>

        <form action="/kelas" className="flex flex-wrap items-end gap-2">
          {s.hadir && <input type="hidden" name="hadir" value={s.hadir} />}
          {s.status && <input type="hidden" name="status" value={s.status} />}
          {s.program && <input type="hidden" name="program" value={s.program} />}
          <label className={`${labelKelas} min-w-[200px] flex-1`}>
            Cari nama kelas atau pengajar
            <input name="q" defaultValue={s.q ?? ""} placeholder="mis. HITS 012 atau Salma" className={inputKelas} />
          </label>
          <label className={labelKelas}>
            Jenis
            <select name="g" defaultValue={s.g ?? ""} className={`${inputKelas} px-2`}>
              <option value="">Semua</option>
              <option value="L">Ikhwan</option>
              <option value="P">Akhwat</option>
            </select>
          </label>
          <label className={labelKelas}>
            Urutkan
            <select name="urut" defaultValue={s.urut ?? ""} className={`${inputKelas} px-2`}>
              <option value="">Program & nama</option>
              <option value="peserta">Peserta terbanyak</option>
              <option value="hadir">Kehadiran terendah</option>
            </select>
          </label>
          <button type="submit" className={tombolUtama}>
            Terapkan
          </button>
          {disaring && (
            <Link href={`/kelas${qs({ status: s.status })}`} className="h-9 px-2 text-sm leading-9 text-ink-muted hover:text-primary hover:underline">
              Hapus saringan
            </Link>
          )}
        </form>

        <nav aria-label="Saring kehadiran" className="flex flex-wrap gap-2">
          <Chip href={`/kelas${qs(saring, { hadir: undefined })}`} aktif={!s.hadir} label="Semua" n={dasar.length} />
          <Chip
            href={`/kelas${qs(saring, { hadir: s.hadir ? undefined : "rendah" })}`}
            aktif={s.hadir === "rendah"}
            label={`Rata² hadir < ${AMBANG_HADIR}%`}
            n={rendah}
            peringatan
          />
        </nav>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">
            Tidak ada kelas yang cocok dengan saringan ini.
          </p>
        ) : (
          <>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH className="w-12" numeric>
                    #
                  </TH>
                  <TH>Kelas</TH>
                  <TH>Program</TH>
                  <TH>Pengajar</TH>
                  <TH className="w-14">Jenis</TH>
                  <TH numeric>Peserta</TH>
                  <TH numeric>Rata² hadir</TH>
                  <TH>Jadwal</TH>
                </TR>
              </THead>
              <TBody>
                {isi.map((r, i) => (
                  <TR key={r.kunci} className="align-top">
                    <TD numeric className="text-neutral-400">
                      {(hal - 1) * PER_HALAMAN + i + 1}
                    </TD>
                    <TD className="font-medium">
                      {r.halaqahId != null && r.programSlug ? (
                        <Link href={`/${r.programSlug}/halaqah/${r.halaqahId}`} className="hover:text-primary hover:underline">
                          {r.nama}
                        </Link>
                      ) : (
                        r.nama
                      )}
                      <BadgeStatus status={r.status} akhir={r.akhir} />
                    </TD>
                    <TD className="text-[13px]">
                      {r.program}
                      {r.batch && <span className="text-ink-muted"> · {r.batch}</span>}
                    </TD>
                    <TD className="text-[13px]">
                      {r.pengajar ? (
                        <Link href={`/pengajar?q=${encodeURIComponent(r.pengajar)}`} className="hover:text-primary hover:underline">
                          {r.pengajar}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </TD>
                    <TD className={r.jenis ? "" : "text-neutral-400"}>{r.jenis === "L" ? "Ikhwan" : r.jenis === "P" ? "Akhwat" : "?"}</TD>
                    <TD numeric>{r.peserta}</TD>
                    <TD numeric className={warnaHadir(r.hadir, AMBANG_HADIR)}>
                      {r.hadir != null ? `${r.hadir}%` : "—"}
                    </TD>
                    <TD className="text-xs text-ink-muted">{[r.jadwal, r.tipe].filter(Boolean).join(" · ") || "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <Pager hal={hal} jumlahHal={jumlahHal} href={(h) => `/kelas${qs(saring, { hal: h })}`} />
          </>
        )}

        <details className="text-xs leading-relaxed text-ink-muted">
          <summary className="cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300">Cara menghitung</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Sama dengan angka Kelas di Beranda: halaqah dengan minimal satu peserta aktif, kelas uji (DEMO) tidak ikut.</li>
            <li>Rata² hadir = rata-rata persen hadir peserta aktif di kelas itu.</li>
            <li>Kelas Maahir dari rekap kehadiran bulan berjalan; pengajarnya tidak tercatat per kelas.</li>
          </ul>
        </details>
      </main>
    </AppShell>
  );
}
