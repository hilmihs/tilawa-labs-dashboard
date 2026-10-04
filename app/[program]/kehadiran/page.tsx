/**
 * `/maahir/kehadiran` — the anggota × pertemuan grid from `rekap/kehadiran`.
 *
 * Reads the CACHED rekap row (`maahir_rekap`), never the API: the numbers are
 * upstream's, pulled by the sync pass, and re-fetching per page view would hit
 * the 120 req/min ceiling from a TV that auto-refreshes (spec, "Keputusan").
 *
 * Everything this page must never do is enforced in `view-model.ts` and stated
 * there. The one rule that lives HERE: nothing is rendered as 0 when it was not
 * measured. A month that was never pulled, or a route the key has no scope for,
 * gets an empty state that names the reason — with the period toggle still
 * usable so the other month is one click away.
 */
import { notFound } from "next/navigation";
import { getProgram } from "@/lib/programs/resolve";
import { periodLabel, readKehadiran, type MaahirRekapRead } from "@/lib/maahir/rekap";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import type { MaahirKehadiranPayload } from "@/lib/maahir/types";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { KehadiranFilters, KelasPicker } from "./KehadiranControls";
import { KehadiranGrid, KehadiranLegend } from "./KehadiranGrid";
import { scopeDitolak } from "./scope";
import {
  buildGrid,
  fetchedAtLabel,
  parseGender,
  persenLabel,
  pilihKelas,
  ringkasKelas,
  tarikanBasi,
  totalRingkas,
} from "./view-model";

export const metadata = { title: "Kehadiran Kelas Maahir" };
export const dynamic = "force-dynamic";

