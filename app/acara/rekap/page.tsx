import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import {
  anggotaPerGolongan,
  barisRekap,
  listKlasifikasi,
  listSeri,
  listSesiRekap,
  listTargetAcara,
} from "@/lib/hadir/queries-golongan";
import { bandingSesi, namaBerulang, pivotGolongan, rekapSesi, type TargetSesi } from "@/lib/hadir/rekap";
import { PageHead } from "../[slug]/_ui";
import { antarPemateri, bacaDefinisiRutin, matriksLoyalitas, ringkasRutin } from "@/lib/hadir/rekap-rutin";
import { BlokBerulang, BlokGolongan, BlokPerSesi } from "./RekapView";
import { RekapRingkas } from "./RekapRingkas";
import { todayJakarta } from "@/lib/time/jakarta";

export const metadata = { title: "Rekap kajian" };
export const dynamic = "force-dynamic";

const input = "rounded border border-neutral-300 px-2 py-1.5 text-12 dark:border-neutral-700 dark:bg-neutral-900";

export default async function RekapPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const f = { seri: sp.seri || null, dari: sp.dari || null, sampai: sp.sampai || null };

  const [sesi, seriAda, golongan, anggota] = await Promise.all([
    listSesiRekap(f),
    listSeri(),
    listKlasifikasi(),
    anggotaPerGolongan(),
  ]);
  const acaraIds = sesi.map((s) => s.acaraId);
  const [hadir, targetPerSesi] = await Promise.all([
    barisRekap(acaraIds),
    Promise.all(acaraIds.map((id) => listTargetAcara(id))),
  ]);
  const target: TargetSesi[] = targetPerSesi.flat();

  const rekap = rekapSesi(sesi, hadir, target, anggota);
  const deltas = bandingSesi(rekap);
  const berulang = namaBerulang(hadir);
  const slugHadir = [...new Set(rekap.flatMap((r) => r.perGolongan.map((g) => g.slug)))];
  const pivot = pivotGolongan(rekap, slugHadir);
  const kolomQism = [...new Set(rekap.flatMap((r) => r.perQism.map((q) => q.qism)))];
  const namaGolongan = new Map(golongan.map((g) => [g.slug, g.nama]));
  // Ringkasan loyalitas hanya atas sesi yang sudah berlangsung — sesi mendatang
  // (0 hadir) menurunkan % rutin dan retensi tanpa arti.
  const hariIni = todayJakarta();
  const sesiLewat = sesi.filter((s) => String(s.tanggal) <= hariIni);
  const rutin = ringkasRutin(sesiLewat, hadir, bacaDefinisiRutin(sp.rutin_min, sp.rutin_dari));
  const pemateri = antarPemateri(sesiLewat, hadir);
  const loyalitas = matriksLoyalitas(rutin.sesiJendela, hadir);
  const qs = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, String(v)]),
  ).toString();

  return (
    <AppShell email={user.email} title="Rekap kajian" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[1200px] px-6 py-6">
        <PageHead
          title="Rekap kajian"
          right={
            <Link href={`/api/hadir/rekap/xlsx${qs ? `?${qs}` : ""}`} className="rounded border border-neutral-300 px-3 py-1.5 text-12 dark:border-neutral-700">
              Unduh xlsx
            </Link>
          }
        >
          Ustadz, tema, tanggal, total, ikhwan, akhwat, dan prodi per sesi; dibandingkan antar sesi dalam satu seri; plus nama berulang per gender.
        </PageHead>

        <form className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-12">
            Seri
            <select name="seri" defaultValue={f.seri ?? ""} className={`${input} block`}>
              <option value="">Semua seri</option>
              {seriAda.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-12">Dari<input type="date" name="dari" defaultValue={f.dari ?? ""} className={`${input} block`} /></label>
          <label className="text-12">Sampai<input type="date" name="sampai" defaultValue={f.sampai ?? ""} className={`${input} block`} /></label>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-12 text-white dark:bg-neutral-100 dark:text-neutral-900">Saring</button>
        </form>

        {sesi.length === 0 ? (
          <p className="text-12 text-muted-foreground">Belum ada sesi yang cocok dengan saringan.</p>
        ) : (
          <div className="grid gap-4">
            <RekapRingkas rutin={rutin} rekap={rekap.filter((r) => String(r.tanggal) <= hariIni)} pemateri={pemateri} loyalitas={loyalitas} qsDasar={qs} />
            <BlokPerSesi rekap={rekap} deltas={deltas} kolomQism={kolomQism} />
            <BlokBerulang sebaran={berulang.sebaran} orang={berulang.orang} rekap={rekap} />
            <BlokGolongan pivot={pivot} rekap={rekap} namaGolongan={namaGolongan} />
          </div>
        )}
      </main>
    </AppShell>
  );
}
