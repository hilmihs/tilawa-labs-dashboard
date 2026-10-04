import Link from "next/link";
import { sql } from "drizzle-orm";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import { getDb } from "@/lib/db/client";
import { todayJakarta } from "@/lib/time/jakarta";
import { FormCatatan } from "./FormCatatan";

export const metadata = { title: "Catatan cepat" };
export const dynamic = "force-dynamic";

/** Catatan cepat tim kaderisasi saat acara (design "Input Penilaian" p3). */
export default async function CatatanCepatPage({ searchParams }: { searchParams: Promise<{ orang?: string }> }) {
  const user = await requireStaff();
  const db = getDb();
  const { orang: kodeAwal } = await searchParams;
  const hariIni = todayJakarta();
  const [orangRes, acaraRes] = await Promise.all([
    db.execute(sql`select id, nama, gender, kode_qr from orang where gabung_ke_id is null and status = 'aktif' order by nama`),
    // Kegiatan 60 hari terakhir s.d. 14 hari ke depan — yang masuk akal dicatat.
    db.execute(sql`
      select id, nama, tanggal::text tanggal from acara
      where tanggal between (${hariIni}::date - 60) and (${hariIni}::date + 14)
      order by tanggal desc`),
  ]);
  const orang = orangRes.rows as { id: string; nama: string; gender: string; kode_qr: string }[];
  // Dari tombol di CV: orang itu langsung terpilih, dan ada jalan kembali.
  const orangAwal = kodeAwal ? (orang.find((o) => o.kode_qr === kodeAwal) ?? null) : null;
  const acara = acaraRes.rows as { id: string; nama: string; tanggal: string }[];
  // Kegiatan hari ini (atau terdekat yang sudah lewat) terpilih lebih dulu.
  const awal = acara.find((a) => a.tanggal === hariIni) ?? acara.find((a) => a.tanggal <= hariIni) ?? null;

  return (
    <AppShell email={user.email} title="Catatan cepat" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-md space-y-4 px-4 py-5">
        <header>
          <Link href={orangAwal ? `/orang/${orangAwal.kode_qr}` : "/penilaian"} className="text-xs text-neutral-500 hover:text-primary">
            ← {orangAwal ? `CV ${orangAwal.nama}` : "Penilaian"}
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Catatan cepat</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Catat kejadian saat itu juga — masuk ke CV sebagai evaluasi deskriptif.</p>
        </header>
        <FormCatatan
          orang={orang.map(({ id, nama, gender }) => ({ id, nama, gender }))}
          orangAwal={orangAwal ? { id: orangAwal.id, nama: orangAwal.nama, gender: orangAwal.gender } : null}
          acara={acara}
          acaraAwal={awal?.id ?? null}
        />
      </main>
    </AppShell>
  );
}
