import type { Metadata } from "next";
import Link from "next/link";
import { getPublikSnapshot, type PublikProgram, type PublikTotal } from "@/lib/publik/snapshot";
import { STATUS_LABEL, angka, pctLabel } from "@/lib/publik/format";
import { Topbar } from "./Topbar";
import { KelasPeta } from "./KelasPeta";

/**
 * Rapor Program untuk publik (tanpa login): seberapa besar tiap program dan
 * apakah berjalan sehat. Angka utamanya jumlah; kehadiran hanya pendamping.
 *
 * Total peserta dan pengajar adalah **orang unik** (angka Beranda), bukan jumlah
 * kolom per program — satu orang bisa ikut lebih dari satu program, dan id orang
 * tidak global antar sumber (lihat lib/insights/beranda.ts).
 *
 * force-dynamic karena alasan yang sama dengan /publik/[program].
 */
export const dynamic = "force-dynamic";

// `absolute`: template judul di layout /publik hanya berlaku untuk segmen anak.
export const metadata: Metadata = { title: { absolute: "Rapor Program · Education Board" } };

export default async function PublikRapor() {
  const snap = await getPublikSnapshot();
  const ps = snap.programs;
  const kelas = ps.reduce((n, p) => n + p.kelas, 0);
  const kelasIkhwan = ps.reduce((n, p) => n + p.kelasIkhwan, 0);
  const kelasAkhwat = ps.reduce((n, p) => n + p.kelasAkhwat, 0);
  const berbatch = ps.filter((p) => p.batches.length > 1);
  const t = snap.total;

  return (
    <>
      <Topbar sinkronAt={snap.sinkronAt} stale={snap.stale} />

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-[22px] pb-12 sm:px-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h1 className="text-[19px] font-bold tracking-[-0.01em]">Rapor Program</h1>
          <span className="pk-mono text-[10.5px] tracking-[0.09em] text-[var(--pk-ink3)] uppercase">
            {snap.dateLong} · {snap.time} WIB · {ps.length} program
          </span>
        </div>

        {ps.length === 0 ? (
          <section className="pk-card px-[18px] py-10 text-center text-sm text-[var(--pk-ink3)]">
            Belum ada data program.
          </section>
        ) : (
          <>
            <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3.5">
              <HeroKartu
                label="Peserta"
                value={t.pesertaUnik}
                ikh={t.pesertaIkhwan}
                akh={t.pesertaAkhwat}
                sub={`orang unik · ${angka(t.pendaftaran)} pendaftaran di ${ps.length} program`}
              />
              <HeroKartu
                label="Pengajar"
                value={t.pengajarUnik}
                ikh={t.pengajarIkhwan}
                akh={t.pengajarAkhwat}
                sub={`orang unik lintas ${ps.length} program${t.pengajarTanpaMaahir ? " · belum termasuk syaikh Maahir" : ""}`}
              />
              <HeroKartu
                label="Kelas berjalan"
                value={kelas}
                ikh={kelasIkhwan}
                akh={kelasAkhwat}
                sub={`di ${ps.length} program · rincian per program di bawah`}
              />
            </section>

            <PerProgram ps={ps} kelas={kelas} total={t} />

            {berbatch.length > 0 && <TrenBatch ps={berbatch} />}

            <KelasPeta
              total={kelas}
              groups={ps.map((p) => ({
                slug: p.slug,
                name: p.name,
                color: p.color,
                kelas: p.kelas,
                peserta: p.peserta,
                tiles: p.halaqah.map((h) => ({
                  key: h.key,
                  nama: h.nama,
                  peserta: h.peserta,
                  level: h.level,
                  gender: h.gender,
                  status: h.status,
                  title: [h.nama, h.gender, h.level, h.jadwal, `kehadiran ${pctLabel(h.pct)}`]
                    .filter(Boolean)
                    .join(" · "),
                })),
              }))}
            />
          </>
        )}

        <footer className="flex flex-wrap justify-between gap-x-3.5 gap-y-1 text-[11.5px] text-[var(--pk-ink3)]">
          <span>Data agregat per kelas, tanpa nama peserta</span>
          <span>Angka disegarkan otomatis tiap 5 menit</span>
        </footer>
      </main>
    </>
  );
}

