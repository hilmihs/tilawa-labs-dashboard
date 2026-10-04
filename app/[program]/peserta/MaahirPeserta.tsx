/**
 * Cabang Maahir dari `/[program]/peserta` — daftar orang lintas kelas Maahir,
 * dibaca dari cermin entitas mentah `maahir_sync`.
 *
 * Layar ini adalah DAFTAR + DRILL-DOWN, bukan rapor. `docs/API-PUBLIC.md` §9
 * melarang menurunkan ulang angka rekap dari entitas mentah, dan angka kehadiran
 * resmi sudah punya rumahnya sendiri di `/[program]/kehadiran` (yang membaca
 * payload `rekap/kehadiran`). Karena itu di halaman ini tidak ada persentase,
 * rata-rata, peringkat, atau skor — yang ada hanya cacah baris yang sedang
 * dirender, dan itu dinyatakan terang-terangan.
 */
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncStatus } from "@/components/ui/sync-status";
import { loadMaahirRoster, PENJELASAN_STATE } from "./maahir-queries";
import { MaahirPesertaTable } from "./MaahirPesertaTable";

function Shell({ nama, children }: { nama: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      <div className="max-w-3xl">
        <h1 className="text-20 font-bold tracking-[-0.01em]">Daftar Peserta</h1>
        <p className="mt-1 text-14 text-ink-muted">
          Seluruh orang pada roster {nama}, beserta kelas musyrifnya dan kelas-program yang
          diikutinya.
        </p>
      </div>
      {children}
    </main>
  );
}

export async function MaahirPeserta({
  program,
  namaProgram,
}: {
  program: string;
  namaProgram: string;
}) {
  const data = await loadMaahirRoster();

  if (data.state === "scope-ditolak") {
    return (
      <Shell nama={namaProgram}>
        <EmptyState
          title="Scope belum diberikan"
          description={`${PENJELASAN_STATE["scope-ditolak"]} (Entitas: ${data.entitas.join(", ")}.)`}
        />
      </Shell>
    );
  }

  if (data.state === "belum-ditarik") {
    return (
      <Shell nama={namaProgram}>
        <EmptyState
          title="Roster Maahir belum pernah ditarik"
          description={`${PENJELASAN_STATE["belum-ditarik"]} (Entitas: ${data.entitas.join(", ")}.)`}
        />
      </Shell>
    );
  }

  const { view, terakhirDitarik } = data;
  const { ringkas } = view;

  return (
    <Shell nama={namaProgram}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-ink-muted">
        <SyncStatus at={terakhirDitarik} prefix="Terakhir ditarik" />
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {ringkas.peserta} peserta · {ringkas.anggotaLepas} baris anggota tanpa peserta_id (
          {ringkas.namaLepas} nama berbeda) · {ringkas.keanggotaan} enrolmen ·{" "}
          {ringkas.programKelas} kelas-program · {ringkas.kelas} kelas
        </span>
        <span aria-hidden>·</span>
        <span>semuanya cacah baris mentah, bukan angka rekap</span>
        {ringkas.pesertaTanpaKelasProgram > 0 && (
          <>
            <span aria-hidden>·</span>
            <span
              className="tabular-nums"
              title="Peserta yang ada di roster tapi belum punya satu pun baris anggota di cermin — bukan berarti mereka tidak ikut kelas apa pun di upstream."
            >
              {ringkas.pesertaTanpaKelasProgram} peserta tanpa kelas-program
            </span>
          </>
        )}
      </div>

      {/* Satu baris, selalu terlihat: layar ini mendaftar orang, bukan menilai. */}
      <p className="-mt-4 text-12 text-ink-muted">
        Daftar orang mentah — tanpa persentase, rata-rata, atau peringkat. Angka kehadiran resmi
        ada di{" "}
        <Link href={`/${program}/kehadiran`} className="underline underline-offset-2">
          tab Kehadiran
        </Link>
        , yang membaca rekap Maahir.
      </p>

      {view.baris.length === 0 ? (
        <EmptyState title="Cermin roster kosong" description={PENJELASAN_STATE.kosong} />
      ) : (
        <>
          {/* Dua sisi daftar ini dijelaskan sekali, di atas tabelnya: pembaca
              yang menghitung barisnya berhak tahu kenapa 82 + 147 ≠ 229 orang. */}
          <p className="text-12 text-ink-faint">
            Daftar ini gabungan dua sisi: {ringkas.peserta} orang yang ada sebagai baris{" "}
            <code>peserta</code>, ditambah {ringkas.anggotaLepas} baris <code>anggota</code> yang
            tidak menunjuk peserta mana pun dan hanya membawa namanya sendiri. Baris sisi kedua
            ditandai “hanya enrolmen” dan sengaja tidak digabungkan per nama — nama bukan kunci,
            jadi jumlah baris di sini bukan jumlah orang.
          </p>

          <MaahirPesertaTable
            program={program}
            rows={view.baris}
            programKelasOpsi={view.programKelasOpsi}
            genderOpsi={view.genderOpsi}
          />
        </>
      )}
    </Shell>
  );
}
