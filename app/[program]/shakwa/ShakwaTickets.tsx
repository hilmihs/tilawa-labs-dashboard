"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented";
import type { MaahirShakwaItem, MaahirShakwaPayload } from "@/lib/maahir/types";
import {
  SHAKWA_STATUS_TONE,
  belumDitangani,
  filterTickets,
  genderLabel,
  jawabanEntries,
  kategoriOptions,
  pelaporLabel,
  sortTickets,
  waktuWib,
  type ShakwaStatusFilter,
} from "./view-model";

/**
 * The ticket queue. Client-side because the filters and the fold are pure view
 * state — no re-fetch, and the whole window's tickets (21 in the capture) are
 * already on the page.
 */
export function ShakwaTickets({ payload }: { payload: MaahirShakwaPayload }) {
  const [status, setStatus] = useState<ShakwaStatusFilter>("semua");
  const [kategori, setKategori] = useState<string>("semua");

  const kategoriOpts = useMemo(() => kategoriOptions(payload), [payload]);
  const rows = useMemo(
    () => sortTickets(filterTickets(payload.items ?? [], { status, kategori })),
    [payload.items, status, kategori],
  );

  const total = payload.items?.length ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink-muted">
          Daftar tiket
          <span className="ml-2 font-mono text-xs text-ink-faint">
            {rows.length} dari {total}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: "semua", label: "Semua" },
              { value: "belum", label: "Belum ditangani" },
              { value: "selesai", label: "Sudah ditangani" },
            ]}
          />
          {kategoriOpts.length > 1 && (
            <select
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-card px-2.5 py-1.5 text-xs dark:border-neutral-800"
              aria-label="Saring kategori"
            >
              <option value="semua">Semua kategori</option>
              {kategoriOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Tidak ada tiket pada saringan ini"
          description="Ubah saringan status atau kategori untuk melihat tiket lain di periode ini."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((item) => (
            <TicketCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Above this length the body is folded — with an explicit button, never a
 *  silent cut, so a koordinator can always read the whole complaint. */
const LIPAT_DI_ATAS = 260;

function TicketCard({ item }: { item: MaahirShakwaItem }) {
  const panjang = (item.isi ?? "").length > LIPAT_DI_ATAS;
  const [terbuka, setTerbuka] = useState(false);
  const terbukaPenuh = terbuka || !panjang;

  const jawaban = jawabanEntries(item);
  const terbukaStatus = belumDitangani(item);
  const dibuat = waktuWib(item.createdAt);
  const ditangani = waktuWib(item.ditanganiAt);

  return (
    <li className="rounded-xl border border-neutral-200 bg-card p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold">{item.nomorTiket}</span>
        <Badge tone="neutral">{item.kategoriLabel}</Badge>
        <Badge tone={SHAKWA_STATUS_TONE[item.status] ?? "neutral"}>{item.statusLabel}</Badge>
        {terbukaStatus && (
          <span className="text-xs font-medium text-danger">
            perlu ditindak
          </span>
        )}
        <span className="ml-auto text-xs text-ink-faint">{dibuat ?? "-"}</span>
      </div>

      <div className="mt-2 text-sm">
        <span className="font-medium">{item.nama}</span>
        <span className="text-ink-muted">
          {" "}
          · {pelaporLabel(item)} · {genderLabel(item)} · {item.halaqahLabel}
        </span>
        {item.pengajarNama && (
          <span className="text-ink-muted"> · pengajar {item.pengajarNama}</span>
        )}
      </div>

      <div className="mt-3">
        <p
          className={
            "whitespace-pre-wrap text-sm leading-relaxed" +
            (terbukaPenuh ? "" : " line-clamp-3")
          }
        >
          {item.isi}
        </p>
        {panjang && (
          <button
            type="button"
            onClick={() => setTerbuka((v) => !v)}
            className="mt-1 text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {terbuka ? "Lipat isi tiket" : "Baca isi tiket selengkapnya"}
          </button>
        )}
      </div>

      {jawaban.length > 0 && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {jawaban.map((j) => (
            <div key={j.key} className="flex gap-1.5">
              <dt className="text-ink-muted">{j.label}:</dt>
              <dd className="font-medium">{j.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {item.izin.length > 0 && (
        <div className="mt-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <div className="cap text-11 font-semibold text-ink-faint">Izin diajukan</div>
          <ul className="mt-1 space-y-1 text-xs">
            {item.izin.map((iz, i) => (
              <li key={`${iz.tanggal}-${iz.jenis}-${i}`} className="text-ink-muted">
                <span className="font-mono">{waktuWib(iz.tanggal, false) ?? iz.tanggal}</span>
                {" · "}
                {iz.jenisLabel}
                {iz.menit != null && ` (${iz.menit} menit)`}
                {iz.halaqahName && ` · ${iz.halaqahName}`}
                {iz.jadwalGanti &&
                  ` · ganti ${waktuWib(iz.jadwalGanti, false) ?? iz.jadwalGanti}`}
                {iz.sudahTerpakai ? " · sudah terpakai" : " · belum terpakai"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 border-t border-neutral-100 pt-3 text-xs dark:border-neutral-900">
        <div className="text-ink-muted">Jawaban / catatan koordinator</div>
        {item.catatanKoordinator ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
            {item.catatanKoordinator}
          </p>
        ) : (
          <p className="mt-1 text-ink-faint">
            Belum ada catatan koordinator di aplikasi Maahir.
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 text-ink-faint">
          {ditangani && <span>Ditangani {ditangani}</span>}
          {item.jumlahLampiran > 0 && (
            <span>{item.jumlahLampiran} lampiran (hanya dihitung, tidak dikirim API)</span>
          )}
        </div>
      </div>
    </li>
  );
}
