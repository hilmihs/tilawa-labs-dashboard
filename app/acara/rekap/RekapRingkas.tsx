import Link from "next/link";
import type { RekapSesi } from "@/lib/hadir/rekap";
import type { BarisLoyalitas, BarisPemateri, RingkasRutin } from "@/lib/hadir/rekap-rutin";

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]}`;
};

/**
 * Bagian atas rekap (design "Acara" a4): angka utama % peserta rutin dengan
 * definisi yang tertulis dan bisa diatur, grafik hadir per sesi ikhwan/akhwat,
 * kartu antar-pemateri, dan matriks loyalitas yang menaut ke CV.
 */
export function RekapRingkas({
  rutin,
  rekap,
  pemateri,
  loyalitas,
  qsDasar,
}: {
  rutin: RingkasRutin;
  rekap: RekapSesi[];
  pemateri: BarisPemateri[];
  loyalitas: BarisLoyalitas[];
  qsDasar: string;
}) {
  const maks = Math.max(1, ...rekap.map((r) => r.total));
  const urut = [...rekap].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  // Dengan sesi kurang dari syarat hadir minimum, 0% hanyalah artefak definisi.
  const bisaDihitung = rutin.sesiJendela.length >= rutin.definisi.minHadir;
  return (
    <div className="grid gap-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_2fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Peserta rutin</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[40px] font-semibold leading-none tabular-nums">{bisaDihitung && rutin.persen != null ? `${rutin.persen}%` : "—"}</span>
            {bisaDihitung && rutin.delta != null && (
              <span className={`text-xs font-medium ${rutin.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {rutin.delta >= 0 ? "▲" : "▼"} {Math.abs(rutin.delta)} poin
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {!bisaDihitung && (
              <span className="block font-medium text-amber-700 dark:text-amber-300">
                Baru {rutin.sesiJendela.length} sesi berlangsung — butuh minimal {rutin.definisi.minHadir} untuk definisi ini.
              </span>
            )}
            {rutin.rutin} dari {rutin.penyebut} orang hadir ≥ {rutin.definisi.minHadir} dari {rutin.definisi.jendela} sesi terakhir
            {!rutin.cukup && ` (baru ${rutin.sesiJendela.length} sesi)`}. Delta dibanding jendela satu sesi sebelumnya.
            Hanya sesi yang sudah berlangsung; pilih satu seri di saringan supaya sesinya sebanding.
          </p>
          <form className="mt-3 flex flex-wrap items-end gap-2 text-xs">
            {qsDasar.split("&").filter(Boolean).map((kv) => {
              const [k, v] = kv.split("=");
              return <input key={k} type="hidden" name={decodeURIComponent(k)} value={decodeURIComponent(v ?? "")} />;
            })}
            <label className="flex items-center gap-1">
              hadir ≥
              <input name="rutin_min" type="number" min={1} max={12} defaultValue={rutin.definisi.minHadir} className="h-7 w-12 rounded border border-border bg-card px-1" />
            </label>
            <label className="flex items-center gap-1">
              dari
              <input name="rutin_dari" type="number" min={2} max={12} defaultValue={rutin.definisi.jendela} className="h-7 w-12 rounded border border-border bg-card px-1" />
              sesi
            </label>
            <button type="submit" className="h-7 rounded border border-border px-2 hover:border-neutral-400">
              Terapkan
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Hadir per sesi</span>
            <span className="flex gap-3 text-[11px] text-neutral-500">
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-sky-600" />Ikhwan</span>
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-rose-400" />Akhwat</span>
            </span>
          </div>
          <div className="mt-3 flex h-40 items-end gap-1.5 overflow-x-auto">
            {urut.map((r, i) => {
              const sebelum = urut[i - 1];
              // Delta hanya dalam satu seri — sesi tanpa seri tidak sebanding.
              const d = sebelum && r.seri && sebelum.seri === r.seri ? r.total - sebelum.total : null;
              return (
                <Link
                  key={r.acaraId}
                  href={`/acara/${r.slug}/hadir`}
                  title={`${r.nama} · ${tgl(r.tanggal)} · ${r.total} hadir (${r.ikhwan} I · ${r.akhwat} A)${r.pemateri ? ` · ${r.pemateri}` : ""}`}
                  className="group flex h-full min-w-[28px] max-w-[56px] flex-1 flex-col items-center justify-end"
                >
                  <span className="text-[10px] tabular-nums text-neutral-600 dark:text-neutral-300">{r.total}</span>
                  {d != null && d !== 0 && (
                    <span className={`text-[9px] ${d > 0 ? "text-emerald-600" : "text-red-600"}`}>{d > 0 ? `+${d}` : d}</span>
                  )}
                  <div className="flex h-24 w-full items-end">
                    <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${Math.max(2, (100 * r.total) / maks)}%` }}>
                      <div className="bg-sky-600 group-hover:opacity-80" style={{ flexGrow: r.ikhwan || 0 }} />
                      <div className="bg-rose-400 group-hover:opacity-80" style={{ flexGrow: r.akhwat || 0 }} />
                    </div>
                  </div>
                  <span className="mt-1 text-[9px] text-neutral-500">{tgl(r.tanggal)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Antar-pemateri</div>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-1.5 font-semibold">Pemateri</th>
                <th className="px-2 py-1.5 text-right font-semibold">Sesi</th>
                <th className="px-2 py-1.5 text-right font-semibold">Rata² hadir</th>
                <th className="px-4 py-1.5 text-right font-semibold" title="Dari hadirin sesinya, berapa persen datang lagi di sesi berikutnya (seri sama)">Retensi</th>
              </tr>
            </thead>
            <tbody>
              {pemateri.map((p) => (
                <tr key={p.pemateri} className="border-t border-border">
                  <td className="px-4 py-1.5">{p.pemateri}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.sesi}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{p.rataHadir}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-neutral-600 dark:text-neutral-300">{p.retensi != null ? `${p.retensi}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
            Loyalitas · {rutin.sesiJendela.length} sesi terakhir
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-[11px] text-neutral-500">
                <tr>
                  <th className="px-4 py-1.5 font-semibold">Nama</th>
                  {rutin.sesiJendela.map((s) => (
                    <th key={s.acaraId} className="px-1 py-1.5 text-center font-normal" title={s.nama}>{tgl(s.tanggal)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loyalitas.map((o) => (
                  <tr key={o.orangId} className="border-t border-border">
                    <td className="px-4 py-1">
                      {o.kodeQr ? (
                        <Link href={`/orang/${o.kodeQr}`} className="hover:text-primary hover:underline">{o.nama}</Link>
                      ) : (
                        o.nama
                      )}
                    </td>
                    {o.perSesi.map((h, i) => (
                      <td key={i} className="px-1 py-1 text-center">
                        <span className={`inline-block size-3.5 rounded-sm ${h ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-800"}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
