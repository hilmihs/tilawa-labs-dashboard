"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toneBadgeClass } from "@/lib/ui/status";
import { NILAI, TONE, butuhEvidence, type Nilai } from "@/lib/penilaian/skala";
import type { BarisGrid, IsianGrid, Kpi } from "@/lib/penilaian/queries";
import { simpanGridAction, tautkanPanitiaAction } from "./actions";

type Nilaian = Record<string, Record<string, Nilai | "">>; // panitiaId → kpiId → nilai

const URUT: (Nilai | "")[] = ["", ...NILAI];
const LABEL_SUMBER: Record<string, string> = { link_pic: "PIC", interview: "wawancara", impor: "impor", otomatis: "otomatis" };

/**
 * Grid penilaian massal (design p1): satu acara → semua panitia. Klik sel
 * memutar B → C → D → E → kosong; di sel yang fokus, ketik B/C/D/E, 0 untuk
 * kosongkan, Enter untuk menerima saran. Saran otomatis (garis putus) tidak
 * tersimpan sampai diterima.
 */
export function GridPenilaian({
  slug,
  kpi,
  baris,
  kandidat,
}: {
  slug: string;
  kpi: Kpi[];
  baris: BarisGrid[];
  kandidat: Record<string, { id: string; nama: string }[]>;
}) {
  const router = useRouter();
  const awal = useMemo<Nilaian>(() => Object.fromEntries(baris.map((b) => [b.panitiaId, { ...b.nilai }])), [baris]);
  const awalEv = useMemo(() => Object.fromEntries(baris.map((b) => [b.panitiaId, b.evidence])), [baris]);
  const [nilai, setNilai] = useState<Nilaian>(awal);
  const [evidence, setEvidence] = useState<Record<string, string>>(awalEv);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [menyimpan, mulai] = useTransition();
  const sel = useRef<Record<string, HTMLButtonElement | null>>({});

  const set = (pid: string, kid: string, v: Nilai | "") => setNilai((s) => ({ ...s, [pid]: { ...s[pid], [kid]: v } }));

  const berubah = baris.filter((b) => {
    const a = awal[b.panitiaId] ?? {};
    const n = nilai[b.panitiaId] ?? {};
    return kpi.some((k) => (a[k.id] ?? "") !== (n[k.id] ?? "")) || (awalEv[b.panitiaId] ?? "") !== (evidence[b.panitiaId] ?? "");
  });
  const kurangEv = new Set(
    baris
      .filter((b) => butuhEvidence(Object.values(nilai[b.panitiaId] ?? {})) && !(evidence[b.panitiaId] ?? "").trim())
      .map((b) => b.panitiaId),
  );
  const terisi = baris.reduce((n, b) => n + Object.values(nilai[b.panitiaId] ?? {}).filter(Boolean).length, 0);
  const jumlahSaran = baris.reduce(
    (n, b) => n + kpi.filter((k) => b.saran[k.id] && !nilai[b.panitiaId]?.[k.id]).length,
    0,
  );

  function terimaSemuaSaran() {
    setNilai((s) => {
      const out = { ...s };
      for (const b of baris) {
        for (const k of kpi) {
          const sr = b.saran[k.id];
          if (sr && b.orangId && !out[b.panitiaId]?.[k.id]) out[b.panitiaId] = { ...out[b.panitiaId], [k.id]: sr };
        }
      }
      return out;
    });
  }

  function simpan() {
    const isian: IsianGrid[] = berubah.map((b) => ({
      panitiaId: b.panitiaId,
      nilai: Object.fromEntries(kpi.map((k) => [k.id, nilai[b.panitiaId]?.[k.id] ?? ""])),
      evidence: evidence[b.panitiaId] ?? "",
    }));
    mulai(async () => {
      const h = await simpanGridAction(slug, isian);
      setPesan({ ok: h.ok, teks: h.pesan });
      if (h.ok) router.refresh();
    });
  }

  function tautkan(panitiaId: string, orangId: string) {
    mulai(async () => {
      const h = await tautkanPanitiaAction(slug, panitiaId, orangId);
      setPesan({ ok: h.ok, teks: h.pesan });
      if (h.ok) router.refresh();
    });
  }

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, b: BarisGrid, k: Kpi, ri: number, ki: number) {
    const key = e.key.toUpperCase();
    if ((NILAI as readonly string[]).includes(key)) {
      e.preventDefault();
      set(b.panitiaId, k.id, key as Nilai);
    } else if (key === "0" || key === "BACKSPACE" || key === "DELETE") {
      e.preventDefault();
      set(b.panitiaId, k.id, "");
    } else if (key === "ENTER" && b.saran[k.id]) {
      e.preventDefault();
      set(b.panitiaId, k.id, b.saran[k.id]);
    } else if (key === "ARROWDOWN" || key === "ARROWUP") {
      e.preventDefault();
      const nb = baris[ri + (key === "ARROWDOWN" ? 1 : -1)];
      if (nb) sel.current[`${nb.panitiaId}:${k.id}`]?.focus();
    } else if (key === "ARROWRIGHT" || key === "ARROWLEFT") {
      e.preventDefault();
      const nk = kpi[ki + (key === "ARROWRIGHT" ? 1 : -1)];
      if (nk) sel.current[`${b.panitiaId}:${nk.id}`]?.focus();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">
          {terisi} nilai terisi · {berubah.length} baris berubah
          {jumlahSaran > 0 && ` · ${jumlahSaran} saran otomatis belum diterima`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {jumlahSaran > 0 && (
            <button
              type="button"
              onClick={terimaSemuaSaran}
              className="h-8 rounded-lg border border-border px-3 text-xs hover:border-neutral-400"
            >
              Terima semua saran ({jumlahSaran})
            </button>
          )}
          <button
            type="button"
            onClick={simpan}
            disabled={menyimpan || berubah.length === 0 || kurangEv.size > 0}
            className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {menyimpan ? "Menyimpan…" : `Simpan ${berubah.length ? `${berubah.length} baris` : ""}`}
          </button>
        </div>
      </div>
      {kurangEv.size > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {kurangEv.size} panitia bernilai D/E belum diberi contoh kejadian — wajib diisi sebelum menyimpan.
        </p>
      )}
      {pesan && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-xs ${pesan.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}
        >
          {pesan.teks}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-300 bg-card dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-3 py-2 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-5 w-6 rounded border-[1.5px] border-dashed border-emerald-500 text-center font-semibold leading-4 text-emerald-700">
              B
            </span>
            saran dari presensi — klik atau Enter untuk terima
          </span>
          <span>
            Keyboard: <b className="font-mono">B C D E</b> isi · <b className="font-mono">0</b> kosongkan · panah pindah
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 font-semibold">Panitia</th>
              <th className="px-2 py-2 font-semibold">Hadir · tugas</th>
              {kpi.map((k) => (
                <th key={k.id} className="px-2 py-2 text-center font-semibold" title={k.deskripsi?.catatan ?? ""}>
                  {k.nama}
                  <span className="block text-[10px] font-normal normal-case tracking-normal text-neutral-400">
                    {k.jenis}
                    {k.otomatis ? " · auto" : ""}
                  </span>
                </th>
              ))}
              <th className="min-w-[220px] px-3 py-2 font-semibold">Contoh kejadian</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, ri) => {
              const tanpaOrang = !b.orangId;
              return (
                <tr key={b.panitiaId} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="px-3 py-2">
                    {b.kodeQr ? (
                      <Link href={`/orang/${b.kodeQr}`} className="font-medium hover:text-primary hover:underline">
                        {b.nama}
                      </Link>
                    ) : (
                      <span className="font-medium">{b.nama}</span>
                    )}
                    <div className="text-xs text-neutral-500">
                      {[b.divisi, b.sisi && b.sisi !== "bersama" ? b.sisi : null, b.peran].filter(Boolean).join(" · ")}
                    </div>
                    {tanpaOrang && (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                        <span className="text-amber-600">Tautkan ke:</span>
                        {(kandidat[b.panitiaId] ?? []).map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            disabled={menyimpan}
                            onClick={() => tautkan(b.panitiaId, o.id)}
                            className="rounded border border-border px-1.5 py-0.5 hover:border-primary hover:text-primary"
                          >
                            {o.nama}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={menyimpan}
                          onClick={() => tautkan(b.panitiaId, "baru")}
                          className="rounded border border-dashed border-border px-1.5 py-0.5 text-neutral-500 hover:border-neutral-400"
                        >
                          Orang baru
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                    <span className={b.hadirWaktu ? "" : "text-neutral-400"}>
                      {b.hadirWaktu ? new Date(b.hadirWaktu).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—"}
                    </span>
                    {b.tugasTotal > 0 && (
                      <span className="block text-neutral-500">
                        {b.tugasSelesai}/{b.tugasTotal} tugas
                      </span>
                    )}
                  </td>
                  {kpi.map((k, ki) => {
                    const v = nilai[b.panitiaId]?.[k.id] ?? "";
                    const sr = b.saran[k.id];
                    const lain = b.lain[k.id] ?? [];
                    const kelas = v
                      ? `${toneBadgeClass[TONE[v]]} border border-transparent`
                      : sr
                        ? "border-[1.5px] border-dashed border-emerald-500 bg-card text-emerald-700 dark:text-emerald-400"
                        : "border border-neutral-300 bg-neutral-50 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900";
                    return (
                      <td key={k.id} className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          ref={(el) => {
                            sel.current[`${b.panitiaId}:${k.id}`] = el;
                          }}
                          disabled={tanpaOrang}
                          aria-label={`${k.nama} untuk ${b.nama}: ${v || (sr ? `saran ${sr}` : "kosong")}`}
                          onClick={() => {
                            if (!v && sr) set(b.panitiaId, k.id, sr);
                            else set(b.panitiaId, k.id, URUT[(URUT.indexOf(v) + 1) % URUT.length]);
                          }}
                          onKeyDown={(e) => onKey(e, b, k, ri, ki)}
                          className={`h-7 w-9 select-none rounded-md text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 ${kelas}`}
                        >
                          {v || sr || ""}
                        </button>
                        {lain.length > 0 && (
                          <div className="mt-0.5 text-[10px] text-neutral-400">
                            {lain.map((l) => `${LABEL_SUMBER[l.sumber] ?? l.sumber} ${l.nilai}`).join(" · ")}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5">
                    <input
                      value={evidence[b.panitiaId] ?? ""}
                      onChange={(e) => setEvidence((s) => ({ ...s, [b.panitiaId]: e.target.value }))}
                      disabled={tanpaOrang}
                      maxLength={1000}
                      placeholder={kurangEv.has(b.panitiaId) ? "Wajib: contoh kejadian untuk nilai D/E" : "Tambah contoh kejadian…"}
                      className={`h-8 w-full rounded-md border bg-card px-2 text-xs disabled:opacity-40 ${kurangEv.has(b.panitiaId) ? "border-amber-500" : "border-border"}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
