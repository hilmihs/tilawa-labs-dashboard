/**
 * Ringkasan logbook kehadiran pengurus di halaman Operating Office: isian
 * sesi hari ini (x / N anggota aktif) dan beberapa tap terakhir. Server
 * component — rincian ada di /operating-office/kehadiran.
 */
import Link from "next/link";
import { BookOpenCheck, Clock, ScanLine, UserCog } from "lucide-react";
import { kartu, labelMikro, tombolGaris } from "@/components/lintas/brand";
import { Badge } from "@/components/ui/badge";
import { getKantor } from "@/lib/kantor/queries";
import { batasKantor, hadirRentang, listAnggota, ringkasAntreanKirim, tapHariIni } from "@/lib/kerja/queries";
import { jamTitik, jamWibDari, sesiDari } from "@/lib/kerja/sesi";
import { LABEL_SESI, SESI, type BatasSesi, type HasilTap, type Sesi } from "@/lib/kerja/types";
import { jakartaDate } from "@/lib/time/jakarta";
import type { StatusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

const HASIL: Record<HasilTap, { label: string; tone: StatusTone }> = {
  tercatat: { label: "Tercatat", tone: "success" },
  sudah: { label: "Sudah", tone: "neutral" },
  di_luar_sesi: { label: "Di luar sesi", tone: "warning" },
  bukan_anggota: { label: "Belum terdaftar", tone: "warning" },
  tak_dikenal: { label: "Tak dikenal", tone: "danger" },
};

/** Rentang satu sesi "05.00–11.00" — batas atas eksklusif (11.00 sudah masuk Siang). */
function rentang(s: Sesi, b: BatasSesi): string {
  const [dari, sampai] =
    s === "pagi" ? [b.pagiMulai, b.siangMulai] : s === "siang" ? [b.siangMulai, b.soreMulai] : [b.soreMulai, b.selesai];
  return `${jamTitik(dari)}–${jamTitik(sampai)}`;
}

export async function PanelKehadiran() {
  const sekarang = new Date();
  const hariIni = jakartaDate(sekarang);
  const [kantor, anggota, hadir, taps, antre] = await Promise.all([
    getKantor(),
    listAnggota(),
    hadirRentang(hariIni, hariIni),
    tapHariIni(hariIni, 5),
    ringkasAntreanKirim(),
  ]);
  const batas = batasKantor(kantor);
  const sesiKini = sesiDari(sekarang, batas);

  // Hanya anggota aktif yang dihitung — baris lama milik anggota nonaktif tidak menambah x.
  const aktif = new Set(anggota.map((a) => a.orangId));
  const isi: Record<Sesi, number> = { pagi: 0, siang: 0, sore: 0 };
  for (const h of hadir) if (aktif.has(h.orangId)) isi[h.sesi] += 1;

  const tautan = [
    { href: "/operating-office/kehadiran", label: "Buka logbook", Icon: BookOpenCheck },
    { href: "/scan?kiosk=1", label: "Buka kiosk", Icon: ScanLine },
    { href: "/operating-office/pengurus", label: "Kelola pengurus", Icon: UserCog },
    { href: "/operating-office/sesi", label: "Setel jam sesi", Icon: Clock },
  ];

  return (
    <section className={cn(kartu, "overflow-hidden")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-5">
        <h2 className="text-16 font-semibold">Logbook kehadiran pengurus</h2>
        <span className="font-mono text-12 text-ink-muted">
          {sesiKini ? `sesi ${LABEL_SESI[sesiKini].toLowerCase()} · ${rentang(sesiKini, batas)}` : "di luar jam sesi"}
        </span>
      </div>

      {anggota.length === 0 ? (
        <div className="px-4 py-5 text-14 text-ink-muted sm:px-5">
          Belum ada pengurus di logbook. Tambahkan dulu di{" "}
          <Link href="/operating-office/pengurus" className="text-primary hover:underline">
            Kelola pengurus
          </Link>{" "}
          — kartu QR-nya bisa dicetak dari sana.
        </div>
      ) : (
        <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* ── Isian per sesi ─────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            {SESI.map((s) => {
              const kini = s === sesiKini;
              return (
                <div
                  key={s}
                  className={cn(
                    "min-w-0 rounded-[10px] border px-3 py-2.5",
                    kini ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <div className={cn(labelMikro, kini && "text-primary")}>{LABEL_SESI[s]}</div>
                  <div className="mt-1 flex items-baseline gap-1 tabular-nums">
                    <span className="text-[24px] font-extrabold leading-none tracking-[-0.03em]">{isi[s]}</span>
                    <span className="text-12 text-ink-muted">/ {anggota.length}</span>
                  </div>
                  <div className="mt-1 font-mono text-11 text-ink-muted">{rentang(s, batas)}</div>
                </div>
              );
            })}
          </div>

          {/* ── Tap terakhir ───────────────────────────────────────── */}
          <div className="min-w-0">
            <div className={labelMikro}>Tap terakhir hari ini</div>
            {taps.length === 0 ? (
              <p className="mt-2 text-14 text-ink-muted">Belum ada tap hari ini.</p>
            ) : (
              <ul className="mt-1.5 divide-y divide-border">
                {taps.map((t) => {
                  const h = HASIL[t.hasil as HasilTap] ?? HASIL.tak_dikenal;
                  return (
                    <li key={t.id} className="flex items-center gap-2.5 py-1.5 text-14">
                      <span className="w-11 shrink-0 font-mono text-12 tabular-nums text-ink-muted">
                        {jamTitik(jamWibDari(t.waktu))}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {t.nama ?? (
                          <span className="text-danger">
                            Kartu tak dikenal <span className="font-mono text-11">{t.dibaca.slice(0, 16)}</span>
                          </span>
                        )}
                        {t.artiLain && <span className="block truncate text-11 text-ink-muted">{t.artiLain}</span>}
                      </span>
                      {t.sesi && (
                        <span className="shrink-0 text-12 text-ink-muted">{LABEL_SESI[t.sesi as Sesi]}</span>
                      )}
                      <Badge tone={h.tone} className="shrink-0 text-11">
                        {h.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Kiriman scan terpadu ke tilawah/Maahir (mengajar, hadir murid) — 7 hari terakhir. */}
      {antre.menunggu + antre.terkirim + antre.dilewati + antre.gagal + antre.tinjau > 0 && (
        <div className="border-t border-border px-4 py-3 text-12 text-ink-muted sm:px-5">
          <span className="font-semibold text-foreground">Kiriman ke tilawah/Maahir</span> · {antre.terkirim} terkirim · {antre.menunggu} menunggu ·{" "}
          {antre.dilewati} dilewati (sudah diisi guru)
          {antre.tinjau > 0 && <> · {antre.tinjau} perlu ditinjau</>}
          {antre.gagal > 0 && <span className="text-danger"> · {antre.gagal} gagal</span>}
          {antre.pesanTerakhir && <span className="block truncate">Terakhir: {antre.pesanTerakhir}</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:px-5">
        {tautan.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={cn(tombolGaris, "h-[34px]")}>
            <Icon className="size-3.5" aria-hidden /> {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
