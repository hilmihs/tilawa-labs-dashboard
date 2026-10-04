"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { berlaku, ringkas } from "@/lib/ringkasan/hitung";
import type { BarisPeserta } from "@/lib/ringkasan/queries";
import { setSetor } from "./actions";

function dariBaris(rows: BarisPeserta[]): Record<string, Set<string>> {
  return Object.fromEntries(rows.map((b) => [b.id, new Set(b.setor)]));
}

/**
 * Matriks ceklis: satu ketuk = setor, ketuk lagi = batal. Optimistic; server
 * action di belakang, gagal → kotak dikembalikan. Sengaja TANPA reload penuh
 * setelah centang: memuat ulang melempar koordinator ke atas (pelajaran rekap
 * pengajar). Kartu angka & daftar "belum setor hari ini" dirender server, jadi
 * disegarkan lewat router.refresh() — soft refresh, scroll & kolom tetap —
 * setelah centang terakhir tuntas, supaya refresh tidak menimpa centang yang
 * masih di jalan.
 */
export function RingkasanGrid({
  programSlug,
  bulan,
  tanggal,
  hariIni,
  baris,
}: {
  programSlug: string;
  bulan: string;
  tanggal: string[];
  hariIni: string;
  baris: BarisPeserta[];
}) {
  const [prevBaris, setPrevBaris] = useState(baris);
  const [setor, setSetorState] = useState<Record<string, Set<string>>>(() => dariBaris(baris));
  const [galat, setGalat] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const kolomHariIni = useRef<HTMLTableCellElement>(null);
  const router = useRouter();
  const tertunda = useRef(0);
  const jedaRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `baris` berubah lagi (pindah bulan, atau AturPeserta memicu router.refresh()).
  // Disesuaikan langsung saat render — bukan di useEffect — supaya tidak ada
  // render tambahan cuma untuk setState (lihat react-hooks/set-state-in-effect).
  if (baris !== prevBaris) {
    setPrevBaris(baris);
    setSetorState(dariBaris(baris));
  }

  useEffect(() => {
    const w = wrap.current;
    const th = kolomHariIni.current;
    if (w && th) w.scrollLeft = Math.max(0, th.offsetLeft - 220);
  }, [bulan]);

  function ubah(pesertaId: string, t: string, nilai: boolean) {
    setSetorState((s) => {
      const next = new Set(s[pesertaId]);
      if (nilai) next.add(t);
      else next.delete(t);
      return { ...s, [pesertaId]: next };
    });
  }

  async function ketuk(pesertaId: string, t: string) {
    const sudah = setor[pesertaId]?.has(t) ?? false;
    ubah(pesertaId, t, !sudah);
    setGalat(null);
    tertunda.current++;
    if (jedaRefresh.current) clearTimeout(jedaRefresh.current);
    const res = await setSetor(programSlug, pesertaId, t, !sudah).catch(() => ({
      ok: false as const,
      error: "Koneksi terputus — halaman mungkin perlu dimuat ulang.",
    }));
    tertunda.current--;
    if (!res.ok) {
      ubah(pesertaId, t, sudah);
      setGalat(res.error);
    }
    if (tertunda.current === 0) {
      jedaRefresh.current = setTimeout(() => router.refresh(), 600);
    }
  }

  return (
    <div className="space-y-2">
      {galat && <Alert variant="danger">{galat}</Alert>}
      <div ref={wrap} className="overflow-x-auto rounded-[10px] border border-border bg-card">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[180px] bg-card px-3 py-2 text-left font-medium">
                Peserta
              </th>
              {tanggal.map((t) => (
                <th
                  key={t}
                  ref={t === hariIni ? kolomHariIni : undefined}
                  className={`w-9 px-0.5 py-2 text-center text-xs font-medium ${
                    t === hariIni ? "rounded-t bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {Number(t.slice(8))}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-medium">Setor</th>
              <th className="px-3 py-2 text-right text-xs font-medium">%</th>
              <th className="px-3 py-2 text-right text-xs font-medium">Tunggakan</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const rentang = { mulai: b.mulai, selesai: b.selesai };
              const set = setor[b.id] ?? new Set<string>();
              const r = ringkas(bulan, rentang, set, hariIni);
              return (
                <tr key={b.id} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                    <div className="font-medium leading-tight">{b.nama}</div>
                    <div className="text-xs text-muted-foreground">{b.halaqah ?? "—"}</div>
                  </td>
                  {tanggal.map((t) => {
                    const aktif = berlaku(t, rentang, hariIni);
                    const cek = set.has(t);
                    return (
                      <td
                        key={t}
                        className={`px-0.5 py-1 text-center ${t === hariIni ? "bg-primary/5" : ""}`}
                      >
                        <button
                          type="button"
                          disabled={!aktif}
                          onClick={() => ketuk(b.id, t)}
                          aria-label={`${b.nama} ${t} ${cek ? "sudah setor" : "belum setor"}`}
                          aria-pressed={cek}
                          className={`size-8 rounded-md border text-base leading-none transition-colors ${
                            !aktif
                              ? "cursor-not-allowed border-transparent bg-muted/40"
                              : cek
                                ? "border-emerald-600 bg-emerald-500 text-white"
                                : "border-border bg-background hover:border-emerald-500"
                          }`}
                        >
                          {cek ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 text-right tabular-nums">
                    {r.setor}/{r.berlaku}
                  </td>
                  <td className="px-3 text-right tabular-nums">{r.persen == null ? "—" : `${r.persen}%`}</td>
                  <td
                    className={`px-3 text-right tabular-nums ${
                      r.tunggakan >= 3 ? "font-semibold text-red-600" : ""
                    }`}
                  >
                    {r.tunggakan > 0 ? `${r.tunggakan} hari` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Ketuk kotak untuk menandai setor, ketuk lagi untuk membatalkan. Tersimpan otomatis. Kotak
        abu-abu = belum/tidak berlaku.
      </p>
    </div>
  );
}
