import { notFound } from "next/navigation";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { baseUrl } from "@/lib/hadir/base-url";
import { listOrangAcara } from "@/lib/hadir/queries";
import { listKlasifikasi, listSeri, listTargetAcaraId } from "@/lib/hadir/queries-golongan";
import { getCacheNawa } from "@/lib/hadir/queries-nawa";
import { TarikNawa } from "../../TarikNawa";
import { PageHead, tglPendek } from "../_ui";
import { ImporForm } from "./ImporForm";
import { PengaturanForm } from "./PengaturanForm";
import { TabelPendaftar } from "./TabelPendaftar";

export const dynamic = "force-dynamic";

function wibLokal(d: Date | null): string {
  if (!d) return "";
  const t = new Date(d.getTime() + 7 * 3600_000);
  return t.toISOString().slice(0, 16);
}

/** "29 Sep 15.02" dalam WIB. */
function waktuWib(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default async function PendaftaranPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acara = await getAcaraBySlug(slug);
  if (!acara) notFound();
  const dariNawa = slug.startsWith("nawa-");
  const [rows, base, golongan, targetAwal, seriAda, nawa] = await Promise.all([
    listOrangAcara(acara.id),
    baseUrl(),
    listKlasifikasi({ hanyaAktif: true }),
    listTargetAcaraId(acara.id),
    listSeri(),
    dariNawa ? getCacheNawa(acara.id) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHead title="Pendaftaran & QR">
        {tglPendek(acara.tanggal)}{acara.pemateri ? ` · ${acara.pemateri}` : ""} · {rows.length} orang terdaftar · tautan daftar publik:{" "}
        {acara.terimaPendaftaran ? <a className="underline" href={`/daftar/${slug}`} target="_blank">{base}/daftar/{slug}</a> : <span className="text-muted-foreground">tertutup (nyalakan di pengaturan)</span>}
      </PageHead>

      {dariNawa && (
        <div className="mb-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-14 font-semibold">Sumber: NAWA</h2>
          <p className="mt-1 text-12 text-muted-foreground">
            {nawa ? (
              <>
                Tarikan terakhir {waktuWib(nawa.ditarikAt)} WIB
                {nawa.ringkas && (
                  <>
                    {" "}· terdaftar {nawa.ringkas.terdaftar}
                    {nawa.ringkas.kuota != null && ` / kuota ${nawa.ringkas.kuota}`} · hadir {nawa.ringkas.hadir} · batal {nawa.ringkas.batalHadir} · walk-in {nawa.ringkas.walkIn} · ikhwan {nawa.ringkas.ikhwan.hadir}/{nawa.ringkas.ikhwan.terdaftar} · akhwat {nawa.ringkas.akhwat.hadir}/{nawa.ringkas.akhwat.terdaftar}
                  </>
                )}
              </>
            ) : (
              "Belum pernah ditarik."
            )}
          </p>
          {nawa?.galatTerakhir && nawa.galatAt && nawa.galatAt > nawa.ditarikAt && (
            <p className="mt-1 text-12 text-amber-700">Tarikan {waktuWib(nawa.galatAt)} WIB gagal: {nawa.galatTerakhir}. Angka di atas dari tarikan terakhir yang berhasil.</p>
          )}
          <div className="mt-3">
            <TarikNawa slugAwal={nawa?.nawaSlug ?? slug.slice("nawa-".length)} tetap />
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <PengaturanForm
          slug={slug}
          awal={{ jamMulai: acara.jamMulai?.slice(0, 5) ?? "", toleransiMenit: acara.toleransiMenit, scanBuka: wibLokal(acara.scanBukaAt), scanTutup: wibLokal(acara.scanTutupAt), terimaPendaftaran: acara.terimaPendaftaran, pemateri: acara.pemateri ?? "", lokasi: acara.lokasi ?? "", tema: acara.tema ?? "", seri: acara.seri ?? "" }}
          golongan={golongan.map((g) => ({ id: g.id, nama: g.nama }))}
          targetAwal={targetAwal}
          seriAda={seriAda}
        />
        <ImporForm slug={slug} />
      </div>

      <TabelPendaftar slug={slug} base={base} rows={rows.map((o) => ({ id: o.id, nama: o.nama, gender: o.gender, program: o.programTeks, konfirmasi: o.konfirmasi, alasan: o.alasan, kode: o.kodeQr, punyaWa: Boolean(o.wa), wa: o.wa }))} />
    </>
  );
}
