"use client";

import { useState, useTransition } from "react";
import type { ProgramDiscoveryRow, ProgramSyncRow } from "@/lib/admin/service";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncStatus } from "@/components/ui/sync-status";
import {
  approveDiscoveryAction,
  dismissDiscoveryAction,
  purgeStraysAction,
  scanProgramsAction,
  setSyncPausedAction,
  syncProgramAction,
  triggerSyncAction,
} from "./actions";

type Msg = { kind: "ok" | "err"; text: string } | null;

/** `busy` is keyed by slug; these stand in for the page-wide runs. */
const ALL = "__all__";
const SCAN = "__scan__";

const SOURCE_LABEL: Record<string, string> = {
  tilawah_api: "Tilawah",
  berkah_api: "Berkah (HKM)",
  mabni_api: "Boarding",
  maahir_api: "Maahir",
};

function fmtWhen(iso: string | null): string {
  if (!iso) return "belum pernah";
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  const rel =
    mins < 1
      ? "barusan"
      : mins < 60
        ? `${mins} menit lalu`
        : mins < 60 * 24
          ? `${Math.floor(mins / 60)} jam lalu`
          : `${Math.floor(mins / 1440)} hari lalu`;
  return `${d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  })} WIB · ${rel}`;
}

/**
 * Aturan bobot tombol di layar ini (lihat components/ui/README.md):
 *
 * - "Sync semua sumber" = `heavy`: satu lintasan penuh untuk tiga sumber, mahal
 *   — dan karena itu wajib berpasangan dengan konfirmasi.
 * - Aksi kepala halaman lain = `secondary`.
 * - Aksi per-baris yang berulang 15 kali ke bawah = `ghost` `xs`: menekan
 *   "Sync sekarang" satu per satu jauh lebih mahal daripada satu lintasan, jadi
 *   ia tidak boleh tampil sekuat tombol utama.
 */

