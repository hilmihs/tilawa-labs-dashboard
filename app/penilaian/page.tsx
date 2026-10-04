import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import { daftarAcaraPenilaian, kpiPanitia } from "@/lib/penilaian/queries";

export const metadata = { title: "Penilaian" };
export const dynamic = "force-dynamic";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
};

/** Titik masuk penilaian Div. Kaderisasi: satu baris per acara yang punya panitia. */
export default async function PenilaianPage() {
  const user = await requireStaff();
  const [acara, kpi] = await Promise.all([daftarAcaraPenilaian(), kpiPanitia()]);
  const terbuka = acara.filter((a) => a.dinilai < a.panitia);

  return (
    <AppShell email={user.email} title="Penilaian" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[1100px] space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Penilaian</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Nilai panitia per acara (B/C/D/E) — masuk ke CV tiap orang di Daftar Individu. {terbuka.length} acara masih
            punya panitia yang belum dinilai.
          </p>
          </div>
          <Link
            href="/penilaian/catatan"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            + Catatan cepat
          </Link>
          <Link
            href="/penilaian/riwayat"
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm hover:border-neutral-400"
          >
            Verifikasi riwayat
          </Link>
        </header>

        {acara.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-neutral-500">
            Belum ada acara dengan data panitia.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {acara.map((a) => {
              const pct = a.panitia ? Math.round((100 * a.dinilai) / a.panitia) : 0;
              return (
                <li key={a.id}>
                  <Link href={`/penilaian/${a.slug}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{a.nama}</div>
                      <div className="text-xs text-neutral-500">
                        {tgl(a.tanggal)} · {a.status} · {a.panitia} panitia
                        {a.belumTertaut > 0 && <span className="text-amber-600"> · {a.belumTertaut} belum tertaut</span>}
                      </div>
                    </div>
                    <div className="w-40">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-500">dinilai</span>
                        <span className="font-mono tabular-nums">
                          {a.dinilai}/{a.panitia}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded bg-neutral-100 dark:bg-neutral-800">
                        <div className={`h-full rounded ${pct === 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <section className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">Rubrik KPI panitia</h2>
          <ul className="mt-2 space-y-1.5 text-xs">
            {kpi.map((k) => (
              <li key={k.id}>
                <span className="font-medium">{k.nama}</span>{" "}
                <span className="text-neutral-500">
                  · {k.jenis}
                  {k.otomatis ? " · disarankan otomatis" : ""}
                  {k.deskripsi?.catatan ? ` — ${k.deskripsi.catatan}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-neutral-400">Definisi B/C/D/E per KPI menunggu tim kaderisasi.</p>
        </section>
      </main>
    </AppShell>
  );
}
