import type { BarisSebaran, DeltaSesi, OrangBerulang, RekapSesi } from "@/lib/hadir/rekap";
import { td, tdNum, th } from "../[slug]/_ui";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y.slice(2)}`;
};
const delta = (v: number | null) => (v === null ? "" : v === 0 ? "±0" : v > 0 ? `+${v}` : String(v));

export function BlokPerSesi({
  rekap,
  deltas,
  kolomQism,
}: {
  rekap: RekapSesi[];
  deltas: Map<string, DeltaSesi>;
  kolomQism: string[];
}) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-1 text-14 font-semibold">Per sesi</h2>
      <p className="mb-2 text-11 text-muted-foreground">
        Angka kecil setelah <code>~</code> = qism-nya hasil pencocokan nama, bukan deklarasi orangnya sendiri. Delta dibandingkan dengan sesi sebelumnya dalam seri yang sama.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr>
              <th className={th}>Tanggal</th>
              <th className={th}>Kajian</th>
              <th className={th}>Ustadz</th>
              <th className={th}>Tema / kitab</th>
              <th className={th}>Total</th>
              <th className={th}>Ikhwan</th>
              <th className={th}>Akhwat</th>
              {kolomQism.map((q) => <th key={q} className={th}>Prodi: {q}</th>)}
              <th className={th}>Mangkir</th>
            </tr>
          </thead>
          <tbody>
            {rekap.map((r) => {
              const d = deltas.get(r.acaraId);
              const q = new Map(r.perQism.map((x) => [x.qism, x]));
              return (
                <tr key={r.acaraId} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className={td}>{tgl(r.tanggal)}</td>
                  <td className={td}>{r.nama}</td>
                  <td className={td}>{r.pemateri ?? "—"}</td>
                  <td className={td}>{r.tema ?? "—"}</td>
                  <td className={tdNum}>{r.total} <span className="text-11 text-muted-foreground">{delta(d?.total ?? null)}</span></td>
                  <td className={tdNum}>{r.ikhwan} <span className="text-11 text-muted-foreground">{delta(d?.ikhwan ?? null)}</span></td>
                  <td className={tdNum}>{r.akhwat} <span className="text-11 text-muted-foreground">{delta(d?.akhwat ?? null)}</span></td>
                  {kolomQism.map((k) => {
                    const v = q.get(k);
                    return (
                      <td key={k} className={tdNum}>
                        {v ? v.jumlah : 0}
                        {v && v.taksiran > 0 ? <span className="text-11 text-muted-foreground"> ~{v.taksiran}</span> : null}
                      </td>
                    );
                  })}
                  <td className={tdNum}>{r.wajib > 0 ? r.mangkir : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rekap.some((r) => r.genderTakDiketahui > 0) && (
        <p className="mt-2 text-11 text-muted-foreground">
          Sebagian orang belum punya jenis kelamin; total = ikhwan + akhwat + tak diketahui.
        </p>
      )}
    </section>
  );
}

export function BlokBerulang({
  sebaran,
  orang,
  rekap,
}: {
  sebaran: BarisSebaran[];
  orang: OrangBerulang[];
  rekap: RekapSesi[];
}) {
  const maks = rekap.length;
  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-1 text-14 font-semibold">Nama berulang</h2>
      <p className="mb-2 text-11 text-muted-foreground">
        Dihitung per orang, bukan per tulisan nama — dua ejaan nama yang sama tidak jadi dua orang.
      </p>
      <div className="overflow-x-auto">
        <table className="mb-4 w-full max-w-md">
          <thead>
            <tr><th className={th}>Hadir</th><th className={th}>Orang</th><th className={th}>Ikhwan</th><th className={th}>Akhwat</th></tr>
          </thead>
          <tbody>
            {sebaran.map((s) => (
              <tr key={s.kali} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className={td}>{s.kali}× {s.kali === maks && maks > 1 ? "(semua sesi)" : ""}</td>
                <td className={tdNum}>{s.total}</td>
                <td className={tdNum}>{s.ikhwan}</td>
                <td className={tdNum}>{s.akhwat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr>
              <th className={th}>Nama</th><th className={th}>I/A</th>
              {rekap.map((r) => <th key={r.acaraId} className={th}>{tgl(r.tanggal)}</th>)}
              <th className={th}>Σ</th>
            </tr>
          </thead>
          <tbody>
            {orang.slice(0, 300).map((o) => (
              <tr key={o.orangId} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className={td}>{o.nama}</td>
                <td className={td}>{o.gender === "P" ? "A" : o.gender === "L" ? "I" : "—"}</td>
                {rekap.map((r) => <td key={r.acaraId} className={tdNum}>{o.acaraIds.includes(r.acaraId) ? "✓" : ""}</td>)}
                <td className={tdNum}>{o.jumlahSesi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orang.length > 300 && (
        <p className="mt-2 text-11 text-muted-foreground">300 dari {orang.length} orang ditampilkan; unduh xlsx untuk daftar penuh.</p>
      )}
    </section>
  );
}

export function BlokGolongan({
  pivot,
  rekap,
  namaGolongan,
}: {
  pivot: { slug: string; perSesi: number[]; totalKehadiran: number }[];
  rekap: RekapSesi[];
  namaGolongan: Map<string, string>;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-2 text-14 font-semibold">Per golongan</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr>
              <th className={th}>Golongan</th>
              {rekap.map((r) => <th key={r.acaraId} className={th}>{tgl(r.tanggal)}</th>)}
              <th className={th}>Σ</th>
            </tr>
          </thead>
          <tbody>
            {pivot.map((p) => (
              <tr key={p.slug} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className={td}>{namaGolongan.get(p.slug) ?? p.slug}</td>
                {p.perSesi.map((n, i) => <td key={rekap[i].acaraId} className={tdNum}>{n}</td>)}
                <td className={tdNum}>{p.totalKehadiran}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-4 w-full min-w-[500px]">
          <thead>
            <tr>
              <th className={th}>Sesi</th><th className={th}>Wajib</th><th className={th}>Hadir wajib</th>
              <th className={th}>Mangkir</th><th className={th}>Hadir tambahan</th>
            </tr>
          </thead>
          <tbody>
            {rekap.map((r) => (
              <tr key={r.acaraId} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className={td}>{tgl(r.tanggal)}</td>
                <td className={tdNum}>{r.wajib}</td>
                <td className={tdNum}>{r.hadirWajib}</td>
                <td className={tdNum}>{r.mangkir}</td>
                <td className={tdNum}>{r.hadirTambahan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
