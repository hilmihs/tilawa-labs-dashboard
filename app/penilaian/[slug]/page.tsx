import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import { getGrid } from "@/lib/penilaian/queries";
import { kandidatUntukPanitia, tautkanPanitia } from "@/lib/orang/tautan-panitia";
import { getTautanPic } from "@/lib/penilaian/tautan-pic";
import { GridPenilaian } from "./GridPenilaian";

export const metadata = { title: "Nilai panitia" };
export const dynamic = "force-dynamic";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
};

/**
 * Grid penilaian massal satu acara (design "Input Penilaian" p1). Membuka
 * halaman ini juga menautkan panitia yang belum punya orang — tanpa tautan,
 * nilai tidak bisa masuk CV.
 */
export default async function NilaiPanitiaPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireStaff();
  const { slug } = await params;
  const pertama = await getGrid(slug);
  if (!pertama) notFound();
  const tautan = await tautkanPanitia(pertama.acara.id);
  const grid = tautan.tertaut || tautan.dibuat ? ((await getGrid(slug)) ?? pertama) : pertama;
  const { acara, kpi, baris } = grid;

  // Progres per divisi: berapa panitia yang sudah punya nilai.
  const perDivisi = new Map<string, { total: number; dinilai: number }>();
  for (const b of baris) {
    const k = b.divisi ?? "Inti";
    const e = perDivisi.get(k) ?? { total: 0, dinilai: 0 };
    e.total += 1;
    if (Object.keys(b.nilai).length > 0) e.dinilai += 1;
    perDivisi.set(k, e);
  }
  const belumTertaut = baris.filter((b) => !b.orangId).length;
  const tautanPic = await getTautanPic(acara);
  const kandidat = await kandidatUntukPanitia(
    baris.filter((b) => !b.orangId).map((b) => ({ id: b.panitiaId, nama: b.nama, gender: b.gender })),
  );

  return (
    <AppShell email={user.email} title="Penilaian" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[1280px] space-y-4 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <nav className="text-xs text-neutral-500">
              <Link href="/penilaian" className="hover:text-primary hover:underline">
                Penilaian
              </Link>{" "}
              · <Link href={`/acara/${acara.slug}`} className="hover:text-primary hover:underline">buka acara</Link> ·{" "}
              <Link href={`/penilaian/${acara.slug}/impor`} className="hover:text-primary hover:underline">impor xlsx / Google Form</Link>
            </nav>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">Nilai panitia · {acara.nama}</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              {tgl(acara.tanggal)} · {perDivisi.size} divisi · {baris.length} panitia · status acara {acara.status}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...perDivisi.entries()].map(([d, v]) => (
            <div key={d} className="rounded-lg border border-border p-3">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold">{d}</span>
                <span className={v.dinilai === v.total ? "text-emerald-600" : "text-amber-600"}>
                  {v.dinilai}/{v.total} dinilai
                </span>
              </div>
            </div>
          ))}
        </section>

        {belumTertaut > 0 && (
          <p className="rounded-lg border border-dashed border-amber-400 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {belumTertaut}{" "}panitia belum tertaut ke Daftar Individu — nama satu kata atau tanpa nomor WA tidak
            ditebak. Konfirmasi kandidat di bawah nama masing-masing, atau pilih &ldquo;Orang baru&rdquo;.
          </p>
        )}

        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium">
            Minta PIC isi lewat WA{" "}
            <span className="font-normal text-neutral-500">
              · {tautanPic.reduce((n, t) => n + t.dinilaiPic, 0)}/{tautanPic.reduce((n, t) => n + t.anggota, 0)} anggota sudah dinilai PIC
            </span>
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {tautanPic.map((t) => (
              <li key={t.divisiId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
                <span className="min-w-[180px] font-medium">
                  {t.divisi}
                  {t.sisi !== "bersama" && <span className="font-normal text-neutral-500"> · {t.sisi}</span>}
                </span>
                <span className="text-neutral-500">PIC {t.pic ?? "belum ada"}</span>
                <span className={t.anggota && t.dinilaiPic === t.anggota ? "text-emerald-600" : "text-neutral-500"}>
                  {t.dinilaiPic}/{t.anggota} dinilai
                </span>
                <span className="ml-auto flex gap-2">
                  <a href={t.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    Buka tautan
                  </a>
                  {t.waHref ? (
                    <a href={t.waHref} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                      Kirim ke PIC (WA)
                    </a>
                  ) : (
                    <span className="text-neutral-400">PIC tanpa nomor WA</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2 text-[11px] text-neutral-500">
            Tautan sama dengan papan divisi (berlaku 90 hari). Nilai PIC tampil kecil di bawah sel grid dan tidak
            menimpa nilai tim kaderisasi.
          </p>
        </details>

        <GridPenilaian slug={acara.slug} kpi={kpi} baris={baris} kandidat={kandidat} />

        <details className="text-xs leading-relaxed text-neutral-500">
          <summary className="cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300">Cara menilai</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Skala B/C/D/E. Definisi tiap tingkat masih menunggu tim kaderisasi; arahkan kursor ke judul KPI untuk catatannya.</li>
            <li>
              Ketepatan waktu disarankan dari presensi QR acara ini: tepat waktu → B, lewat toleransi ≤ 15 menit → C,
              lebih → D. Tanpa scan tidak ada saran — E diputuskan manusia.
            </li>
            <li>Nilai D atau E wajib disertai contoh kejadian yang konkret.</li>
            <li>Setiap nilai tercatat dengan penilai dan tanggalnya, lalu tampil di CV orang itu.</li>
          </ul>
        </details>
      </main>
    </AppShell>
  );
}
