import { requireStaff } from "@/lib/acara/access";
import { baseUrl } from "@/lib/hadir/base-url";
import { muatKartu, uraiIds, type PilihanKartu } from "@/lib/kerja/kartu-data";
import { gayaKartu, KartuBelakang, KartuDepan } from "./KartuKehadiran";
import { LembarKartu, type Sisi } from "./TombolCetak";

export const metadata = { title: "Cetak Kartu Kehadiran" };
export const dynamic = "force-dynamic";

type Params = {
  ids?: string | string[];
  kelompok?: string;
  program?: string | string[];
  halaqah?: string | string[];
  kelas?: string | string[];
  cetak?: string;
  sisi?: string;
  garis?: string;
};

const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Query string dipertahankan saat berpindah mode A4 ↔ PVC. */
function hrefMode(sp: Params, pvc: boolean): string {
  const q = new URLSearchParams();
  const ids = uraiIds(sp.ids);
  if (ids.length) q.set("ids", ids.join(","));
  for (const k of ["kelompok", "program", "halaqah", "kelas"] as const) {
    const v = satu(sp[k]);
    if (v) q.set(k, v);
  }
  if (pvc) q.set("cetak", "pvc");
  return `/orang/kartu${q.size ? `?${q}` : ""}`;
}

const KELOMPOK = ["pengurus", "peserta", "maahir"] as const;

/**
 * Cetak Kartu Kehadiran (CR80 potret). `?ids=` daftar id orang atau kode QR
 * (dipisah koma), `?kelompok=pengurus` untuk semua anggota logbook aktif,
 * `?kelompok=peserta&program=<slug>` / `?kelompok=peserta&halaqah=<halaqah_sync.id>`
 * untuk peserta kelas tatap muka tilawah, `?kelompok=maahir&kelas=<program_kelas_id>`
 * untuk satu kelas Maahir.
 * Bawaan A4 3 × 3 untuk dipotong; `?cetak=pvc` satu kartu per halaman untuk
 * printer kartu PVC (depan lalu belakang per orang). Tanpa AppShell, seperti
 * /orang/[kode]/cetak.
 */
export default async function KartuPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireStaff();
  const sp = await searchParams;
  const pvc = satu(sp.cetak) === "pvc";
  const k = satu(sp.kelompok);
  const kelompok = (KELOMPOK as readonly string[]).includes(k ?? "") ? (k as PilihanKartu["kelompok"]) : undefined;
  const sisiQ = satu(sp.sisi);
  const awalSisi: Sisi = sisiQ === "depan" || sisiQ === "belakang" ? sisiQ : "keduanya";
  const kartu = await muatKartu(
    { ids: uraiIds(sp.ids), kelompok, program: satu(sp.program), halaqah: satu(sp.halaqah), kelas: satu(sp.kelas) },
    await baseUrl(),
  );

  return (
    <main className="min-h-full flex-1 bg-neutral-100 text-neutral-900 print:bg-white">
      <style>{gayaKartu(pvc ? "pvc" : "a4")}</style>
      <LembarKartu
        jumlah={kartu.length}
        awalSisi={awalSisi}
        awalGaris={satu(sp.garis) === "1"}
        pvc={pvc}
        hrefModeLain={hrefMode(sp, !pvc)}
      >
        {kartu.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-12 text-neutral-600">
            {kelompok === "peserta" || kelompok === "maahir" ? (
              <>
                Tidak ada peserta bertautan di kelas ini. Kartu peserta dibuat otomatis setelah sinkron, hanya untuk
                kelas tatap muka (offline/hybrid). Periksa{" "}
                <code className="font-mono">{kelompok === "maahir" ? "kelas=" : "program= / halaqah="}</code> di alamat.
              </>
            ) : (
              <>
                Belum ada orang yang dipilih. Buka dengan <code className="font-mono">?kelompok=pengurus</code> untuk semua
                pengurus di logbook, <code className="font-mono">?kelompok=peserta&amp;program=</code> (slug program) atau{" "}
                <code className="font-mono">&amp;halaqah=</code> untuk peserta satu kelas,{" "}
                <code className="font-mono">?kelompok=maahir&amp;kelas=</code> untuk satu kelas Maahir, atau{" "}
                <code className="font-mono">?ids=</code> berisi id orang / kode QR dipisah koma.
              </>
            )}
          </p>
        ) : (
          <div className="kk-daftar">
            {kartu.map((k) => (
              <div key={k.orangId} className="kk-pasang">
                <div className="kk-slot kk-sisi-depan">
                  <KartuDepan k={k} />
                </div>
                <div className="kk-slot kk-sisi-belakang">
                  <KartuBelakang k={k} />
                </div>
              </div>
            ))}
          </div>
        )}
      </LembarKartu>
    </main>
  );
}