export default async function MaahirKehadiranPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>;
  searchParams: Promise<{ bulan?: string; gender?: string; kelas?: string }>;
}) {
  const { program } = await params;
  const sp = await searchParams;
  const programRow = await getProgram(program);

  // Route belongs to Maahir only. 404 rather than an empty page: for every other
  // program this URL is meaningless, not merely dataless (spec, "Sisi Maahir").
  if (!programRow || programRow.dataSourceType !== "maahir_api") notFound();

  const [bulanBerjalan, bulanLalu] = rekapMonths();
  // Only two months are ever pulled; an arbitrary ?bulan would always render
  // "belum ditarik" and look like a bug.
  const bulan = sp.bulan === bulanLalu ? bulanLalu : bulanBerjalan;
  const gender = parseGender(sp.gender);

  let read: MaahirRekapRead<MaahirKehadiranPayload> | null = null;
  let bacaGagal: string | null = null;
  try {
    read = await readKehadiran(bulan);
  } catch (err) {
    // The cache table itself is unreadable (migration not applied, DB down).
    // Say so — an error is not "nobody attended".
    bacaGagal = err instanceof Error ? err.message : String(err);
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[19px] font-bold tracking-[-0.01em]">Kehadiran Kelas Maahir</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {/* Period label from `meta` ONLY — Maahir's window is 28→27, not the
              calendar month, and the two must never be confused. */}
          {read ? (periodLabel(read.meta) ?? "periode tidak tercatat di meta") : "Rekap kehadiran per kelas."}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <KehadiranFilters
          bulan={bulan}
          bulanBerjalan={bulanBerjalan}
          bulanLalu={bulanLalu}
          gender={gender}
        />
        {read && (
          <span className="text-[11px] text-neutral-400">
            terakhir ditarik {fetchedAtLabel(read.fetchedAt)}
          </span>
        )}
      </div>
    </div>
  );

  if (!read) {
    const ditolak = await scopeDitolak(programRow.id, "rekap/kehadiran");
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {header}
        {bacaGagal ? (
          <EmptyState
            title="Cache rekap tidak bisa dibaca"
            description={`Bukan berarti nol — pembacaan tabel maahir_rekap gagal: ${bacaGagal}`}
          />
        ) : ditolak ? (
          <EmptyState
            title="Scope belum diberikan"
            description="API key Maahir belum memegang scope untuk rekap/kehadiran, jadi route ini dilewati setiap sync. Minta penambahan scope ke pengelola API Maahir, lalu jalankan sync ulang."
          />
        ) : (
          <EmptyState
            title="Data periode ini belum ditarik"
            description="Belum ada tarikan rekap/kehadiran yang tersimpan untuk periode ini. Angka tidak ditampilkan sebagai nol karena memang belum diukur — jalankan sync Maahir, atau lihat periode satunya."
          />
        )}
      </main>
    );
  }

  const semuaKelas = ringkasKelas(read.payload, "semua");
  const kelasTersaring = ringkasKelas(read.payload, gender);
  const total = totalRingkas(kelasTersaring);
  const kelas = pilihKelas(read.payload, gender, sp.kelas);
  const grid = buildGrid(kelas);
  const basi = tarikanBasi(read.fetchedAt);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {header}

      {basi && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Tarikan terakhir sudah lebih dari sehari — angka di bawah adalah data lama, bukan kondisi
          hari ini. Jalankan sync Maahir untuk memperbaruinya.
        </p>
      )}

      {semuaKelas.length === 0 ? (
        <EmptyState
          title="Tarikan ini tidak memuat satu kelas pun"
          description={`Respons tersimpan (${fetchedAtLabel(read.fetchedAt)}) berisi daftar kelas kosong. Ini kondisi upstream, bukan kegagalan baca.`}
        />
      ) : (
        <>
          {/* Counts only. No average is computed here: the attendance
              arithmetic (sakit di luar penyebut, pemutihan, peserta yang masuk
              di tengah periode) is upstream's, and re-deriving it would make
              this page disagree with layar koordinator Maahir. */}
          <KpiStrip
            items={[
              { label: "Kelas", value: total.kelas },
              { label: "Anggota", value: total.anggota },
              { label: "Pertemuan", value: total.pertemuan, hint: "terpresensi" },
              {
                label: "Sesi belum diisi",
                value: total.belumDiisi,
                valueClassName: total.belumDiisi > 0 ? "text-amber-600" : undefined,
              },
            ]}
          />

          {kelasTersaring.length === 0 ? (
            <EmptyState
              title={`Tidak ada kelas ${gender} pada tarikan ini`}
              description="Ubah saringan gender untuk melihat kelas yang lain."
            />
          ) : (
            <>
              <KelasPicker kelas={kelasTersaring} terpilih={kelas?.kelasId ?? null} />

              {kelas && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{kelas.kelasName}</h2>
                    <Badge tone={kelas.gender === "ikhwan" ? "info" : "indigo"}>
                      {kelas.gender}
                    </Badge>
                    {kelas.jadwalHari.length > 0 && (
                      <span className="text-xs text-neutral-500">
                        {kelas.jadwalHari.join(", ")}
                      </span>
                    )}
                    <Badge tone={kelas.belumDiisi > 0 ? "warning" : "success"}>
                      {kelas.belumDiisi > 0
                        ? `${kelas.belumDiisi} sesi belum diisi`
                        : "presensi lengkap"}
                    </Badge>
                    <span className="text-xs text-neutral-500">
                      {grid.baris.length} anggota · {grid.kolom.length} pertemuan
                    </span>
                  </div>

                  {grid.sesiBelumDiisi.length > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Sesi tanpa presensi:{" "}
                      {grid.sesiBelumDiisi
                        .map((s) => `${s.label} (${s.programLabel})`)
                        .join(", ")}
                    </p>
                  )}

                  <KehadiranLegend />

                  {grid.kolom.length === 0 ? (
                    <EmptyState
                      title="Belum ada pertemuan terpresensi di periode ini"
                      description={
                        kelas.belumDiisi > 0
                          ? `${kelas.belumDiisi} sesi terjadwal, tapi tidak satu pun presensinya terisi — jadi tidak ada kolom untuk ditampilkan.`
                          : "Tidak ada pertemuan tercatat untuk kelas ini pada jendela laporan."
                      }
                    />
                  ) : (
                    <KehadiranGrid grid={grid} program={program} />
                  )}

                  {grid.baris.length > 0 && (
                    <p className="text-xs text-neutral-400">
                      % Hadir diambil apa adanya dari Maahir. &ldquo;
                      {persenLabel(null)}&rdquo; berarti penyebutnya kosong — bukan 0%.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
