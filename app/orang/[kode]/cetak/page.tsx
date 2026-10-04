import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireStaff } from "@/lib/acara/access";
import { baseUrl } from "@/lib/hadir/base-url";
import { urlQr } from "@/lib/hadir/kode";
import { getOrangCv } from "@/lib/orang/cv";
import { LABEL_SUMBER, labelPeran, ringkasKegiatan, ringkasMengajar, ringkasTautan } from "@/lib/orang/cv-view";
import { getPenilaianOrang } from "@/lib/penilaian/cv";
import { getTrackRecord } from "@/lib/orang/riwayat";
import { jakartaDate } from "@/lib/time/jakarta";
import { TombolCetak } from "./TombolCetak";

export const metadata = { title: "Cetak CV" };
export const dynamic = "force-dynamic";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
};
const STATUS: Record<string, string> = { hadir: "Hadir", terlambat: "Terlambat", mangkir: "Bilang bisa, tidak datang", tidak_hadir: "Tidak hadir" };

function Bagian({ no, judul, children }: { no: string; judul: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-neutral-300 pt-3">
      <h2 className="flex items-baseline gap-2 text-15 font-semibold">
        <span className="font-mono text-12 text-neutral-500">{no}</span>
        {judul}
      </h2>
      <div className="mt-2 text-13">{children}</div>
    </section>
  );
}

/**
 * CV siap cetak (rekomendasi Batch 3): dokumen A4 bernomor 01–07, tanpa rail
 * dan topbar, dengan tombol cetak yang tersembunyi di kertas. Isinya sama
 * dengan /orang/[kode]; hanya tata letaknya yang untuk kertas.
 */