export function ProgramsAdmin({
  rows,
  discoveries,
}: {
  rows: ProgramSyncRow[];
  discoveries: ProgramDiscoveryRow[];
}) {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  // The slug currently being acted on, so only its buttons show a busy state.
  const [busy, setBusy] = useState<string | null>(null);
  // Per-discovery display name, editable before approving — upstream names are
  // terse and the dashboard's are not.
  const [names, setNames] = useState<Record<string, string>>({});

  function flash(m: Msg) {
    setMsg(m);
    if (m) setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 8000);
  }

  function togglePause(row: ProgramSyncRow) {
    const paused = !row.syncPaused;
    setBusy(row.slug);
    start(async () => {
      const res = await setSyncPausedAction({ slug: row.slug, paused });
      setBusy(null);
      flash(
        res.ok
          ? {
              kind: "ok",
              text: paused
                ? `${row.slug} dijeda — cron tidak akan menimpa datanya.`
                : `${row.slug} dilanjutkan — sync berikutnya akan menariknya.`,
            }
          : { kind: "err", text: res.error },
      );
    });
  }

  function syncNow(row: ProgramSyncRow) {
    setBusy(row.slug);
    start(async () => {
      const res = await syncProgramAction({ slug: row.slug });
      setBusy(null);
      if (!res.ok) {
        flash({ kind: "err", text: `Sync ${row.slug} gagal: ${res.error}` });
        return;
      }
      if (res.data.skipped) {
        flash({ kind: "ok", text: `Sync ${row.slug} dilewati — masih ada sync berjalan.` });
        return;
      }
      flash({
        kind: "ok",
        text: res.data.wasPaused
          ? `Sync ${row.slug} selesai. Catatan: program ini masih dijeda, jadi cron tetap melewatinya.`
          : `Sync ${row.slug} selesai.`,
      });
    });
  }

  /**
   * Remove halaqah stranded under this program from a batch it no longer uses.
   *
   * The sync's own prune refuses to act once the strays outnumber a fifth of the
   * program, because absence from an upstream list is weak evidence — and that
   * refusal is why HKM-Presensi carried seven foreign halaqah for weeks. Here
   * the evidence is a contradiction in our own data, and the coordinator is
   * shown the row counts before agreeing.
   */
  function purge(row: ProgramSyncRow) {
    const ok = window.confirm(
      `Hapus ${row.strayHalaqah} halaqah asing dari ${row.slug}?\n\n` +
        "Beserta pertemuan dan presensinya. Data mirror saja — sync berikutnya " +
        "menariknya kembali kalau ternyata masih ada di CMS.",
    );
    if (!ok) return;
    setBusy(row.slug);
    start(async () => {
      const res = await purgeStraysAction({ slug: row.slug });
      setBusy(null);
      flash(
        res.ok
          ? {
              kind: "ok",
              text:
                `${row.slug}: ${res.data.removed.halaqah} halaqah, ` +
                `${res.data.removed.jadwal} pertemuan, ${res.data.removed.attendance} presensi, ` +
                `${res.data.removed.studentsSync} baris peserta dihapus.`,
            }
          : { kind: "err", text: res.error },
      );
    });
  }

  /**
   * One pass over everything, which is what the cron runs.
   *
   * Pressing "Sync sekarang" down the list is not the same work: each row logs
   * in to tilawah and pulls the whole cross-program absensi report by itself,
   * so eight tilawah rows cost eight logins and eight full report pulls. The
   * source-wide path does one of each and shares them across the programs.
   */
  function syncAll() {
    // `heavy` tanpa pagar bukan pagar: satu lintasan menarik tiga sumber untuk
    // semua program sekaligus, jadi ditanya dulu sebelum jalan.
    const ok = window.confirm(
      "Jalankan satu lintasan sync untuk all three upstream sources sekaligus?\n\n" +
        "Sama dengan yang dijalankan cron dan bisa memakan beberapa menit. " +
        "Program yang dijeda dilewati.",
    );
    if (!ok) return;
    setBusy(ALL);
    start(async () => {
      const res = await triggerSyncAction({ source: "all" });
      setBusy(null);
      if (!res.ok) {
        flash({ kind: "err", text: `Sync semua gagal: ${res.error}` });
        return;
      }
      if (res.data.skipped) {
        flash({ kind: "ok", text: "Dilewati — masih ada sync berjalan." });
        return;
      }
      const gagal = res.data.items.filter((i) => !i.ok);
      flash(
        gagal.length === 0
          ? { kind: "ok", text: `Sync semua selesai — ${res.data.items.length} program.` }
          : {
              kind: "err",
              text:
                `Sync semua selesai dengan ${gagal.length} gagal dari ${res.data.items.length}: ` +
                gagal.map((g) => `${g.programSlug} (${g.error ?? "tanpa pesan"})`).join(", "),
            },
      );
    });
  }

  /**
   * Publish a program the sync found by itself. Approving also pulls it once,
   * so the operator lands on real numbers rather than an empty program.
   */
  function approve(row: ProgramDiscoveryRow) {
    const name = (names[row.slug] ?? row.name).trim();
    setBusy(row.slug);
    start(async () => {
      const res = await approveDiscoveryAction({ slug: row.slug, name });
      setBusy(null);
      if (!res.ok) {
        flash({ kind: "err", text: `Gagal mengaktifkan ${row.slug}: ${res.error}` });
        return;
      }
      flash({
        kind: "ok",
        text: res.data.synced
          ? `${name} aktif dan sudah tersinkron. Beri akses koordinator di /admin/staff kalau perlu.`
          : `${name} aktif, tapi sync pertamanya belum berhasil${
              res.data.syncError ? ` (${res.data.syncError})` : ""
            } — coba "Sync sekarang" di daftar di bawah.`,
      });
    });
  }

  function dismiss(row: ProgramDiscoveryRow) {
    setBusy(row.slug);
    start(async () => {
      const res = await dismissDiscoveryAction({ slug: row.slug });
      setBusy(null);
      flash(
        res.ok
          ? { kind: "ok", text: `${row.slug} diabaikan — tidak akan ditawarkan lagi.` }
          : { kind: "err", text: res.error },
      );
    });
  }

  function scan() {
    setBusy(SCAN);
    start(async () => {
      const res = await scanProgramsAction();
      setBusy(null);
      flash(
        res.ok
          ? {
              kind: "ok",
              text:
                res.data.created === 0
                  ? "Tidak ada program atau batch baru di CMS."
                  : `${res.data.created} baris baru terdeteksi: ${res.data.slugs.join(", ")}.`,
            }
          : { kind: "err", text: `Pemindaian gagal: ${res.error}` },
      );
    });
  }

  const pausedCount = rows.filter((r) => r.syncPaused).length;

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            msg.kind === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {discoveries.length > 0 && (
        <section className="rounded-lg border border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <div className="border-b border-blue-200 px-4 py-3 dark:border-blue-900">
            <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              {discoveries.length} program/batch baru terdeteksi di CMS
            </h2>
            <p className="mt-1 text-xs text-blue-800 dark:text-blue-200">
              Periksa namanya lalu Aktifkan — atau Abaikan kalau itu program uji coba di CMS.{" "}
              <span className="text-blue-700 dark:text-blue-300">
                Sampai diaktifkan, barisnya tetap dijeda dan tersembunyi dari nav, switcher,
                overview, dan laporan siapa pun.
              </span>
            </p>
          </div>
          <div className="divide-y divide-blue-200 dark:divide-blue-900">
            {discoveries.map((row) => (
              <div key={row.slug} className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
                <div className="min-w-0 grow">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-blue-800 dark:text-blue-200">
                    <span className="rounded-full border border-blue-400 px-2 py-0.5 font-medium">
                      {row.kind === "batch" ? "batch baru" : "program baru"}
                    </span>
                    <code className="rounded bg-white/70 px-1.5 py-0.5 dark:bg-black/30">
                      {row.slug}
                    </code>
                    <span>
                      CMS: program #{row.tilawahProgramId}
                      {row.upstreamBatchName
                        ? ` · batch #${row.tilawahBatchId} "${row.upstreamBatchName}"`
                        : ""}
                    </span>
                    <span>terdeteksi {fmtWhen(row.discoveredAt)}</span>
                  </div>
                  <label className="mt-2 block text-xs text-blue-900 dark:text-blue-100">
                    Nama tampilan
                    <input
                      className="mt-1 w-full max-w-md rounded-md border border-blue-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-blue-800 dark:bg-neutral-950 dark:text-neutral-100"
                      value={names[row.slug] ?? row.name}
                      onChange={(e) => setNames((n) => ({ ...n, [row.slug]: e.target.value }))}
                      disabled={pending}
                    />
                  </label>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => dismiss(row)}
                    title="Bukan program sungguhan — jangan tawarkan lagi. Barisnya tetap dijeda dan tersembunyi."
                  >
                    {busy === row.slug && pending ? "…" : "Abaikan"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="border-blue-500 text-blue-900 dark:text-blue-100"
                    disabled={pending}
                    onClick={() => approve(row)}
                    title="Tayangkan program ini, lanjutkan sync-nya, dan tarik datanya sekali sekarang"
                  >
                    {busy === row.slug && pending ? "mengaktifkan…" : "Aktifkan"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {pausedCount > 0 ? (
          <p className="text-14 text-warn">
            {pausedCount} program sedang dijeda — datanya beku sampai dilanjutkan.
          </p>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={scan}
            title="Periksa CMS sekarang untuk program atau batch yang belum punya baris di sini. Sync juga melakukannya sendiri tiap 6 jam."
          >
            {busy === SCAN && pending ? "memindai…" : "Cek program baru"}
          </Button>
          <Button
            variant="heavy"
            size="sm"
            disabled={pending}
            onClick={syncAll}
            title="Satu lintasan untuk all three upstream sources sekaligus — sama dengan yang dijalankan cron. Program yang dijeda dilewati."
          >
            {busy === ALL && pending ? "menyinkron…" : "Sync semua sumber"}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada program terdaftar"
          description="Tiap 6 jam sync memindai CMS dan menaruh program atau batch baru di kotak biru di atas untuk disetujui. Tekan “Cek program baru” kalau tidak mau menunggu."
        />
      ) : (
        <div className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {rows.map((row) => (
            <div
              key={row.slug}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5"
            >
              <div className="min-w-0">
                {/* Satu baris identitas, satu baris keterangan — 15 program
                    berturut-turut hanya terbaca kalau ritmenya tetap. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.name}</span>
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                    {row.slug}
                  </code>
                  {row.syncPaused && (
                    <span className="rounded-full border border-amber-400 px-2 py-0.5 text-xs font-medium text-warn">
                      dijeda
                    </span>
                  )}
                  {row.lastStatus === "failed" && (
                    <span className="rounded-full border border-red-400 px-2 py-0.5 text-xs font-medium text-danger">
                      sync terakhir gagal
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                  <span>{SOURCE_LABEL[row.dataSourceType] ?? row.dataSourceType}</span>
                  <span aria-hidden>·</span>
                  {/* Warna baris ini mengikuti ambang usia data (hijau < 2 jam,
                      kuning < 24 jam, merah di atas itu); kegagalan terakhir
                      sudah punya pil sendiri di baris atas. */}
                  <SyncStatus at={row.lastSuccessAt} prefix="Sync sukses terakhir" />
                  {row.strayHalaqah > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-warn">
                        {row.strayHalaqah} halaqah dari batch lain menempel
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={pending}
                  onClick={() => togglePause(row)}
                  title={
                    row.syncPaused
                      ? "Lanjutkan sync — cron akan menarik program ini lagi"
                      : "Jeda sync — bekukan data lokal program ini"
                  }
                >
                  {busy === row.slug && pending ? "…" : row.syncPaused ? "Lanjutkan" : "Jeda"}
                </Button>
                {row.strayHalaqah > 0 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-danger hover:bg-red-50 dark:hover:bg-red-950/40"
                    disabled={pending}
                    onClick={() => purge(row)}
                    title="Hapus halaqah yang batch-nya tidak lagi dipakai program ini, beserta pertemuan dan presensinya. Ada konfirmasi sebelum jalan."
                  >
                    {busy === row.slug && pending ? "…" : `Bersihkan ${row.strayHalaqah} asing`}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={pending}
                  onClick={() => syncNow(row)}
                  title="Tarik ulang program ini saja. Untuk menyegarkan semuanya, pakai “Sync semua sumber” — jauh lebih ringan daripada menekan tombol ini berulang kali."
                >
                  {busy === row.slug && pending ? "…" : "Sync sekarang"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Penjelasan panjang dilipat: yang dibutuhkan sehari-hari cuma daftarnya. */}
      <details className="rounded-lg border border-neutral-200 text-xs text-ink-muted dark:border-neutral-800">
        <summary className="cursor-pointer px-4 py-2 font-medium text-ink-muted">
          Apa bedanya Jeda, Sync sekarang, dan Sync semua sumber?
        </summary>
        <div className="space-y-3 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p>
            &quot;Jeda&quot; menulis <code>config.syncPaused</code> pada baris program; cron
            melewati program yang dijeda untuk ketiga sumber (all three upstream sources).
            &quot;Sync sekarang&quot; menarik satu program saja dan tetap jalan walau sedang
            dijeda — anggap sebagai override manual sekali jalan. &quot;Sync semua sumber&quot;
            menjalankan satu lintasan untuk ketiga sumber sekaligus, persis seperti cron: untuk
            Tilawah ia login sekali dan menarik rekap absensi lintas program sekali lalu
            memakainya ulang untuk semua batch, jadi jauh lebih ringan daripada menekan tombol
            per program berulang kali. Bedanya, lintasan ini <em>melewati</em> program yang
            dijeda. Semua aksi tercatat di audit.
          </p>
          <p>
            Program baru di CMS tidak lagi perlu deploy: tiap 6 jam sync memindai daftar program
            dan batch, lalu membuat barisnya sendiri dalam keadaan dijeda + tersembunyi dan
            menampilkannya di kotak biru di atas. Program yang batch-nya bergulir (satu baris,{" "}
            <code>config.syncAllBatches</code>) menarik batch baru otomatis tanpa perlu
            persetujuan apa pun. Program yang dipantek per batch — keluarga HITS Reguler dan HITS
            Safar, yang laporan bulanannya ditulis per batch — sengaja tidak begitu: batch barunya
            muncul sebagai baris sibling untuk disetujui, supaya cakupan laporan yang sudah terbit
            tidak berubah diam-diam. Setelah diaktifkan, jangan lupa memberi akses koordinatornya
            di Admin → Staff, dan catat slug-nya di <code>scripts/seed-programs.ts</code> agar ikut
            terbawa saat database dibangun ulang.
          </p>
        </div>
      </details>
    </div>
  );
}
