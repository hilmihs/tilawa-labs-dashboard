"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PesertaRow } from "@/lib/directory/queries";
import { genderLabel } from "@/lib/programs/config";
import { formatUsia } from "@/lib/directory/usia";
import { normalizePhone } from "@/lib/wa";
import { PESERTA_FOKUS_LABEL, type PesertaFokus } from "./fokus";
import { Input, Select } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

type SortKey =
  | "name"
  | "batch"
  | "userCode"
  | "gender"
  | "ortu"
  | "usia"
  | "halaqahName"
  | "pengajar"
  | "level"
  | "status"
  | "attendanceRate"
  | "hadirCount"
  | "izinCount";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Nama", align: "left" },
  // Hanya tampil pada `?batch=semua` — lihat `columns` di bawah.
  { key: "batch", label: "Batch", align: "left" },
  { key: "userCode", label: "Kode", align: "left" },
  { key: "gender", label: "Jenis", align: "left" },
  { key: "ortu", label: "Ortu (Bapak/Ibu)", align: "left" },
  { key: "usia", label: "Usia", align: "right" },
  { key: "halaqahName", label: "Halaqah", align: "left" },
  { key: "pengajar", label: "Pengajar", align: "left" },
  { key: "level", label: "Level", align: "left" },
  { key: "status", label: "Status", align: "left" },
  { key: "attendanceRate", label: "Kehadiran", align: "right" },
  { key: "hadirCount", label: "Hadir/efektif", align: "right" },
  { key: "izinCount", label: "Izin", align: "right" },
];

/** Enrollment status: code 1 = aktif; 0/anything else = keluar, with the reason. */
function statusOf(r: PesertaRow): { label: string; aktif: boolean } {
  const aktif = r.statusCode == null || r.statusCode === 1;
  if (aktif) return { label: "Aktif", aktif: true };
  return { label: r.statusText?.trim() || "Tidak aktif", aktif: false };
}

