import { notFound } from "next/navigation";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { listOrangAcara } from "@/lib/hadir/queries";
import { anggotaPerGolongan, barisRekap, listKlasifikasi, listTargetAcara } from "@/lib/hadir/queries-golongan";
import { rekapSesi } from "@/lib/hadir/rekap";
import { ringkasHadir } from "@/lib/hadir/view-model";
import { PageHead, tglPendek } from "../_ui";
import { susunHistogram } from "@/lib/hadir/histogram";
import { getKonteksSesi } from "@/lib/hadir/konteks-sesi";
import { toneBadgeClass } from "@/lib/ui/status";
import { AutoRefresh } from "./AutoRefresh";
import { DaftarHadir } from "./DaftarHadir";

export const dynamic = "force-dynamic";

/** Panel hari-H: angka bergerak tiap 15 detik. Hitungan dari lib/hadir/view-model ringkasHadir. */
export default async function HadirPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { slug } = await params;
  const { filter } = await searchParams;
  const acara = await getAcaraBySlug(slug);
  if (!acara) notFound();
  const rows = await listOrangAcara(acara.id);
  const [target, anggota, barisHadir, golongan, konteks] = await Promise.all([
    listTargetAcara(acara.id),
    anggotaPerGolongan(),
    barisRekap([acara.id]),
    listKlasifikasi({ hanyaAktif: true }),
    getKonteksSesi({ id: acara.id, seri: acara.seri, tanggal: String(acara.tanggal) }),
  ]);
  const [rt] = rekapSesi(
    [{ acaraId: acara.id, slug: acara.slug, nama: acara.nama, seri: acara.seri, tanggal: acara.tanggal, pemateri: acara.pemateri, tema: acara.tema }],
    barisHadir,
    target,
    anggota,
  );
  const namaGolongan = new Map(golongan.map((g) => [g.slug, g.nama]));
  const r = ringkasHadir(rows, {
    tanggal: acara.tanggal,
    jamMulai: acara.jamMulai,
    toleransiMenit: acara.toleransiMenit,
    scanBukaAt: acara.scanBukaAt?.toISOString() ?? null,
    scanTutupAt: acara.scanTutupAt?.toISOString() ?? null,
  });
  const hist = susunHistogram(r.histogram, acara.jamMulai, acara.toleransiMenit);
  const puncak = Math.max(1, ...hist.bins.map((h) => h.jumlah));
  const pct = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);
  const delta = konteks.sebelumnya ? r.hadir - konteks.sebelumnya.hadir : null;
  const lebar = (n: number) => (r.terdaftar ? `${(100 * n) / r.terdaftar}%` : "0%");
  const filterAwal = (["hadir", "noshow", "belum_bisa", "belum_hadir", "terlambat"] as const).find((f) => f === filter) ?? "semua";

  // Masalah sebagai chip (design a3): merah hanya untuk yang perlu tindakan
  // sekarang, amber untuk "perhatikan", netral untuk info.
  const chips = [
    rt.mangkir > 0 && { t: `${rt.mangkir} wajib belum hadir`, nada: toneBadgeClass.danger, href: "?filter=belum_hadir#daftar" },
    r.terlambat > 0 && { t: `${r.terlambat} terlambat`, nada: toneBadgeClass.warning, href: "?filter=terlambat#daftar" },
    r.noShow > 0 && { t: `${r.noShow} bilang bisa, belum datang`, nada: "border border-border bg-card", href: "?filter=noshow#daftar" },
    r.hadirTanpaRsvp > 0 && { t: `${r.hadirTanpaRsvp} hadir tanpa konfirmasi`, nada: "border border-border bg-card", href: "?filter=hadir#daftar" },
    konteks.wajahBaru > 0 && { t: `${konteks.wajahBaru} wajah baru`, nada: "border border-border bg-card", href: "?filter=hadir#daftar" },
  ].filter(Boolean) as { t: string; nada: string; href: string }[];

  return (
    <>
      <AutoRefresh detik={15} />
      <PageHead title="Kehadiran">
        {tglPendek(acara.tanggal)}{acara.pemateri ? ` · ${acara.pemateri}` : ""}{acara.tema ? ` · ${acara.tema}` : ""} · mulai {acara.jamMulai?.slice(0, 5) ?? "—"} WIB · toleransi {acara.toleransiMenit} menit · segar otomatis tiap 15 detik
      </PageHead>

      <section className="grid gap-7 rounded-[14px] border border-neutral-300 bg-card p-5 md:grid-cols-[260px_minmax(0,1fr)] dark:border-neutral-800">
        <div className="flex flex-col gap-1.5">
          <span className="text-11 font-semibold uppercase tracking-wide text-muted-foreground">Hadir</span>
          <span className="font-mono text-[44px] font-semibold leading-[48px] tracking-tight tabular-nums">
            {r.hadir}
            <span className="text-16 font-normal text-muted-foreground"> / {r.terdaftar}</span>
          </span>
          <span className="text-12 text-muted-foreground">
            {pct(r.hadir, r.terdaftar)} terdaftar
            {delta != null && konteks.sebelumnya && (
              <span className={`font-medium ${delta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                {" "}· {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs {konteks.sebelumnya.nama}
              </span>
            )}
          </span>
          <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <span className="bg-blue-600" style={{ width: lebar(r.perGender.L.hadir) }} />
            <span className="bg-[#8a4f80]" style={{ width: lebar(r.perGender.P.hadir) }} />
          </div>
          <div className="flex gap-3 text-11 text-muted-foreground">
            <span><b className="text-blue-700 dark:text-blue-300">{r.perGender.L.hadir}</b> ikhwan</span>
            <span><b className="text-[#6a3d63] dark:text-[#d7b3d0]">{r.perGender.P.hadir}</b> akhwat</span>
            <span>{r.terdaftar - r.hadir} belum</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-baseline">
            <span className="text-12 font-semibold">Kedatangan per 10 menit</span>
            <span className="ml-auto text-11 text-muted-foreground">garis = jam mulai · arsir = toleransi</span>
          </div>
          {hist.bins.length === 0 ? (
            <p className="text-12 text-muted-foreground">Belum ada yang hadir.</p>
          ) : (
            <>
              <div className={`relative flex h-[120px] items-end border-b ${hist.bins.length > 30 ? "gap-px" : "gap-1.5"} border-neutral-200 dark:border-neutral-800`}>
                {hist.posisiMulai != null && (
                  <>
                    <span
                      aria-hidden
                      className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,rgba(245,158,11,.12)_0_5px,transparent_5px_10px)]"
                      style={{ left: `${hist.posisiMulai * 100}%`, width: `${hist.lebarToleransi * 100}%` }}
                    />
                    <span aria-hidden className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${hist.posisiMulai * 100}%` }} />
                  </>
                )}
                {hist.bins.map((h) => (
                  <div key={h.jam} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
                    {h.jumlah > 0 && <span className="font-mono text-[10.5px] text-muted-foreground">{h.jumlah}</span>}
                    <span
                      className={`w-full rounded-t ${h.zona === "terlambat" ? "bg-amber-500" : h.zona === "toleransi" ? "bg-emerald-400" : "bg-emerald-600"}`}
                      style={{ height: `${(100 * h.jumlah) / puncak}%` }}
                      title={`${h.jam} · ${h.jumlah} orang`}
                    />
                  </div>
                ))}
              </div>
              <div className={`flex overflow-hidden ${hist.bins.length > 30 ? "gap-px" : "gap-1.5"}`}>
                {/* Label ditipiskan supaya maks. ±12 jam terbaca; kolomnya tetap sejajar dengan batang. */}
                {hist.bins.map((h, i) => (
                  <span key={h.jam} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center font-mono text-[10.5px] text-muted-foreground">
                    {i % Math.max(1, Math.ceil(hist.bins.length / 12)) === 0 ? h.jam : ""}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <a key={c.t} href={c.href} className={`rounded-full px-3 py-1.5 text-12 font-medium ${c.nada}`}>
              {c.t} →
            </a>
          ))}
        </div>
      )}
      {!(rt.wajib > 0 || rt.hadirTambahan > 0) && (
        <p className="mt-3 text-12 text-muted-foreground">Acara ini belum punya target peserta. Tetapkan di tab Pendaftaran → Target peserta.</p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 text-14 font-semibold">Target peserta</h2>
          {rt.wajib > 0 || rt.hadirTambahan > 0 ? (
            <table className="w-full text-12">
              <tbody>
                <tr><td className="py-1">Wajib hadir</td><td className="text-right tabular-nums">{rt.hadirWajib} / {rt.wajib}</td></tr>
                <tr><td className="py-1">Belum hadir (wajib)</td><td className={`text-right tabular-nums ${rt.mangkir ? "text-red-700 dark:text-red-400" : ""}`}>{rt.mangkir}</td></tr>
                <tr><td className="py-1">Dari golongan diundang</td><td className="text-right tabular-nums">{rt.hadirDiundang}</td></tr>
                <tr><td className="py-1">Hadir tambahan</td><td className="text-right tabular-nums">{rt.hadirTambahan}</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="text-12 text-muted-foreground">Belum ada target.</p>
          )}
        </section>
        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 text-14 font-semibold">Per program</h2>
          <table className="w-full text-12">
            <thead><tr className="text-11 uppercase text-muted-foreground"><th className="text-left font-medium">Program</th><th className="text-right font-medium">Bisa</th><th className="text-right font-medium">Hadir</th><th className="text-right font-medium">%</th></tr></thead>
            <tbody>
              {r.perProgram.map((p) => (
                <tr key={p.program}><td className="py-1">{p.program}</td><td className="text-right tabular-nums">{p.bisa}</td><td className="text-right tabular-nums">{p.hadir} / {p.terdaftar}</td><td className="text-right tabular-nums text-muted-foreground">{pct(p.hadir, p.terdaftar)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 text-14 font-semibold">Per golongan</h2>
          {rt.perGolongan.length === 0 ? (
            <p className="text-12 text-muted-foreground">Yang hadir belum punya golongan.</p>
          ) : (
            <table className="w-full text-12">
              <tbody>
                {rt.perGolongan.map((g) => (
                  <tr key={g.slug}>
                    <td className="py-1">{namaGolongan.get(g.slug) ?? g.slug}</td>
                    <td className="text-right tabular-nums">{g.jumlah}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <DaftarHadir
        slug={slug}
        filterAwal={filterAwal}
        rows={rows.map((o) => ({ id: o.id, nama: o.nama, gender: o.gender, program: o.programTeks, konfirmasi: o.konfirmasi, alasan: o.alasan, hadirAt: o.hadirAt, metode: o.metode, kode: o.kodeQr }))}
        acara={{ tanggal: acara.tanggal, jamMulai: acara.jamMulai, toleransiMenit: acara.toleransiMenit }}
      />
    </>
  );
}
