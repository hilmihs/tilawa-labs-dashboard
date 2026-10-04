import { notFound } from "next/navigation";
import { getProgram } from "@/lib/programs/resolve";
import { getLastSync, lastSyncLabel } from "@/lib/sync/last-sync";
import { Card, CardContent } from "@/components/ui/card";
import { getSambunganData } from "./queries";
import { SambunganPanel } from "./SambunganPanel";

export const metadata = { title: "Sambungan Akun — HKM" };
// Membaca master + akun tertarik apa adanya; tidak ada yang bisa di-prerender.
export const dynamic = "force-dynamic";

/**
 * Layar kerja untuk satu pertanyaan: siapa yang setorannya belum terhitung, dan
 * apa satu tindakan yang membereskannya.
 *
 * Hanya untuk program berkah_api (HKM) — program lain tidak punya akun the partner system
 * untuk disambungkan, dan tabnya memang tidak muncul di sana (lib/programs/nav.ts).
 * Akses sudah dijaga app/[program]/layout.tsx (requireProgramAccess), jadi
 * koordinator program ini boleh membereskan sambungannya sendiri.
 */
export default async function SambunganPage({ params }: { params: Promise<{ program: string }> }) {
  const { program: slug } = await params;
  const program = await getProgram(slug);
  if (!program || program.dataSourceType !== "berkah_api") notFound();

  const [data, lastSync] = await Promise.all([getSambunganData(slug), getLastSync(slug)]);
  if (!data) notFound();

  const sync = lastSyncLabel(lastSync);
  const perluTindakan = data.rows.filter((r) => r.sebab !== "belum_setor").length;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-8 space-y-6">
      <div>
        <h1 className="text-20 font-bold tracking-[-0.01em]">Sambungan Akun Setoran</h1>
        <p className="mt-1 max-w-3xl text-14 text-ink-muted">
          Setoran seorang peserta baru terhitung kalau baris namanya di sini tersambung ke akun
          aplikasi Nafi&apos; miliknya, dan akun itu ditandai sebagai peserta internal. Halaman ini
          menunjukkan yang belum beres beserta sebabnya — semuanya bisa dibereskan dari sini, tidak
          perlu minta bantuan teknis.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 py-4 text-sm">
          <div>
            <div className="text-11 uppercase tracking-wide text-ink-faint">Perlu dibereskan</div>
            <div className="text-18 font-semibold tabular-nums">{perluTindakan}</div>
          </div>
          <div>
            <div className="text-11 uppercase tracking-wide text-ink-faint">Sudah terhitung</div>
            <div className="text-18 font-semibold tabular-nums">
              {data.totalTerhitung}
              <span className="text-14 font-normal text-ink-muted"> / {data.totalPeserta}</span>
            </div>
          </div>
          <div>
            <div className="text-11 uppercase tracking-wide text-ink-faint">Tarikan data terakhir</div>
            <div
              className={
                sync.tone === "bad" ? "text-danger" : sync.tone === "warn" ? "text-warn" : "text-ink-muted"
              }
            >
              {sync.text}
            </div>
          </div>
        </CardContent>
      </Card>

      <SambunganPanel
        programSlug={slug}
        rows={data.rows}
        totalPeserta={data.totalPeserta}
        totalTerhitung={data.totalTerhitung}
      />

      {data.akunNganggur.length > 0 && (
        <details className="text-13 text-ink-muted">
          <summary className="cursor-pointer font-medium text-ink">
            Akun tertarik yang tidak punya baris peserta ({data.akunNganggur.length})
          </summary>
          <p className="mt-2 max-w-3xl">
            Akun-akun ini ikut tertarik dari Nafi&apos; tapi namanya tidak ada di daftar peserta HKM —
            biasanya pegawai lain yang memakai aplikasi yang sama. Dibiarkan saja tidak apa-apa;
            setorannya tidak masuk hitungan program.
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {data.akunNganggur.slice(0, 40).map((a) => (
              <li key={a.berkahUserId} className="text-12">
                {a.nama ?? "(tanpa nama)"} · {a.email ?? "tanpa email"}
                {a.hariSetoran > 0 ? ` · ${a.hariSetoran} hari setoran` : ""}
              </li>
            ))}
          </ul>
          {data.akunNganggur.length > 40 && (
            <p className="mt-1 text-12 text-ink-faint">…dan {data.akunNganggur.length - 40} lainnya.</p>
          )}
        </details>
      )}
    </main>
  );
}
