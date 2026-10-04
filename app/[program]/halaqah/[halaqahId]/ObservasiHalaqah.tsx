/**
 * Blok "Observasi ketua kelas" di halaman detail halaqah HITS.
 *
 * Ini penutup lingkaran yang selama ini terbuka. Halaman detail sudah
 * menampilkan presensi dan keterangan dari CMS tilawah, tapi catatan yang
 * dibuat ketua kelas tiap pertemuan — kondisi kelas, pelanggaran, tabayyun —
 * hidup di sistem lain (Maahir) dan tidak pernah muncul di sini. Padahal
 * halaman inilah tempat koordinator bertanya "kelas ini kenapa".
 *
 * Dua sistem, satu kelas, dan **tidak ada id yang menghubungkannya**:
 * `hits/halaqah` milik Maahir tidak membawa id halaqah tilawah. Jembatannya
 * nama, lewat `lib/maahir/name-match.ts` — 315 dari 323 halaqah HITS dashboard
 * (97,5%) ketemu pasangannya. Yang meleset atau bertabrakan tidak ditebak:
 * komponen ini mengembalikan `null` dan halaman detail tampil apa adanya
 * seperti sebelumnya. Blok yang hilang jauh lebih baik daripada blok berisi
 * catatan kelas orang lain.
 *
 * Aturan angka sama dengan `/[program]/observasi`: cacah baris yang dirender,
 * tidak ada persentase atau rata-rata. Angka disiplin resmi punya rumahnya
 * sendiri di tab Disiplin (docs/API-PUBLIC.md §9).
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  readHitsHalaqah,
  readKeteranganHarian,
  readPelanggaran,
  readTabayyun,
  readHutangBayar,
} from "@/lib/maahir/entities";
import { halaqahIndex, matchHalaqah } from "@/lib/maahir/name-match";
import { maahirHitsBatchIds } from "@/lib/programs/nav";
import {
  buildObservasiView,
  kondisiTone,
  tabayyunTerbuka,
  tanggalPendek,
} from "../../observasi/view-model";

/** Berapa catatan terakhir yang ditampilkan sebelum menyuruh ke layar penuh. */
const MAKS_BARIS = 8;

export async function ObservasiHalaqah({
  program,
  config,
  halaqahNama,
}: {
  program: string;
  /** `programs.config` — dipakai untuk pin batch Maahir. */
  config: unknown;
  /** Nama halaqah versi dashboard; kunci satu-satunya ke sisi Maahir. */
  halaqahNama: string | null;
}) {
  const batchIds = maahirHitsBatchIds(config);
  if (batchIds.length === 0 || !halaqahNama) return null;

  const halaqahMaahir = await readHitsHalaqah(batchIds);
  // Indeks dibangun atas sisi Maahir, lalu nama dashboard dicocokkan ke sana —
  // arah yang diukur 97,5%. Nama yang diklaim dua halaqah menghasilkan `null`.
  const cocok = matchHalaqah(
    halaqahIndex(halaqahMaahir.map((h) => ({ id: h.id, name: h.name }))),
    halaqahNama,
  );
  if (!cocok) return null;

  const keterangan = await readKeteranganHarian([cocok.id]);
  if (keterangan.length === 0) return null;

  const ids = keterangan.map((k) => k.id);
  const [pelanggaran, tabayyun, hutang] = await Promise.all([
    readPelanggaran(ids),
    readTabayyun(ids),
    readHutangBayar(ids),
  ]);

  const view = buildObservasiView({
    keterangan,
    pelanggaran,
    tabayyun,
    hutang,
    halaqah: halaqahMaahir.filter((h) => h.id === cocok.id),
    pengajar: [],
    tautan: {},
  });

  const baris = view.baris.slice(0, MAKS_BARIS);
  const sisa = view.baris.length - baris.length;
  const { ringkas } = view;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Observasi ketua kelas{" "}
          <span className="font-normal text-ink-faint">({ringkas.keterangan})</span>
        </h2>
        <Link
          href={`/${program}/observasi?halaqah=${cocok.id}`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Buka semua catatan halaqah ini →
        </Link>
      </div>

      <p className="text-12 text-ink-muted">
        Dari Maahir, dicocokkan lewat nama halaqah. Cacah baris mentah — bukan angka rekap.{" "}
        {ringkas.pelanggaran} pelanggaran · {ringkas.tabayyun} tabayyun (
        {ringkas.tabayyunBelumDiputus} belum diputus) · {ringkas.hutang} hutang-bayar.
      </p>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-neutral-300 bg-card dark:border-neutral-800">
        {baris.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-12">
            <span className="w-14 shrink-0 tabular-nums text-ink-muted">
              {tanggalPendek(r.tanggal)}
            </span>
            <span className="w-16 shrink-0 tabular-nums text-ink-faint">
              {r.pertemuanNo == null ? "—" : `p${r.pertemuanNo}`}
            </span>
            <Badge tone={kondisiTone(r.kondisi)}>{r.kondisi ?? "—"}</Badge>
            <span className="text-ink-muted">{r.statusLatihan ?? "—"}</span>
            {r.pelanggaran.map((p) => (
              <Badge key={p.id} tone="warning">
                {p.jenis ?? "?"}
                {p.menit == null ? "" : ` ${p.menit}′`}
              </Badge>
            ))}
            {r.tabayyun.map((t) => (
              <Badge key={t.id} tone={tabayyunTerbuka(t) ? "danger" : "neutral"}>
                tabayyun {t.status ?? "?"}
              </Badge>
            ))}
          </li>
        ))}
      </ul>

      {sisa > 0 && (
        <p className="text-11 text-ink-faint">
          {sisa} catatan lebih lama tidak ditampilkan di sini.
        </p>
      )}
    </section>
  );
}
