import Link from "next/link";
import { notFound } from "next/navigation";
import { getAcaraBySlug, listBarangAcara, listDivisiAcara, listPanitiaAcara, listTugasAcara } from "@/lib/acara/queries";
import { daftarTerlambat, progresPerKode, progresTotal } from "@/lib/acara/ringkasan-view";
import { waLink } from "@/lib/wa";
import { barangBelumKembali, hMinus, ringkasRab } from "@/lib/acara/view-model";
import { todayJakarta } from "@/lib/time/jakarta";
import { PageHead, rupiah, tglPendek } from "./_ui";

/** Warna menurut ambang (design a2): < 50% merah, < 80% amber, sisanya hijau. */
function warnaProgres(p: number | null): string {
  if (p == null) return "bg-neutral-300";
  return p < 50 ? "bg-red-500" : p < 80 ? "bg-amber-500" : "bg-emerald-600";
}

/**
 * Empat kartu, tidak lebih (spec §5): progres per kode divisi (ikhwan/akhwat
 * berdampingan, terendah di atas — design a2), tugas terlambat dengan PIC,
 * umur, dan tombol WA, tiga angka RAB, barang belum kembali (hanya setelah
 * acara selesai). Setiap kartu menuntun ke satu halaman tindakan.
 */
export default async function RingkasanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acara = await getAcaraBySlug(slug);
  if (!acara) notFound();
  const today = todayJakarta();
  const [divisi, tugas, barang, panitia] = await Promise.all([
    listDivisiAcara(acara.id),
    listTugasAcara(acara.id),
    listBarangAcara(acara.id),
    listPanitiaAcara(acara.id),
  ]);
  const perKode = progresPerKode(divisi, tugas);
  const total = progresTotal(tugas);
  const telat = daftarTerlambat(tugas, divisi, panitia, today);
  const rab = ringkasRab(barang);
  const belumKembali = barangBelumKembali(barang);
  const h = hMinus(acara.tanggal, today);
  const base = `/acara/${slug}`;

  return (
    <>
      <PageHead title={acara.nama}>
        {tglPendek(acara.tanggal)} · {h > 0 ? `H-${h}` : h === 0 ? "Hari-H" : `H+${-h}`} · {acara.lokasi ?? "lokasi belum diisi"} · status {acara.status}
      </PageHead>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 p-4 md:col-span-2 dark:border-neutral-800">
          <div className="mb-3 flex flex-wrap items-baseline gap-3">
            <h2 className="text-14 font-semibold">Progres per divisi</h2>
            <span className="text-12 text-muted-foreground">
              total {total.total === 0 ? "—" : `${total.selesai}/${total.total} tugas (${total.persen}%)`}
            </span>
            <span className="ml-auto flex gap-3 text-11 text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-blue-600" />Ikhwan</span>
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-[#8a4f80]" />Akhwat</span>
            </span>
          </div>
          {total.total > 0 && (
            <div className="mb-3 h-2 rounded bg-neutral-200 dark:bg-neutral-800">
              <div className={`h-2 rounded ${warnaProgres(total.persen)}`} style={{ width: `${total.persen ?? 0}%` }} />
            </div>
          )}
          <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
            {perKode.map((k) => (
              <li key={k.kode} className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3 text-12">
                <span className="truncate font-medium">{k.nama}</span>
                <span className="flex flex-col gap-1">
                  {(
                    [
                      ["ikhwan", k.ikhwan, "Ikhwan"],
                      ["akhwat", k.akhwat, "Akhwat"],
                      ["bersama", k.bersama, "Bersama"],
                    ] as const
                  )
                    .filter(([, p]) => p)
                    .map(([sisi, p, label]) => {
                      const d = divisi.find((x) => x.kode === k.kode && x.sisi === sisi);
                      return (
                        <Link key={sisi} href={`${base}/tugas?divisi=${d?.id ?? ""}`} className="flex items-center gap-2 hover:underline" title={`${k.nama} ${label}`}>
                          <span className={`inline-block size-2 shrink-0 rounded-sm ${sisi === "akhwat" ? "bg-[#8a4f80]" : sisi === "ikhwan" ? "bg-blue-600" : "bg-neutral-400"}`} />
                          <span className="h-2 flex-1 rounded bg-neutral-200 dark:bg-neutral-800">
                            <span className={`block h-2 rounded ${warnaProgres(p!.persen)}`} style={{ width: `${p!.persen ?? 0}%` }} />
                          </span>
                          <span className="w-12 text-right tabular-nums text-muted-foreground">{p!.total === 0 ? "—" : `${p!.selesai}/${p!.total}`}</span>
                        </Link>
                      );
                    })}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-3 text-14 font-semibold">
            Tugas terlambat{" "}
            <span className={`ml-1 rounded px-1.5 text-12 ${telat.length ? "bg-red-600 text-white" : "bg-neutral-200 dark:bg-neutral-800"}`}>{telat.length}</span>
          </h2>
          {telat.length === 0 && <p className="text-12 text-muted-foreground">Tidak ada yang terlambat.</p>}
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {telat.slice(0, 10).map((t) => {
              const wa = waLink(t.picWa, `Assalamu'alaikum ${t.pic ?? ""}. Pengingat tugas "${t.judul}" untuk ${acara.nama} — sudah lewat ${t.hari} hari dari tenggat. Jazakumullahu khairan.`);
              return (
                <li key={t.id} className="flex items-center gap-2 py-1.5 text-12">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t.judul}</span>
                    <span className="block text-11 text-muted-foreground">
                      {[t.divisi, t.pic ? `PIC ${t.pic}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-red-700 dark:text-red-300">{t.hari} hr</span>
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" className="shrink-0 rounded border border-emerald-300 px-1.5 py-0.5 text-11 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300">
                      WA
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {telat.length > 10 && (
            <Link href={`${base}/tugas?terlambat=1`} className="mt-2 block text-12 text-primary hover:underline">
              Lihat semua {telat.length} tugas terlambat →
            </Link>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-3 text-14 font-semibold">RAB (sumber beli)</h2>
          <dl className="grid grid-cols-3 gap-2 text-12">
            {(["diajukan", "disetujui", "ditolak"] as const).map((k) => (
              <Link key={k} href={`${base}/barang?tab=rab&approval=${k}`} className="rounded bg-neutral-50 p-2 hover:underline dark:bg-neutral-900">
                <dt className="text-11 uppercase text-muted-foreground">{k}</dt>
                <dd className="font-semibold tabular-nums">{rupiah(rab[k])}</dd>
              </Link>
            ))}
          </dl>
          {(rab.tanpaHarga > 0 || rab.lain > 0) && (
            <p className="mt-2 text-12 text-amber-700 dark:text-amber-300">
              {rab.tanpaHarga > 0 && `${rab.tanpaHarga} barang beli belum berharga. `}
              {rab.lain > 0 && `${rab.lain} barang berstatus asing.`}
            </p>
          )}
        </section>

        {acara.status === "selesai" && (
          <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="mb-3 text-14 font-semibold">Barang belum kembali</h2>
            <Link href={`${base}/barang?tab=kembali`} className="text-12 hover:underline">
              <span className={`text-20 font-bold ${belumKembali.length ? "text-red-700 dark:text-red-300" : ""}`}>{belumKembali.length}</span> barang harus_kembali masih di luar →
            </Link>
          </section>
        )}
      </div>
    </>
  );
}
