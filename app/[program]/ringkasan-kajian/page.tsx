import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getProgramConfig } from "@/lib/programs/config";
import { requireProgramAccess } from "@/lib/programs/resolve";
import {
  BULAN_PERTAMA,
  bulanDari,
  geserBulan,
  hariIniWib,
  labelBulan,
  ringkas,
  tanggalBulan,
} from "@/lib/ringkasan/hitung";
import { loadRingkasanBulan, loadRosterRingkasan } from "@/lib/ringkasan/queries";
import { waLink } from "@/lib/wa";
import { AturPeserta } from "./AturPeserta";
import { RingkasanGrid } from "./RingkasanGrid";

export const dynamic = "force-dynamic";

function fmtTanggal(t: string): string {
  return new Date(`${t}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default async function RingkasanKajianPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<{ bulan?: string }>;
}) {
  const { program: slug } = await params;
  const sp = await searchParams;
  const { program } = await requireProgramAccess(slug).catch(() => notFound());
  if (!getProgramConfig(program).features.ringkasan) notFound();

  const hariIni = hariIniWib();
  const bulanIni = bulanDari(hariIni);
  const diminta = sp.bulan && /^\d{4}-\d{2}$/.test(sp.bulan) ? sp.bulan : bulanIni;
  const bulan = diminta < BULAN_PERTAMA ? BULAN_PERTAMA : diminta > bulanIni ? bulanIni : diminta;

  const [baris, roster] = await Promise.all([
    loadRingkasanBulan(program.id, bulan),
    loadRosterRingkasan(program.id),
  ]);
  const tanggal = tanggalBulan(bulan);

  const hasil = baris.map((b) => ({
    b,
    r: ringkas(bulan, { mulai: b.mulai, selesai: b.selesai }, new Set(b.setor), hariIni),
  }));
  const berpersen = hasil.filter((h) => h.r.persen != null);
  const rata = berpersen.length
    ? Math.round(berpersen.reduce((s, h) => s + (h.r.persen ?? 0), 0) / berpersen.length)
    : null;
  const penuh = berpersen.filter((h) => h.r.persen === 100).length;
  const terpanjang = [...hasil].sort((a, b) => b.r.tunggakan - a.r.tunggakan)[0];
  const belumHariIni =
    bulan === bulanIni
      ? baris.filter(
          (b) => b.mulai <= hariIni && (!b.selesai || b.selesai >= hariIni) && !b.setor.includes(hariIni),
        )
      : [];

  const sebelum = bulan > BULAN_PERTAMA ? geserBulan(bulan, -1) : null;
  const sesudah = bulan < bulanIni ? geserBulan(bulan, 1) : null;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ringkasan Kajian Riyadus Shalihin</h1>
          <p className="text-sm text-muted-foreground">
            Ceklis setoran ringkasan harian, mulai 14 September 2026.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {sebelum ? (
            <Link href={`?bulan=${sebelum}`} className="rounded-md p-2 hover:bg-muted" aria-label="Bulan sebelumnya">
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className="p-2 opacity-30"><ChevronLeft className="size-4" /></span>
          )}
          <span className="min-w-[140px] text-center font-medium">{labelBulan(bulan)}</span>
          {sesudah ? (
            <Link href={`?bulan=${sesudah}`} className="rounded-md p-2 hover:bg-muted" aria-label="Bulan berikutnya">
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className="p-2 opacity-30"><ChevronRight className="size-4" /></span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Rata-rata kepatuhan</div>
            <div className="text-2xl font-semibold">{rata == null ? "—" : `${rata}%`}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Setor penuh</div>
            <div className="text-2xl font-semibold">
              {penuh}
              <span className="text-sm font-normal text-muted-foreground"> / {berpersen.length} peserta</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">Tunggakan terpanjang</div>
            <div className="text-2xl font-semibold">
              {terpanjang && terpanjang.r.tunggakan > 0 ? `${terpanjang.r.tunggakan} hari` : "—"}
            </div>
            {terpanjang && terpanjang.r.tunggakan > 0 && (
              <div className="truncate text-xs text-muted-foreground">{terpanjang.b.nama}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {bulan === bulanIni && baris.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Belum setor hari ini · {fmtTanggal(hariIni)}</CardTitle>
          </CardHeader>
          <CardContent>
            {belumHariIni.length === 0 ? (
              <p className="text-sm text-emerald-700">Semua peserta sudah setor hari ini.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {belumHariIni.map((b) => {
                  const link = waLink(
                    b.phone,
                    `Assalamu'alaikum Ibu ${b.nama}, afwan mengingatkan setoran ringkasan kajian Riyadus Shalihin hari ini (${fmtTanggal(hariIni)}). Jazakillahu khairan.`,
                  );
                  return (
                    <li key={b.id} className="flex items-center gap-2 rounded-full border border-border py-1 pl-3 pr-1 text-sm">
                      {b.nama}
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white"
                        >
                          WA
                        </a>
                      ) : (
                        <span className="px-2 text-xs text-muted-foreground">tanpa nomor</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <AturPeserta programSlug={slug} roster={roster} />
        <a
          href={`/api/reports/${slug}/ringkasan-kajian?bulan=${bulan}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Download className="size-4" /> Export xlsx
        </a>
      </div>

      {baris.length === 0 ? (
        <EmptyState
          title="Belum ada peserta di bulan ini"
          description="Tekan “Atur peserta” untuk memilih peserta yang wajib setor ringkasan."
        />
      ) : (
        <RingkasanGrid programSlug={slug} bulan={bulan} tanggal={tanggal} hariIni={hariIni} baris={baris} />
      )}
    </main>
  );
}
