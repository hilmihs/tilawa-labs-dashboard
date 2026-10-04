import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPublikSnapshot, type PublikProgram } from "@/lib/publik/snapshot";
import { STATUS_LABEL, angka, pctLabel } from "@/lib/publik/format";
import { Topbar } from "../Topbar";
import { KelasTable } from "./KelasTable";

/**
 * Detail satu program untuk publik (tanpa login). Dibuka dari tautan yang
 * dibagikan ke donatur, mitra, pengajar tanpa akun dan jamaah.
 *
 * force-dynamic: snapshot membaca Postgres, yang tidak ada saat `next build`.
 * Memo TTL di lib/publik/snapshot.ts menggantikan peran ISR.
 *
 * Tidak ada nama peserta: hanya agregat, nama program dan nama kelas.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ program: string }> };

async function cari(slug: string) {
  const snap = await getPublikSnapshot();
  const p = snap.programs.find((x) => x.slug === slug || x.aliases.includes(slug));
  return { snap, p };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { p } = await cari((await params).program);
  return { title: p?.name ?? "Program" };
}

const LEVEL_RAMP = ["#bfdbfe", "#93c5fd", "#60a5fa", "#2563eb", "#1e3a8a"];

/** Jenjang ke-i dari n, disebar merata di ramp (tanpa yang paling pucat bila sedikit). */
function warnaJenjang(i: number, n: number): string {
  if (n >= LEVEL_RAMP.length) return LEVEL_RAMP[Math.min(i, LEVEL_RAMP.length - 1)];
  if (n === 1) return LEVEL_RAMP[3];
  return LEVEL_RAMP[Math.round(1 + (i * 3) / (n - 1))];
}