function HeroKartu(props: { label: string; value: number; ikh: number; akh: number; sub: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--pk-line)] bg-[var(--pk-card)] px-5 py-[18px]">
      <div className="pk-cap">{props.label}</div>
      <div className="pk-mono text-[44px] leading-none font-semibold tracking-[-0.02em]">{angka(props.value)}</div>
      <IkhAkh ikh={props.ikh} akh={props.akh} />
      <div className="mt-auto border-t border-[var(--pk-line2)] pt-2.5 text-xs text-[var(--pk-ink3)]">{props.sub}</div>
    </div>
  );
}

function IkhAkh({ ikh, akh, kecil = false }: { ikh: number; akh: number; kecil?: boolean }) {
  const n = ikh + akh;
  if (n === 0) {
    return <div className={`${kecil ? "text-[11px]" : "text-xs"} text-[var(--pk-ink3)]`}>—</div>;
  }
  return (
    <div className={`flex flex-col ${kecil ? "gap-1" : "gap-1.5"}`}>
      <div className={`flex h-2 overflow-hidden bg-[var(--pk-akh)] ${kecil ? "rounded-[3px]" : "rounded"}`}>
        <div className="bg-[var(--pk-ikh)]" style={{ width: `${(ikh / n) * 100}%` }} />
      </div>
      {kecil ? (
        <div className="flex justify-between text-[11px] text-[var(--pk-ink3)] tabular-nums">
          <span>{angka(ikh)}</span>
          <span>{angka(akh)}</span>
        </div>
      ) : (
        <div className="flex justify-between text-xs text-[var(--pk-ink2)]">
          <span>
            Ikhwan <b className="text-[var(--pk-ink)] tabular-nums">{angka(ikh)}</b>
          </span>
          <span>
            <b className="text-[var(--pk-ink)] tabular-nums">{angka(akh)}</b> Akhwat
          </span>
        </div>
      )}
    </div>
  );
}

function delta(p: PublikProgram): { teks: string; naik: boolean } | null {
  if (p.batches.length < 2) return null;
  const d = p.batches[p.batches.length - 1].n - p.batches[p.batches.length - 2].n;
  return { teks: `${d >= 0 ? "+" : "−"}${angka(Math.abs(d))} dari batch lalu`, naik: d >= 0 };
}