function cmp(a: unknown, b: unknown): number {
  const an = a == null || a === "";
  const bn = b == null || b === "";
  if (an && bn) return 0;
  if (an) return 1; // nulls last
  if (bn) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function sortValue(r: PesertaRow, key: SortKey): string | number | null {
  if (key === "status") return statusOf(r).aktif ? 0 : 1;
  if (key === "gender") return r.gender;
  // Diurutkan menurut baris yang benar-benar tampil lebih dulu.
  if (key === "ortu") return r.fatherName ?? r.motherName ?? null;
  // Angka, bukan teks: "11 bulan" akan berurut sebelum "2 tahun" kalau string.
  if (key === "usia") return r.usiaMonths;
  return r[key] as string | number | null;
}

/**
 * Saringan yang datang dari chip KPI di kepala halaman (`?fokus=…`). Sengaja
 * prop, bukan state: klik chip me-render ulang halaman dengan query baru, jadi
 * prop selalu ikut sedangkan `useState` akan tertinggal basi.
 */
const FOKUS_LABEL = PESERTA_FOKUS_LABEL;

export function PesertaTable({
  program,
  rows,
  fokus,
  tanpaFokusHref,
  thresholdPct = 70,
  showKeluarga = false,
}: {
  program: string;
  rows: PesertaRow[];
  fokus?: PesertaFokus;
  tanpaFokusHref?: string;
  /** Ambang kehadiran program — dipakai untuk warna merah dan fokus "bawah-target". */
  thresholdPct?: number;
  /**
   * Kolom Ortu + Usia. Hanya mabni (sekolah anak) yang punya data bapak/ibu dan
   * tanggal lahir yang berarti; program dewasa cuma menampilkan "—" atau tanggal
   * lahir placeholder 2000-01-01, jadi kolomnya disembunyikan di sana.
   */
  showKeluarga?: boolean;
}) {
  const [q, setQ] = useState("");
  const [gender, setGender] = useState<"all" | "1" | "2">("all");
  const [status, setStatus] = useState<"all" | "aktif" | "keluar">("aktif");
  const [halaqah, setHalaqah] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // Kolom Batch cuma bermakna saat barisnya datang dari lebih dari satu batch.
  const showBatch = rows.some((r) => r.batch);
  const columns = useMemo(
    () =>
      COLUMNS.filter(
        (c) =>
          (showBatch || c.key !== "batch") &&
          (showKeluarga || (c.key !== "ortu" && c.key !== "usia")),
      ),
    [showBatch, showKeluarga],
  );

  const halaqahOptions = useMemo(
    () => [...new Set(rows.map((r) => r.halaqahName).filter((h): h is string => !!h))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (gender !== "all" && String(r.gender) !== gender) return false;
      const aktif = statusOf(r).aktif;
      // Fokus "keluar" datang dari chip yang memang menghitung yang tidak aktif,
      // jadi ia mengambil alih tombol status; sisanya menumpang di atasnya.
      if (fokus === "keluar") {
        if (aktif) return false;
      } else {
        if (status === "aktif" && !aktif) return false;
        if (status === "keluar" && aktif) return false;
      }
      if (fokus === "tanpa-halaqah" && r.halaqahId != null) return false;
      if (fokus === "tanpa-wa" && r.phone) return false;
      if (
        fokus === "bawah-target" &&
        !(r.attendanceRate != null && r.attendanceRate < thresholdPct)
      ) {
        return false;
      }
      if (halaqah !== "all" && r.halaqahName !== halaqah) return false;
      if (needle === "") return true;
      // Nama orang tua ikut dicari: menemukan anak lewat nama bapak/ibu adalah
      // alasan utama kolom Ortu diminta.
      const kolom = [r.name, r.userCode, r.phone, r.halaqahName, r.pengajar, r.batch];
      if (showKeluarga) kolom.push(r.fatherName, r.motherName);
      return kolom.some((v) => (v ?? "").toLowerCase().includes(needle));
    });
    const sorted = [...base].sort((x, y) => cmp(sortValue(x, sortKey), sortValue(y, sortKey)));
    return dir === "asc" ? sorted : sorted.reverse();
  }, [rows, q, gender, status, halaqah, sortKey, dir, fokus, thresholdPct, showKeluarga]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // "usia" ikut menurun: yang paling tua lebih dulu adalah urutan yang berguna.
      setDir(
        key === "attendanceRate" || key === "hadirCount" || key === "izinCount" || key === "usia"
          ? "desc"
          : "asc",
      );
    }
  }

  return (
    <div id="daftar-peserta" className="space-y-3 scroll-mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Cari nama, ${showKeluarga ? "orang tua, " : ""}kode, nomor WA, halaqah, pengajar…`}
          className="w-full px-2 py-1.5 sm:w-80"
        />
        <SegmentedControl<"all" | "aktif" | "keluar">
          options={[
            { value: "aktif", label: "Aktif" },
            { value: "keluar", label: "Keluar" },
            { value: "all", label: "Semua" },
          ]}
          value={status}
          onChange={setStatus}
        />
        <SegmentedControl<"all" | "1" | "2">
          options={[
            { value: "all", label: "Semua" },
            { value: "1", label: "Ikhwan" },
            { value: "2", label: "Akhwat" },
          ]}
          value={gender}
          onChange={setGender}
        />
        {halaqahOptions.length > 1 && (
          <Select
            value={halaqah}
            onChange={(e) => setHalaqah(e.target.value)}
            aria-label="Filter halaqah"
            className="w-auto px-2 py-1.5"
          >
            <option value="all">Semua halaqah</option>
            {halaqahOptions.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        )}
        {fokus && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-11 text-warn dark:border-amber-500/30 dark:bg-amber-500/10">
            {FOKUS_LABEL[fokus]}
            {tanpaFokusHref && (
              <Link href={tanpaFokusHref} className="font-medium hover:underline" title="Hapus saringan">
                ×
              </Link>
            )}
          </span>
        )}
        <span className="text-12 text-ink-muted">{filtered.length} peserta</span>
      </div>

      {/*
       * 1119 baris: header harus ikut saat digulir. Sticky butuh sesuatu untuk
       * ditempeli, dan TableWrap hanya menggulir horizontal — jadi beri tinggi
       * maksimum supaya badan tabel menggulir di dalam bingkainya sendiri.
       */}
      <TableWrap maxHeight="calc(100dvh - 16rem)">
        <Table>
          <THead sticky>
            <TR>
              {columns.map((c) => (
                <TH
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`cursor-pointer select-none hover:text-primary ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="ml-1 text-primary">{dir === "asc" ? "▲" : "▼"}</span>
                  )}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {filtered.map((r) => {
              const st = statusOf(r);
              const wa = normalizePhone(r.phone);
              return (
                <TR
                  key={`${r.programSlug ?? program}-${r.tilawahUserId}`}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                >
                  <TD className="font-medium">
                    <span
                      className="inline-block max-w-[16rem] truncate align-bottom"
                      title={r.name ?? undefined}
                    >
                      {r.name ?? "-"}
                    </span>
                    {wa ? (
                      <a
                        href={`https://wa.me/${wa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={r.phone ?? undefined}
                        className="ml-2 text-11 font-normal text-ok hover:underline"
                      >
                        WA
                      </a>
                    ) : r.phone ? (
                      <span className="ml-2 text-11 font-normal text-ink-faint" title="Nomor tidak valid">
                        {r.phone}
                      </span>
                    ) : null}
                  </TD>
                  {showBatch && <TD className="text-12 text-ink-muted">{r.batch ?? "—"}</TD>}
                  <TD className="text-11 text-ink-muted">{r.userCode ?? "—"}</TD>
                  <TD>{genderLabel(r.gender)}</TD>
                  {showKeluarga && (
                    <>
                    {/*
                     * Bapak di atas, ibu di bawah — pola dua baris yang sama dengan
                     * sel Halaqah, masing-masing dipotong satu baris supaya tinggi
                     * baris tetap seragam. Nilai penuh ada di tooltip.
                     */}
                    <TD>
                      {r.fatherName || r.motherName ? (
                        <>
                          <span
                            className="block max-w-[14rem] truncate"
                            title={r.fatherName ?? undefined}
                          >
                            {r.fatherName ?? "-"}
                          </span>
                          <span
                            className="block max-w-[14rem] truncate text-11 leading-tight text-ink-muted"
                            title={r.motherName ?? undefined}
                          >
                            {r.motherName ?? "-"}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatUsia(r.usiaMonths)}
                      {r.birthDate && (
                        <div className="text-11 leading-tight text-ink-muted">{r.birthDate}</div>
                      )}
                    </TD>
                    </>
                  )}
                  {/*
                   * Dua baris, bukan tiga: nama halaqah dan jadwalnya masing-masing
                   * dipotong satu baris (judul lengkap ada di tooltip) supaya tinggi
                   * baris tabel tetap seragam.
                   */}
                  <TD>
                    {r.halaqahId != null && r.halaqahName ? (
                      <Link
                        href={`/${r.programSlug ?? program}/halaqah/${r.halaqahId}`}
                        title={r.halaqahName}
                        className="block max-w-[18rem] truncate text-primary hover:underline"
                      >
                        {r.halaqahName}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">belum ada halaqah</span>
                    )}
                    {r.jadwal && (
                      <div
                        title={r.jadwal}
                        className="max-w-[18rem] truncate text-11 leading-tight text-ink-muted"
                      >
                        {r.jadwal}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <span className="block max-w-[14rem] truncate" title={r.pengajar ?? undefined}>
                      {r.pengajar ?? "-"}
                    </span>
                  </TD>
                  <TD>{r.level ?? "-"}</TD>
                  <TD>
                    <span className={st.aktif ? "text-ink-muted" : "text-danger"}>
                      {st.label}
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {r.attendanceRate != null ? (
                      <span
                        className={
                          r.attendanceRate < thresholdPct ? "font-semibold text-danger" : ""
                        }
                      >
                        {r.attendanceRate.toFixed(1)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-right tabular-nums text-ink-muted">
                    {r.hadirCount ?? 0}/{r.effectiveMeetings ?? 0}
                    {r.pertemuan && <span className="ml-1 text-11">({r.pertemuan})</span>}
                  </TD>
                  <TD className="text-right tabular-nums text-ink-muted">{r.izinCount ?? 0}</TD>
                </TR>
              );
            })}
            {filtered.length === 0 && (
              <TR>
                <TD colSpan={columns.length} className="px-3 py-6 text-center text-ink-muted">
                  Tidak ada peserta untuk filter ini.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}