export default async function CetakCvPage({ params }: { params: Promise<{ kode: string }> }) {
  await requireStaff();
  const { kode } = await params;
  const cv = await getOrangCv(kode);
  if (!cv) notFound();
  const [nilai, track, qr] = await Promise.all([
    getPenilaianOrang(cv.orang.id),
    getTrackRecord(cv.orang.id),
    baseUrl().then((b) => QRCode.toString(urlQr(b, cv.orang.kodeQr), { type: "svg", errorCorrectionLevel: "M", margin: 0, width: 72 })),
  ]);
  const mengajar = ringkasMengajar(cv.halaqah, cv.jadiBadal);
  const kegiatan = ringkasKegiatan(cv.kegiatan);
  const tautan = ringkasTautan(cv.tautan);
  const catatan = nilai.catatan.filter((c) => c.jenis === "kelebihan" || c.jenis === "kekurangan");

  return (
    <main className="mx-auto max-w-[794px] bg-white px-10 py-8 text-neutral-900 print:max-w-none print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 16mm 14mm; } @media print { body { background: #fff !important; } }`}</style>
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/orang/${cv.orang.kodeQr}`} className="text-12 text-neutral-500 hover:underline">
          ← Kembali ke CV
        </Link>
        <TombolCetak />
      </div>

      <header className="flex items-start justify-between gap-6">
        <div>
          <div className="text-11 font-semibold uppercase tracking-wide text-neutral-500">Curriculum vitae · Div. Kaderisasi & Amaliyyah</div>
          <h1 className="mt-1 text-24 font-bold leading-tight">{cv.orang.nama}</h1>
          <p className="mt-1 text-13 text-neutral-600">
            {cv.orang.gender === "P" ? "Akhwat" : "Ikhwan"} · {cv.orang.programTeks ?? "program belum diisi"} · {cv.orang.kategori}
          </p>
          <p className="mt-0.5 text-11 text-neutral-500">Dicetak {tgl(jakartaDate())} · kode {cv.orang.kodeQr}</p>
        </div>
        <div className="size-[72px] shrink-0 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
      </header>

      <div className="mt-6 flex flex-col gap-4">
        <Bagian no="01" judul="Akun & peran">
          {tautan.length === 0 ? (
            <p className="text-neutral-500">Belum ada akun program yang tertaut.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {tautan.map((t) => (
                <li key={`${t.sumber}-${t.peran}`} className="rounded border border-neutral-300 px-2 py-0.5 text-12">
                  {LABEL_SUMBER[t.sumber] ?? t.sumber} · {labelPeran(t.peran)}
                  {t.program.length > 0 && <span className="text-neutral-500"> ({t.program.join(", ")})</span>}
                </li>
              ))}
            </ul>
          )}
        </Bagian>

        <Bagian no="02" judul="Mengajar">
          {mengajar.perProgram.length === 0 ? (
            <p className="text-neutral-500">Belum ada halaqah tersinkron.</p>
          ) : (
            <>
              <p className="text-neutral-600">
                {mengajar.totalHalaqah} halaqah · {mengajar.totalSelesai} pertemuan selesai
                {mengajar.jadiBadal > 0 && ` · ${mengajar.jadiBadal} pertemuan sebagai badal`}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {mengajar.perProgram.map((p) => (
                  <li key={p.programSlug}>
                    <b>{p.programNama}</b>: {p.halaqah.map((h) => h.halaqah).join(", ")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Bagian>

        <Bagian no="03" judul="Ringkasan penilaian">
          {nilai.kpi.length === 0 ? (
            <p className="text-neutral-500">Belum ada penilaian.</p>
          ) : (
            <table className="w-full border-collapse text-12">
              <thead>
                <tr className="border-b border-neutral-300 text-left text-neutral-500">
                  <th className="py-1 font-semibold">KPI</th>
                  <th className="py-1 font-semibold">Nilai</th>
                  <th className="py-1 font-semibold">Dasar</th>
                </tr>
              </thead>
              <tbody>
                {nilai.kpi.map((k) => (
                  <tr key={k.kpiId} className="border-b border-neutral-200">
                    <td className="py-1">{k.nama} <span className="text-neutral-500">({k.jenis})</span></td>
                    <td className="py-1 font-semibold">{k.ringkas ?? "—"}</td>
                    <td className="py-1 text-neutral-600">{k.jumlah} penilaian{k.jumlah === 1 ? " (satu penilai)" : ", median"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Bagian>

        <Bagian no="04" judul="Kepanitiaan & peran">
          {nilai.kepanitiaan.length === 0 ? (
            <p className="text-neutral-500">Belum tercatat sebagai panitia.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {nilai.kepanitiaan.map((p) => (
                <li key={p.acaraSlug}>
                  <b>{p.acara}</b> <span className="text-neutral-500">({tgl(p.tanggal)})</span> — {[p.divisi, p.peran].filter(Boolean).join(", ")}
                  {p.nilai.length > 0 && <span> · nilai {p.nilai.map((n) => n.nilai).join(" ")}</span>}
                  {p.evidence && <span className="block text-12 text-neutral-600">“{p.evidence}”</span>}
                </li>
              ))}
            </ul>
          )}
        </Bagian>

        <Bagian no="05" judul="Track record per tahun">
          <ul className="flex flex-col gap-1">
            {track.map((t) => (
              <li key={t.tahun} className="grid grid-cols-[48px_1fr] gap-2">
                <span className="font-mono font-semibold">{t.tahun}</span>
                <span>
                  {t.kosong
                    ? <span className="text-neutral-400">—</span>
                    : [
                        ...t.rutin.map((r) => `${r.label} ${r.hadir}×`),
                        ...t.kepanitiaan.map((p) => `panitia ${p.acara}`),
                        ...t.mandiri.map((m) => `${m.nama} (${m.peran}${m.menunggu ? ", belum diverifikasi" : ""})`),
                      ].join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Bagian>

        <Bagian no="06" judul="Kegiatan & kajian">
          <p className="text-neutral-600">
            {kegiatan.hadir} hadir dari {kegiatan.diundang} kajian · {kegiatan.terlambat} terlambat
            {kegiatan.mangkir > 0 && ` · ${kegiatan.mangkir} kali bilang bisa lalu tidak datang`}
          </p>
          {kegiatan.baris.length > 0 && (
            <ul className="mt-1 columns-2 gap-6 text-12">
              {kegiatan.baris.slice(0, 20).map((k) => (
                <li key={k.slug} className="break-inside-avoid">
                  {tgl(k.tanggal)} — {k.nama}: {STATUS[k.status] ?? k.status}
                </li>
              ))}
            </ul>
          )}
        </Bagian>

        <Bagian no="07" judul="Catatan kaderisasi">
          {catatan.length === 0 ? (
            <p className="text-neutral-500">Belum ada catatan.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {catatan.slice(0, 12).map((c, i) => (
                <li key={i}>
                  <b>{c.jenis === "kelebihan" ? "Kelebihan" : "Perlu dikembangkan"}</b>
                  {c.aspek.length > 0 && <span className="text-neutral-500"> ({c.aspek.join(", ")})</span>}: {c.isi}
                  <span className="text-12 text-neutral-500"> — {c.acara ? `${c.acara}, ` : ""}{tgl(c.tanggal)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bagian>
      </div>
    </main>
  );
}
