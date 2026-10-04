/**
 * `/[program]/observasi` — log keterangan harian ketua kelas untuk satu program
 * HITS, beserta pelanggaran, tabayyun, dan hutang-bayar yang menempel padanya.
 *
 * Layar ini adalah DRILL-DOWN, bukan rapor. `docs/API-PUBLIC.md` §9 melarang
 * menurunkan ulang angka rekap dari entitas mentah, dan angka disiplin resmi
 * sudah punya rumahnya sendiri di `/[program]/disiplin` (yang membaca payload
 * `rekap/hits-disiplin`). Tujuh aturan bisnis yang membentuk angka itu tinggal
 * di Maahir; mengkloningnya ke sini hanya akan membuat dua layar berselisih.
 * Karena itu di halaman ini tidak ada persentase, rata-rata, peringkat, atau
 * skor — yang ada hanya cacah baris yang sedang dirender, dan itu dinyatakan
 * terang-terangan.
 *
 * Route ini hanya untuk program dengan pin batch Maahir; tanpa pin tidak ada
 * cara menentukan halaqah mana yang miliknya, jadi `notFound()`.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncStatus } from "@/components/ui/sync-status";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { hasMaahirPin } from "@/lib/programs/nav";
import { getProgram } from "@/lib/programs/resolve";
import { ObservasiTable } from "./ObservasiTable";
import { bulanPilihan, labelBulan, loadObservasi, resolveBulan } from "./queries";

export const metadata = { title: "Observasi Harian" };
// Baca DB tiap request — isinya berubah setiap sync Maahir jalan.
export const dynamic = "force-dynamic";

/**
 * Next menyerahkan `?bulan=a&bulan=b` sebagai array, bukan string. Diambil yang
 * pertama, sama seperti `app/[program]/asesmen/page.tsx` — mengetiknya sebagai
 * `string` saja membuat tipe berbohong tentang apa yang benar-benar tiba.
 */
function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}


const SHELL = "mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8";

function BulanPicker({ program, aktif }: { program: string; aktif: string }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-800">
      {bulanPilihan().map((b) => (
        <Link
          key={b}
          href={`/${program}/observasi?bulan=${b}`}
          className={`rounded-md px-2.5 py-1 text-xs ${
            b === aktif
              ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          }`}
        >
          {labelBulan(b)}
        </Link>
      ))}
    </div>
  );
}

function Shell({
  program,
  bulan,
  children,
}: {
  program: string;
  bulan: string;
  children: React.ReactNode;
}) {
  return (
    <main className={SHELL}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-20 font-bold tracking-[-0.01em]">Observasi Harian</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Keterangan harian yang diisi ketua kelas untuk tiap pertemuan HITS, beserta
            pelanggaran, tabayyun, dan hutang-bayar yang lahir darinya.
          </p>
        </div>
        <BulanPicker program={program} aktif={bulan} />
      </div>
      {/* Satu baris, selalu terlihat: layar ini mencacah catatan, bukan menilai. */}
      <p className="-mt-4 text-12 text-ink-muted">
        Daftar catatan mentah — tanpa persentase, rata-rata, atau peringkat. Angka disiplin resmi
        ada di{" "}
        <Link href={`/${program}/disiplin`} className="underline underline-offset-2">
          tab Disiplin
        </Link>
        , yang membaca rekap Maahir.
      </p>
      {children}
    </main>
  );
}

