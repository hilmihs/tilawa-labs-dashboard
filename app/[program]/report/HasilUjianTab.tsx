"use client";

/**
 * Tab "Hasil Ujian" di laporan bulanan: nilai Evaluasi Halaqah Maahir per akhir
 * periode + aktivitas penilaian di periode, dan ujian CMS tilawah di rentang itu.
 * Spec: docs/superpowers/specs/2026-10-01-hasil-ujian-laporan-design.md.
 *
 * Tiga keadaan tidak pernah dicampur: belum ditampilkan · sedang dimuat · sudah
 * (termasuk "sudah tapi kosong", yang punya teksnya sendiri) — pola yang sama
 * dengan tab Peserta dan Pengajar.
 */
import { useState } from "react";
import { ArrowRight, BarChart3, Download, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Skeleton } from "@/components/ui/skeleton";
import type { HasilUjianLaporan } from "@/lib/reports/hasil-ujian";
import { HalaqahMaahirTable } from "../evaluasi/HalaqahMaahirTable";
import { NilaiMaahirTable } from "../evaluasi/NilaiMaahirTable";
import { UjianTable } from "../evaluasi/UjianTable";
import { fetchHasilUjian } from "./actions";

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${d} ${BLN[m - 1]} ${y}`;
}

export function HasilUjianTab({
  program,
  batch,
  defaults,
  batchPicker,
}: {
  program: string;
  batch?: string;
  defaults: { start: string; end: string };
  /** Pemilih batch milik ReportView, dipakai ulang supaya Gabungan sama di semua tab. */
  batchPicker?: React.ReactNode;
}) {
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [data, setData] = useState<HasilUjianLaporan | null>(null);
  const [shown, setShown] = useState<{ start: string; end: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setData(await fetchHasilUjian(program, start, end, batch));
      setShown({ start, end });
    } catch {
      setErr("Gagal memuat hasil ujian. Coba lagi; kalau berulang, kabari pengelola dashboard.");
    } finally {
      setLoading(false);
    }
  }

  const unduh = `/api/reports/${program}/hasil-ujian?start=${start}&end=${end}${batch ? `&batch=${batch}` : ""}`;
  const stale = shown != null && (shown.start !== start || shown.end !== end);
  const r = data?.maahir.ringkas;
  const persen = r && r.peserta > 0 ? Math.round((r.pesertaBernilai / r.peserta) * 1000) / 10 : null;

  return (
    <div className="space-y-3">
      {batchPicker}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-auto px-2 py-1.5" />
          <ArrowRight className="size-4 text-neutral-400" />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-auto px-2 py-1.5" />
        </div>
        <Button onClick={load} disabled={loading}>
          <BarChart3 /> {loading ? "Memuat…" : "Tampilkan"}
        </Button>
        <Button asChild variant="secondary">
          <a href={unduh}>
            <Download /> Export xlsx
          </a>
        </Button>
      </div>
      {shown && (
        <p className="text-12 text-ink-muted">
          {stale ? "Rentang diubah — tekan Tampilkan untuk memperbarui. Yang tampil: " : "Menampilkan "}
          {fmt(shown.start)} – {fmt(shown.end)}
          {data ? ` · ${data.label}` : ""}. Posisi = nilai sampai akhir rentang; “di periode” = sesi yang dibuat di dalam rentang.
        </p>
      )}
      {err && <Alert variant="danger">{err}</Alert>}

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!loading && !shown && (
        <EmptyState
          icon={<GraduationCap />}
          title="Hasil ujian belum ditampilkan"
          description="Pilih rentang tanggal lalu tekan Tampilkan — atau langsung Export xlsx. Isinya: nilai Evaluasi Halaqah per akhir rentang, sesi yang dinilai di rentang itu, rapot, dan ujian CMS tilawah."
        />
      )}

      {!loading && shown && data == null && (
        <EmptyState title="Program tidak ditemukan untuk pilihan batch ini" description="Pilih batch lain atau muat ulang halaman." />
      )}

      {!loading && data && r && (
        <>
          {data.maahir.halaqah.length === 0 ? (
            // Tanpa halaqah, loader tak punya baris untuk tahu kapan sinkron terakhir —
            // jadi satu pesan yang benar untuk kedua sebab, bukan tebakan.
            <EmptyState
              title="Belum ada nilai Evaluasi Halaqah untuk program ini"
              description="Halaqah program ini belum ada di modul Evaluasi Halaqah Maahir, atau sinkron Maahir belum menariknya. Nilai muncul di sini setelah keduanya terpenuhi."
            />
          ) : (
            <>
              <KpiStrip
                hero={{
                  label: `Peserta bernilai s.d. ${fmt(data.end)} · ${r.pesertaBernilai} dari ${r.peserta}`,
                  value: persen == null ? "—" : persen.toLocaleString("id-ID"),
                  unit: persen == null ? undefined : "%",
                  progress: persen ?? undefined,
                  target: 100,
                }}
                support={[
                  {
                    label: "Dinilai di periode",
                    value: r.sesiDiPeriode,
                    hint: r.sesiDiPeriode ? `sesi · ${r.pesertaDiPeriode} peserta` : "tidak ada sesi baru",
                  },
                  { label: "Bernilai final", value: r.pesertaFinal, hint: `${r.pesertaBernilai - r.pesertaFinal} hanya dari draft` },
                  { label: "Rapot aktif", value: r.rapotAktif, hint: `${r.rapotLulus} lulus · ${r.rapotTerbitDiPeriode} terbit di periode` },
                ]}
                issues={[
                  { label: "sesi belum dikirim (draft)", value: r.sesiDraft },
                  { label: "rapot tidak lulus", value: r.rapotAktif - r.rapotLulus, tone: "danger" },
                ]}
                allClearText="Semua sesi sudah dikirim dan semua rapot yang terbit lulus."
              />
              <section className="space-y-2">
                <h3 className="text-14 font-semibold">Per halaqah ({data.maahir.halaqah.length})</h3>
                <HalaqahMaahirTable rows={data.maahir.halaqah} tampilPeriode />
              </section>
              <section className="space-y-2">
                <h3 className="text-14 font-semibold">Per peserta</h3>
                {data.maahir.peserta.length > 0 ? (
                  <NilaiMaahirTable rows={data.maahir.peserta} kodePeserta={data.maahir.kodePeserta} tampilPeriode />
                ) : (
                  <EmptyState
                    title="Halaqahnya ada, nilainya belum"
                    description="Sampai akhir rentang ini belum ada sesi bernilai maupun rapot yang terbit."
                  />
                )}
              </section>
            </>
          )}
          {data.ujianTilawah.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-14 font-semibold">Ujian CMS tilawah di periode ({data.ujianTilawah.length})</h3>
              <p className="text-12 text-ink-muted">
                Pertemuan bertanda ujian di CMS tilawah; angkanya hitungan lahn (makin kecil makin baik), tidak dicampur dengan skor Maahir.
              </p>
              <UjianTable rows={data.ujianTilawah} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
