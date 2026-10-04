import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { cn } from "@/lib/utils";
import { kartu, labelMikro, tombolGaris, tombolUtama } from "@/components/lintas/brand";
import { requireStaff } from "@/lib/acara/access";
import { antreanRiwayat } from "@/lib/orang/riwayat";
import { LABEL_PERAN_RIWAYAT, namaKegiatan, type PeranRiwayat } from "@/lib/orang/riwayat-template";
import { verifikasiAction } from "./actions";

export const metadata = { title: "Verifikasi riwayat" };
export const dynamic = "force-dynamic";

/**
 * Antrean verifikasi riwayat mandiri 2022–2025. Isian tidak dihitung ke CV/KPI
 * sebelum dicentang di sini. Tombol per orang (terima/tolak semua) dan per
 * entri; form biasa, jalan tanpa JS.
 */
export default async function VerifikasiRiwayatPage() {
  const user = await requireStaff();
  const antrean = await antreanRiwayat();
  const total = antrean.reduce((n, o) => n + o.entri.length, 0);
  return (
    <AppShell email={user.email} title="Verifikasi riwayat" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[900px] space-y-4 px-4 py-6 sm:px-6">
        <header>
          <Link href="/penilaian" className="text-12 text-ink-muted hover:text-primary">← Penilaian</Link>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Verifikasi riwayat 2022–2025</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {total} kegiatan dari {antrean.length} orang menunggu. Orang mengisi sendiri lewat tautan di kartu QR-nya
            (/h/kode/riwayat); yang diterima masuk ke Track record di CV.
          </p>
        </header>
        {antrean.length === 0 ? (
          <p className={cn(kartu, "px-5 py-8 text-center text-sm text-ink-muted")}>Tidak ada isian yang menunggu.</p>
        ) : (
          antrean.map((o) => (
            <section key={o.orangId} className={cn(kartu, "rounded-2xl px-5 py-[18px]")}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/orang/${o.kodeQr}`} className="text-16 font-semibold hover:text-primary hover:underline">
                  {o.nama}
                </Link>
                <span className="text-12 text-ink-muted">{o.entri.length} kegiatan</span>
                <form action={verifikasiAction} className="ml-auto flex gap-2">
                  {o.entri.map((e) => (
                    <input key={e.id} type="hidden" name="id" value={e.id} />
                  ))}
                  <button name="status" value="terverifikasi" className={tombolUtama}>Terima semua</button>
                  <button name="status" value="ditolak" className={tombolGaris}>Tolak semua</button>
                </form>
              </div>
              <ul className="mt-3 divide-y divide-border">
                {o.entri.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-14">
                    <span className={cn(labelMikro, "w-12")}>{e.tahun}</span>
                    <span className="min-w-0 flex-1">
                      {namaKegiatan(e.kegiatan)}
                      <span className="text-12 text-ink-muted"> · {LABEL_PERAN_RIWAYAT[e.peran as PeranRiwayat] ?? e.peran}</span>
                    </span>
                    <form action={verifikasiAction} className="flex gap-1.5">
                      <input type="hidden" name="id" value={e.id} />
                      <button name="status" value="terverifikasi" className="h-8 rounded-lg border border-border px-2.5 text-12 hover:border-primary hover:text-primary">Terima</button>
                      <button name="status" value="ditolak" className="h-8 rounded-lg border border-border px-2.5 text-12 text-ink-muted hover:border-neutral-400">Tolak</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </AppShell>
  );
}