export default async function ObservasiPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ program: slug }, sp] = await Promise.all([params, searchParams]);
  const bulanParam = pick(sp.bulan);
  const halaqahParam = pick(sp.halaqah);
  const programRow = await getProgram(slug);
  if (!programRow || !hasMaahirPin(programRow.config)) notFound();

  const bulan = resolveBulan(bulanParam);
  const data = await loadObservasi(programRow, bulan, halaqahParam);

  // Gerbang di atas sudah menolak program tanpa pin, jadi cabang ini tidak bisa
  // tercapai lewat route ini — tetap ditulis supaya `queries.ts` boleh jujur
  // dan bisa dipakai ulang dari tempat yang tidak punya gerbang itu.
  if (data.state === "tanpa-pin") {
    return (
      <Shell program={slug} bulan={bulan}>
        <EmptyState
          title="Pin batch Maahir belum diisi"
          description={
            <>
              Program ini belum punya <code>config.maahirHitsBatchId</code>, jadi belum bisa
              diketahui halaqah mana yang miliknya. Cermin Maahir memuat seluruh HITS sekaligus;
              tanpa pin, isinya bukan milik program ini. Jalankan skrip pengisian pin batch lebih
              dulu.
            </>
          }
        />
      </Shell>
    );
  }

  if (data.state === "scope-ditolak") {
    return (
      <Shell program={slug} bulan={bulan}>
        <EmptyState
          title="Scope belum diberikan"
          description="Kunci API Maahir yang dipakai dashboard dijawab 403 forbidden_scope untuk hits/keterangan-harian, jadi catatannya tidak pernah sampai ke sini. Ini bukan berarti tidak ada catatan — mintakan scope `hits` pada kunci tersebut."
        />
      </Shell>
    );
  }

  if (data.state === "belum-ditarik") {
    return (
      <Shell program={slug} bulan={bulan}>
        <EmptyState
          title="Keterangan harian belum pernah ditarik"
          description="Belum ada satu pun baris hits/keterangan-harian di maahir_sync, jadi tidak ada catatan yang bisa ditampilkan — bukan nol catatan. Jalankan sync Maahir lebih dulu."
        />
      </Shell>
    );
  }

  if (data.state === "mirror-kosong") {
    return (
      <Shell program={slug} bulan={bulan}>
        <EmptyState
          title="Daftar halaqah batch ini belum tersinkron"
          description={`Catatan hariannya ada, tapi cermin hits/halaqah tidak memuat satu pun halaqah untuk batch ${data.batchIds.join(", ")} — tanpa itu barisnya tidak bisa disaring ke program ini. Jalankan sync Maahir lebih dulu.`}
        />
      </Shell>
    );
  }

  const { view, terakhirDitarik, fokus, halaqahBatch, tanpaTautan } = data;
  const { ringkas } = view;

  return (
    <Shell program={slug} bulan={bulan}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-ink-muted">
        <SyncStatus at={terakhirDitarik} prefix="Terakhir ditarik" />
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {ringkas.keterangan} catatan · {ringkas.pelanggaran} pelanggaran · {ringkas.tabayyun}{" "}
          tabayyun ({ringkas.tabayyunBelumDiputus} belum diputus) · {ringkas.hutang} hutang-bayar
        </span>
        <span aria-hidden>·</span>
        <span>semuanya cacah baris mentah, bukan angka rekap</span>
        {tanpaTautan > 0 && (
          <>
            <span aria-hidden>·</span>
            <span
              title="Nama halaqah Maahir dicocokkan ke halaqah_sync; yang meleset atau bertabrakan tampil sebagai teks biasa, barisnya tidak dibuang."
              className="tabular-nums"
            >
              {tanpaTautan} halaqah tanpa tautan ke detail
            </span>
          </>
        )}
      </div>

      {fokus && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-300 bg-card px-3 py-2 text-12 dark:border-neutral-800">
          <span className="text-ink-muted">Difokuskan ke halaqah</span>
          <span className="font-medium">{fokus.nama ?? fokus.id}</span>
          <Link
            href={`/${slug}/observasi?bulan=${bulan}`}
            className="underline underline-offset-2 text-ink-muted"
          >
            tampilkan semua halaqah
          </Link>
        </div>
      )}

      {view.baris.length === 0 ? (
        <EmptyState
          title={`Tidak ada catatan harian di ${labelBulan(bulan)}`}
          description={
            fokus
              ? "Halaqah ini tidak punya keterangan harian pada bulan kalender tersebut. Kosong di sini berarti tidak ada baris tercatat, bukan nol pelanggaran."
              : "Cerminnya sudah ditarik, tapi tidak ada satu pun keterangan harian bertanggal di bulan kalender ini untuk halaqah batch program ini. Kosong berarti tidak ada baris tercatat, bukan nol pelanggaran."
          }
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              Catatan harian{" "}
              <span className="font-normal text-ink-faint">({ringkas.keterangan})</span>
            </h2>
            <ObservasiTable
              rows={view.baris}
              kondisiOpsi={view.kondisiTampil}
              program={slug}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">
              Per halaqah <span className="font-normal text-ink-faint">({ringkas.halaqah})</span>
            </h2>
            <p className="text-12 text-ink-muted">
              {halaqahBatch.length} halaqah terdaftar di batch ini; yang muncul di bawah hanya yang
              punya catatan pada {labelBulan(bulan)}. Klik jumlah catatan untuk memfokuskan
              halaman ke satu halaqah.
            </p>
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Halaqah</TH>
                    <TH>Pengajar</TH>
                    <TH numeric>Catatan</TH>
                    <TH numeric>Pelanggaran</TH>
                    <TH numeric>Tabayyun</TH>
                    <TH numeric>Hutang (menit)</TH>
                  </TR>
                </THead>
                <TBody zebra>
                  {view.perHalaqah.map((g) => {
                    const pelanggaran = g.baris.reduce((n, r) => n + r.pelanggaran.length, 0);
                    const tabayyun = g.baris.reduce((n, r) => n + r.tabayyun.length, 0);
                    const menit = g.baris
                      .map((r) => r.menitHutang)
                      .filter((m): m is number => m != null);
                    return (
                      <TR key={g.halaqahId}>
                        <TD className="font-medium">
                          {g.halaqahNama == null ? (
                            <span className="font-mono text-12 text-ink-faint" title={g.halaqahId}>
                              halaqah tak dikenal
                            </span>
                          ) : g.tilawahHalaqahId != null ? (
                            <Link
                              href={`/${slug}/halaqah/${g.tilawahHalaqahId}`}
                              className="underline decoration-neutral-300 underline-offset-2 hover:decoration-current"
                            >
                              {g.halaqahNama}
                            </Link>
                          ) : (
                            g.halaqahNama
                          )}
                        </TD>
                        <TD className="text-ink-muted">
                          {g.pengajarNama ?? <span className="text-ink-faint">—</span>}
                        </TD>
                        <TD numeric>
                          <Link
                            href={`/${slug}/observasi?bulan=${bulan}&halaqah=${g.halaqahId}`}
                            className="underline underline-offset-2"
                          >
                            {g.baris.length}
                          </Link>
                        </TD>
                        {/* Nol di sini adalah nol yang DIKETAHUI: kita sudah
                            membaca pelanggaran/tabayyun untuk keterangan halaqah
                            ini dan jumlahnya nihil. Menuliskannya sebagai em
                            dash — lambang "tidak diketahui" di kolom sebelah —
                            justru membalik doktrin "kosong bukan nol" dan
                            membuat kedua keadaan tak terbedakan. */}
                        <TD numeric>
                          {pelanggaran === 0 ? (
                            <span className="text-ink-faint">0</span>
                          ) : (
                            <span className="text-warn">{pelanggaran}</span>
                          )}
                        </TD>
                        <TD numeric>
                          {tabayyun === 0 ? <span className="text-ink-faint">0</span> : tabayyun}
                        </TD>
                        {/* Tidak ada baris bermenit → em dash, bukan 0. */}
                        <TD numeric>
                          {menit.length === 0 ? (
                            <span className="text-ink-faint">—</span>
                          ) : (
                            menit.reduce((a, b) => a + b, 0)
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </section>
        </>
      )}
    </Shell>
  );
}
