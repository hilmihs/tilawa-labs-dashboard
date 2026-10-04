import { EmptyState } from "@/components/ui/empty-state";
import { getAsesmenAlfatihah, resolvePreset } from "@/lib/insights/alfatihah";
import { alfatihahBaseUrl } from "@/lib/scorecard/metrics/alfatihah";
import { AsesmenView, type Query } from "./AsesmenView";

export const metadata = { title: "Asesmen al-Fatihah" };
// The source is a live HTTP read (nothing about it is stored locally), so this
// page can never be prerendered — the build image cannot reach the API.
export const dynamic = "force-dynamic";

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AsesmenPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ program }, sp] = await Promise.all([params, searchParams]);
  const query: Query = {
    preset: pick(sp.preset),
    gender: pick(sp.gender),
    q: pick(sp.q),
    flag: pick(sp.flag),
    // Canonical kegiatan group key. Resolved inside the insight module against
    // the hand-written map; an unknown key resolves to null and simply does not
    // scope, rather than emptying the page.
    kg: pick(sp.kg),
  };

  const host = alfatihahBaseUrl().replace(/^https?:\/\//, "");
  const preset = resolvePreset(query.preset);

  // Upstream drops connections under paging; `source.ts` retries every page
  // before giving up. If it still fails, say so — an empty page here would read
  // as "tidak ada asesmen", which is a different and wrong statement.
  let data: Awaited<ReturnType<typeof getAsesmenAlfatihah>> | null = null;
  let error: string | null = null;
  try {
    data = await getAsesmenAlfatihah(query);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    // Wide tables (10 columns, long free-text kegiatan names) — same frame as
    // /[program]/silabus.
    <main className="mx-auto w-full max-w-[1600px] px-6 py-8 space-y-6">
      <div>
        <h1 className="text-20 font-bold tracking-[-0.01em]">Asesmen al-Fatihah</h1>
        <p className="mt-1 max-w-4xl text-14 text-ink-muted">
          Hasil pemeriksaan bacaan al-Fatihah (skor 1–10) yang diinput pemeriksa di aplikasi
          asesmen. Sumbernya berlaku untuk seluruh divisi, bukan per program: tiap penilaian hanya
          menyimpan teks bebas <code className="text-12">kegiatan</code>, tanpa id program — jadi
          halaman ini menyajikan seluruh sumber dan menyediakan saringan kegiatan.
        </p>
        <p className="mt-1.5 text-11 text-ink-faint">
          Dibaca langsung dari{" "}
          <a
            href={`${alfatihahBaseUrl()}/api/recitation-evaluations`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Buka ${host} di tab baru`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {host}
          </a>{" "}
          setiap kali halaman dibuka (di-cache 10 menit) — tidak ada tabel lokal untuk data ini.
          Angka yang sama memasok KPI scorecard C312.
        </p>
      </div>

      {error ? (
        <EmptyState
          icon="⚠️"
          title="Data asesmen belum bisa diambil"
          description={
            <>
              API asesmen di <code>{host}</code> tidak menjawab setelah beberapa percobaan, jadi
              tidak ada angka yang bisa ditampilkan — halaman ini sengaja tidak menebak. Muat ulang
              beberapa saat lagi. Pesan teknis: <code>{error}</code>
            </>
          }
        />
      ) : data ? (
        <AsesmenView data={data} base={`/${program}/asesmen`} query={query} sumber={host} />
      ) : (
        <EmptyState title={`Tidak ada data untuk ${preset.label.toLowerCase()}`} />
      )}
    </main>
  );
}
