/**
 * Tiga angka umum lintas program (peserta aktif, pengajar, kelas) beserta
 * penjelasan cara menghitungnya. Dipakai Beranda (`/`) dan `/overview` teratas,
 * supaya dua halaman itu tidak pernah menampilkan angka yang berbeda.
 * Aturan hitungnya ada di `lib/insights/beranda.ts`.
 */
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { sejak, type Beranda } from "@/lib/insights/beranda";

const angka = (n: number) => n.toLocaleString("id-ID");

export function BerandaTigaAngka({
  data,
  tone = "plain",
}: {
  data: Beranda;
  /**
   * `band` = di atas pita forest Beranda (desain "Overhaul Warna Logo" 1b):
   * kotak tembus pandang bergaris emas, angka putih. `plain` = tampilan lama,
   * dipakai /overview.
   */
  tone?: "plain" | "band";
}) {
  const kotak = [
    {
      label: "Peserta aktif",
      nilai: data.pesertaUnik,
      ket:
        data.pesertaSepanjang > data.pesertaUnik
          ? `di kelas berjalan · ${angka(data.pesertaSepanjang - data.pesertaUnik)} sudah selesai`
          : "orang di kelas berjalan",
      href: "/peserta",
    },
    {
      label: "Pengajar",
      nilai: data.pengajarUnik,
      ket: data.pengajarTanpaMaahir ? "orang unik · belum termasuk Maahir" : "orang unik",
      href: "/pengajar",
    },
    {
      label: "Kelas",
      nilai: data.kelas,
      ket: data.kelasSelesai > 0 ? `berjalan · ${angka(data.kelasSelesai)} selesai` : "kelas berjalan",
      href: "/kelas",
    },
  ];
  if (tone === "band") {
    return (
      <section className="grid max-w-[760px] gap-3 sm:grid-cols-3">
        {kotak.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="group block min-w-0 rounded-[14px] border border-brand-gold/30 bg-white/5 px-[18px] py-4 transition-colors hover:border-brand-gold/70 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="cap text-11 font-bold text-brand-gold">{k.label}</span>
              <ArrowUpRight className="size-3.5 shrink-0 text-brand-gold/50 transition-colors group-hover:text-brand-gold" />
            </div>
            <div className="mt-1.5 text-[34px] font-extrabold leading-none tracking-[-0.03em] text-white tabular-nums sm:text-[40px]">
              {angka(k.nilai)}
            </div>
            <div className="mt-2 text-12 text-white/70">{k.ket} · lihat daftar</div>
          </Link>
        ))}
      </section>
    );
  }
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {/* Tiap angka membuka daftarnya (pemilik 28 Sep 2026) — isinya dihitung dengan
          aturan yang sama, jadi jumlah barisnya = angka ini. */}
      {kotak.map((k) => (
        <Link
          key={k.label}
          href={k.href}
          className="group block min-w-0 rounded-[14px] border border-border bg-card p-4 transition-colors hover:border-brand-bronze focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-brand-gold/60"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="cap text-11 font-bold text-ink-muted">{k.label}</span>
            <ArrowUpRight className="size-3.5 shrink-0 text-ink-faint transition-colors group-hover:text-brand-bronze dark:group-hover:text-brand-gold" />
          </div>
          <div className="mt-1 text-[36px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{angka(k.nilai)}</div>
          <div className="mt-2 text-xs text-ink-muted">{k.ket} · lihat daftar</div>
        </Link>
      ))}
    </section>
  );
}

export function BerandaCakupan({ data }: { data: Beranda }) {
  return (
    <section className="space-y-2 text-12 leading-[1.6] text-ink-muted">
      {data.tanpaData.length > 0 && (
        <p className="rounded-[10px] border border-dashed border-neutral-300 px-3 py-2 dark:border-neutral-700">
          <span className="font-semibold text-foreground">Belum ada data: </span>
          {data.tanpaData.map((p, i) => (
            <span key={p.slug}>
              {i > 0 && ", "}
              <Link
                href={`/${p.slug}/dashboard`}
                className="text-brand-forest hover:underline dark:text-brand-gold"
              >
                {p.name}
              </Link>
            </span>
          ))}
          . Tidak ikut dihitung — belum tersinkron atau belum punya peserta.
        </p>
      )}
      <details className="group">
        <summary className="flex w-fit cursor-pointer select-none list-none items-center gap-1.5 hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-3 shrink-0 transition-transform group-open:rotate-90"
          />
          Cara menghitung
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Peserta dan pengajar dihitung <b>per orang</b>: yang ikut beberapa program terhitung sekali,
            jadi menjumlah angka di dashboard tiap program akan menghasilkan angka lebih besar.
          </li>
          <li>
            Peserta aktif = orang yang ikut minimal satu kelas yang <b>masih berjalan</b> (pertemuan terakhirnya belum
            lewat; boarding uses the class period). Yang semua kelasnya sudah selesai tetap ada di tab Selesai
            ({angka(data.pesertaSepanjang)} orang sepanjang batch yang tersimpan)
            {data.belumBerkelas > 0 && <>; {angka(data.belumBerkelas)} peserta belum berkelas tidak termasuk</>}.
          </li>
          <li>
            Satu orang dengan beberapa akun (akun ganda, salinan HKM→RBI, dua kelas Maahir) dihitung sekali bila HP
            dan namanya cocok.
          </li>
          <li>Kelas = halaqah berjalan yang punya minimal satu peserta aktif; kelas yang sudah tamat dihitung terpisah.</li>
          <li>
            Pengajar Maahir = syaikh yang berstatus aktif di aplikasi Maahir
            {data.pengajarTanpaMaahir && <> — belum tertarik, jadi belum ikut dihitung</>}.
          </li>
          <li>
            Akun di sumber berbeda (the three upstream sources) tidak digabung otomatis, jadi orang yang
            sama di dua sumber bisa terhitung dua kali.
          </li>
          {data.sinkronTertua && (
            <li>Data tertua di halaman ini dari sinkron {sejak(data.sinkronTertua)}.</li>
          )}
        </ul>
      </details>
    </section>
  );
}