export default async function PublikProgramPage({ params }: Props) {
  const slug = (await params).program;
  const { snap, p } = await cari(slug);
  if (!p) notFound();
  // Anggota keluarga batch (mis. hits-regular-jan) → baris keluarganya.
  if (p.slug !== slug) redirect(`/publik/${p.slug}`);

  return (
    <>
      <Topbar sinkronAt={p.sinkronAt} stale={p.stale} />

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-[18px] pb-12 sm:px-5">
        <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0" aria-label="Program">
          <Link
            href="/publik"
            className="flex-none rounded-[7px] border border-[var(--pk-line)] px-2.5 py-[5px] text-xs text-[var(--pk-ink2)] hover:border-[var(--pk-ink3)]"
          >
            ← Semua program
          </Link>
          {snap.programs.map((x) => {
            const aktif = x.slug === p.slug;
            return (
              <Link
                key={x.slug}
                href={`/publik/${x.slug}`}
                aria-current={aktif ? "page" : undefined}
                className={`flex-none rounded-[7px] border px-2.5 py-[5px] text-xs ${
                  aktif
                    ? "border-[var(--pk-ink)] bg-[var(--pk-ink)] font-semibold text-[var(--pk-card)]"
                    : "border-[var(--pk-line)] bg-[var(--pk-card)] text-[var(--pk-ink2)] hover:border-[var(--pk-ink3)]"
                }`}
              >
                {x.name}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <span className="size-3 flex-none rounded-[3px]" style={{ background: p.color }} />
          <h1 className="text-[22px] font-bold tracking-[-0.01em]">{p.name}</h1>
          {p.src && <span className="pk-mono text-[11px] text-[var(--pk-ink3)]">{p.src}</span>}
          {/* Tanpa angka (Maahir tak menerbitkan angka gabungan) — baris ini dihilangkan, bukan "—". */}
          {p.pct != null && (
            <span className="inline-flex items-center gap-2 sm:ml-auto">
              <span className="text-xs text-[var(--pk-ink2)]">
                kehadiran 30 hari {pctLabel(p.pct)} · ambang {angka(p.thr)}%
              </span>
              <span className="pk-pill" data-s={p.status}>
                {STATUS_LABEL[p.status]}
              </span>
            </span>
          )}
        </div>

        <Hero p={p} />

        {(p.levels.length > 0 || p.batches.length > 0) && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
            {p.levels.length > 0 && <Jenjang p={p} />}
            {p.batches.length > 0 && <Batch p={p} />}
          </div>
        )}

        {p.week.length > 0 && <Jadwal p={p} />}

        <KelasTable rows={p.halaqah} total={p.halaqah.length} jenjang={p.levels.length > 0} />

        <footer className="flex flex-wrap justify-between gap-x-3.5 gap-y-1 text-[11.5px] text-[var(--pk-ink3)]">
          <span>
            Data agregat per kelas, tanpa nama peserta · per {snap.dateLong}, {snap.time} WIB
          </span>
          <span>Angka disegarkan otomatis tiap 5 menit</span>
        </footer>
      </main>
    </>
  );
}

function Hero({ p }: { p: PublikProgram }) {
  const kartu = [
    { label: "Peserta aktif", value: p.peserta, ikh: p.ikhwan, akh: p.akhwat },
    { label: "Pengajar", value: p.pengajar, ikh: p.pengajarIkhwan, akh: p.pengajarAkhwat },
    { label: "Kelas berjalan", value: p.kelas, ikh: p.kelasIkhwan, akh: p.kelasAkhwat },
  ];
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3.5">
      {kartu.map((k) => {
        const n = k.ikh + k.akh;
        return (
          <div
            key={k.label}
            className="flex flex-col gap-3 rounded-[14px] border border-[var(--pk-line)] bg-[var(--pk-card)] px-5 py-[18px]"
          >
            <div className="pk-cap">{k.label}</div>
            <div className="pk-mono text-[44px] leading-none font-semibold tracking-[-0.02em]">
              {k.value == null ? "—" : angka(k.value)}
            </div>
            {n > 0 ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex h-2 overflow-hidden rounded bg-[var(--pk-akh)]">
                  <div className="bg-[var(--pk-ikh)]" style={{ width: `${(k.ikh / n) * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs text-[var(--pk-ink2)]">
                  <span>
                    Ikhwan <b className="text-[var(--pk-ink)] tabular-nums">{angka(k.ikh)}</b>
                  </span>
                  <span>
                    <b className="text-[var(--pk-ink)] tabular-nums">{angka(k.akh)}</b> Akhwat
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--pk-ink3)]">
                {k.value == null ? "Belum tersedia" : "Rincian ikhwan/akhwat belum tersedia"}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Jenjang({ p }: { p: PublikProgram }) {
  const max = Math.max(...p.levels.map((l) => l.n), 1);
  return (
    <section className="pk-card flex flex-col gap-3.5 px-[18px] py-4">
      <div className="pk-cap">Per jenjang</div>
      {p.levels.map((l, i) => (
        <div
          key={l.label}
          className="grid grid-cols-[minmax(72px,150px)_minmax(0,1fr)_auto] items-center gap-3 text-[12.5px]"
        >
          <span className="truncate text-[var(--pk-ink2)]" title={l.label}>
            {l.label}
          </span>
          <div className="h-3 rounded-[3px] bg-[var(--pk-chip)]">
            <div
              className="h-full rounded-[3px]"
              style={{
                width: `${(l.n / max) * 100}%`,
                background: warnaJenjang(i, p.levels.length),
              }}
            />
          </div>
          <span className="text-right whitespace-nowrap tabular-nums">
            <b className="pk-mono text-sm">{angka(l.n)}</b>{" "}
            <span className="text-[11px] text-[var(--pk-ink3)]">· {l.kelas} kls</span>
          </span>
        </div>
      ))}
      {p.tanpaJenjang > 0 && (
        <p className="mt-auto text-[11.5px] text-[var(--pk-ink3)]">
          {angka(p.tanpaJenjang)} peserta lain berada di kelas yang belum tercatat jenjangnya.
        </p>
      )}
    </section>
  );
}

function Batch({ p }: { p: PublikProgram }) {
  const max = Math.max(...p.batches.map((b) => b.n), 1);
  const last = p.batches.length - 1;
  const delta = p.batches[last].n - p.batches[last - 1].n;
  return (
    <section className="pk-card flex flex-col gap-2.5 px-[18px] py-4">
      <div className="flex items-baseline justify-between gap-2.5">
        <div className="pk-cap">Peserta per batch</div>
        <span
          className="text-[11.5px] tabular-nums"
          style={{ color: delta >= 0 ? "var(--pk-ok)" : "var(--pk-bad)" }}
        >
          {delta >= 0 ? "+" : "−"}
          {angka(Math.abs(delta))} dari batch lalu
        </span>
      </div>
      <div className="flex h-[130px] items-end gap-2.5">
        {p.batches.map((b, i) => (
          <div key={b.label} className="flex h-full flex-1 flex-col justify-end gap-1 text-center">
            <span
              className="pk-mono text-[13px] font-semibold"
              style={{ color: i === last ? "var(--pk-ink)" : "var(--pk-ink3)" }}
            >
              {angka(b.n)}
            </span>
            <i
              className="block rounded-t"
              style={{ height: `${(b.n / max) * 96}px`, background: i === last ? p.color : "var(--pk-bar)" }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2.5 border-t border-[var(--pk-line2)] pt-1.5">
        {p.batches.map((b) => (
          <span key={b.label} className="pk-mono flex-1 text-center text-[11px] text-[var(--pk-ink3)]">
            {b.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function Jadwal({ p }: { p: PublikProgram }) {
  return (
    <section className="pk-card flex flex-col gap-3 px-[18px] py-4">
      <div className="pk-cap">Jadwal kelas pekan ini</div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-[repeat(7,minmax(96px,1fr))] gap-2">
          {p.week.map((w) => (
            <div key={w.date} className="flex flex-col gap-1.5">
              <div
                className="flex items-baseline justify-between border-b-2 pb-[5px] text-xs font-semibold"
                style={{
                  color: w.today ? "var(--pk-link)" : "var(--pk-ink2)",
                  borderColor: w.today ? "var(--pk-link)" : "var(--pk-line)",
                }}
              >
                <span>{w.day}</span>
                <span className="pk-mono font-medium text-[var(--pk-ink3)]">{w.count || ""}</span>
              </div>
              {w.items.map((h, i) => (
                <div
                  key={`${h.judul}-${i}`}
                  className="flex flex-col gap-px rounded-md border border-[var(--pk-line)] bg-[var(--pk-sub)] px-2 py-1.5"
                >
                  <span className="truncate text-[11px] font-semibold" title={h.judul}>
                    {h.judul}
                  </span>
                  <span className="text-[10.5px] text-[var(--pk-ink3)]">{h.keterangan}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