function PerProgram({ ps, kelas, total }: { ps: PublikProgram[]; kelas: number; total: PublikTotal }) {
  const angkaSel = "pk-mono px-3 py-3 text-right text-[17px] font-semibold";
  return (
    <section className="pk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--pk-line2)] bg-[var(--pk-sub)] px-[18px] py-3">
        <div className="pk-cap">Per program</div>
        <div className="flex gap-3 text-[11px] text-[var(--pk-ink2)]">
          <span className="flex items-center gap-[5px]">
            <i className="size-2 rounded-[2px] bg-[var(--pk-ikh)]" />
            Ikhwan
          </span>
          <span className="flex items-center gap-[5px]">
            <i className="size-2 rounded-[2px] bg-[var(--pk-akh)]" />
            Akhwat
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10px] tracking-[0.09em] text-[var(--pk-ink3)] uppercase">
              <th className="px-[18px] py-2.5 font-semibold">Program</th>
              <th className="px-3 py-2.5 text-right font-semibold">Peserta</th>
              <th className="px-3 py-2.5 text-right font-semibold">Pengajar</th>
              <th className="px-3 py-2.5 text-right font-semibold">Kelas</th>
              <th className="w-[150px] px-3 py-2.5 font-semibold">Ikhwan / akhwat</th>
              <th className="w-[130px] px-3 py-2.5 font-semibold">Peserta per batch</th>
              <th className="py-2.5 pr-[18px] pl-3 text-right font-semibold">Kehadiran</th>
            </tr>
          </thead>
          <tbody>
            {ps.map((p) => {
              const max = Math.max(...p.batches.map((b) => b.n), 1);
              const dl = delta(p);
              return (
                <tr key={p.slug} className="border-t border-[var(--pk-line2)]">
                  <td className="px-[18px] py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="size-2.5 flex-none rounded-[3px]" style={{ background: p.color }} />
                      <div className="min-w-0">
                        <Link
                          href={`/publik/${p.slug}`}
                          className="font-bold text-[var(--pk-ink)] hover:text-[var(--pk-link)]"
                        >
                          {p.name} →
                        </Link>
                        {p.src && <div className="pk-mono text-[11px] text-[var(--pk-ink3)]">{p.src}</div>}
                      </div>
                    </div>
                  </td>
                  <td className={angkaSel}>{angka(p.peserta)}</td>
                  <td className={angkaSel}>{p.pengajar == null ? "—" : angka(p.pengajar)}</td>
                  <td className={angkaSel}>{angka(p.kelas)}</td>
                  <td className="px-3 py-3">
                    <IkhAkh ikh={p.ikhwan} akh={p.akhwat} kecil />
                  </td>
                  <td className="px-3 py-3">
                    {p.batches.length > 1 ? (
                      <>
                        <div className="flex h-[26px] items-end gap-[3px]">
                          {p.batches.map((b, i) => (
                            <i
                              key={b.label}
                              title={`${b.label}: ${angka(b.n)} peserta`}
                              className="flex-1 rounded-t-[2px]"
                              style={{
                                height: `${(b.n / max) * 26}px`,
                                background: i === p.batches.length - 1 ? p.color : "var(--pk-bar)",
                              }}
                            />
                          ))}
                        </div>
                        {dl && (
                          <div
                            className="mt-[3px] text-[11px] tabular-nums"
                            style={{ color: dl.naik ? "var(--pk-ok)" : "var(--pk-bad)" }}
                          >
                            {dl.teks}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-[var(--pk-ink3)]">satu batch</span>
                    )}
                  </td>
                  <td className="py-3 pr-[18px] pl-3 text-right">
                    {p.pct == null ? (
                      <span className="text-xs text-[var(--pk-ink3)]">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-[var(--pk-ink2)] tabular-nums">{pctLabel(p.pct)}</span>
                        <span className="pk-pill" data-s={p.status}>
                          {STATUS_LABEL[p.status]}
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-[var(--pk-bar)] bg-[var(--pk-sub)]">
              <td className="px-[18px] py-3 font-bold">Total</td>
              <td className={angkaSel}>{angka(total.pesertaUnik)}</td>
              <td className={angkaSel}>{angka(total.pengajarUnik)}</td>
              <td className={angkaSel}>{angka(kelas)}</td>
              <td colSpan={3} className="py-3 pr-[18px] pl-3 text-[11.5px] text-[var(--pk-ink3)]">
                Peserta &amp; pengajar = orang unik, bukan jumlah kolom: satu orang bisa ikut lebih dari satu
                program.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TrenBatch({ ps }: { ps: PublikProgram[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <div className="pk-cap">Tren peserta per batch</div>
        <div className="text-[11.5px] text-[var(--pk-ink3)]">Program dengan lebih dari satu batch · batch terbaru disorot</div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {ps.map((p) => {
          const max = Math.max(...p.batches.map((b) => b.n), 1);
          const last = p.batches.length - 1;
          const dl = delta(p);
          return (
            <div
              key={p.slug}
              className="flex flex-col gap-2.5 rounded-xl border border-[var(--pk-line)] bg-[var(--pk-card)] px-4 py-3.5"
            >
              <div className="flex flex-col gap-px">
                <span className="text-[13px] font-bold">{p.name}</span>
                {dl && (
                  <span className="text-[11px] tabular-nums" style={{ color: dl.naik ? "var(--pk-ok)" : "var(--pk-bad)" }}>
                    {dl.teks}
                  </span>
                )}
              </div>
              <div className="flex h-[72px] items-end gap-1.5">
                {p.batches.map((b, i) => (
                  <div key={b.label} className="flex h-full flex-1 flex-col justify-end gap-[3px] text-center">
                    <span
                      className="text-[10.5px] tabular-nums"
                      style={{ color: i === last ? "var(--pk-ink)" : "var(--pk-ink3)" }}
                    >
                      {angka(b.n)}
                    </span>
                    <i
                      className="block rounded-t-[3px]"
                      style={{ height: `${(b.n / max) * 52}px`, background: i === last ? p.color : "var(--pk-bar)" }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 border-t border-[var(--pk-line2)] pt-[5px]">
                {p.batches.map((b) => (
                  <span key={b.label} className="pk-mono flex-1 text-center text-[10px] text-[var(--pk-ink3)]">
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
