"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  SortTH,
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useTableSort,
  type SortAccessors,
} from "@/components/ui/table";
import {
  filterRoster,
  labelGender,
  MAAHIR_ROSTER_FILTER_AWAL,
  tanggalPendek,
  type MaahirRosterBaris,
  type MaahirRosterFilter,
} from "./maahir-view-model";

/**
 * Konstanta level modul: peta ini jadi dependensi `useMemo` di `useTableSort`,
 * dan objek baru tiap render akan mengurutkan ulang seluruh tabel tanpa alasan.
 */
const ACCESSORS: SortAccessors<MaahirRosterBaris> = {
  nama: (r) => r.nama,
  gender: (r) => r.gender,
  kelas: (r) => r.kelasNama,
  musyrif: (r) => r.musyrifNama,
  kelasProgram: (r) => r.keanggotaan.length,
  peran: (r) => r.peran,
  mulai: (r) => r.mulaiTanggal,
  // "aktif" > "nonaktif" > tidak diketahui (null → selalu di belakang).
  status: (r) => (r.aktif == null ? null : r.aktif ? "aktif" : "nonaktif"),
};

const STATUS_OPSI = [
  { value: "semua" as const, label: "Semua status" },
  { value: "aktif" as const, label: "Aktif" },
  { value: "nonaktif" as const, label: "Nonaktif" },
];

/** Em dash — dipakai untuk "tidak ada / tidak diketahui", tidak pernah 0 atau "-". */
function Kosong() {
  return <span className="text-ink-faint">—</span>;
}

/**
 * Daftar orang Maahir lintas kelas. Penyaringan dan pengurutan murni di klien:
 * seluruh roster hanya ratusan baris, dan satu putaran ke server hanya akan
 * menarik payload yang sama persis.
 *
 * Tidak ada kolom persentase, rata-rata, atau peringkat di sini — layar ini
 * mendaftar orang; angka kehadiran resmi ada di tab Kehadiran.
 */
export function MaahirPesertaTable({
  program,
  rows,
  programKelasOpsi,
  genderOpsi,
}: {
  /** Slug program — nama tiap baris menaut ke `/[program]/peserta/[key]`. */
  program: string;
  rows: MaahirRosterBaris[];
  programKelasOpsi: { id: string; nama: string }[];
  genderOpsi: string[];
}) {
  const [filter, setFilter] = React.useState<MaahirRosterFilter>(MAAHIR_ROSTER_FILTER_AWAL);
  const filtered = React.useMemo(() => filterRoster(rows, filter), [rows, filter]);
  const { rows: sorted, sort, toggle } = useTableSort(filtered, ACCESSORS);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {programKelasOpsi.length > 1 && (
            <select
              value={filter.programKelas}
              onChange={(e) => setFilter((f) => ({ ...f, programKelas: e.target.value }))}
              className="rounded-lg border border-neutral-300 bg-card px-2.5 py-1.5 text-xs dark:border-neutral-800"
              aria-label="Saring kelas-program"
            >
              <option value="semua">Semua kelas-program ({programKelasOpsi.length})</option>
              {programKelasOpsi.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nama}
                </option>
              ))}
            </select>
          )}
          {genderOpsi.length > 1 && (
            <SegmentedControl
              size="sm"
              value={filter.gender}
              onChange={(gender) => setFilter((f) => ({ ...f, gender }))}
              options={[
                { value: "semua", label: "Semua gender" },
                ...genderOpsi.map((g) => ({ value: g, label: labelGender(g) ?? g })),
              ]}
            />
          )}
          <SegmentedControl
            size="sm"
            value={filter.status}
            onChange={(status) => setFilter((f) => ({ ...f, status }))}
            options={STATUS_OPSI}
          />
        </div>
        <p className="text-12 text-ink-muted tabular-nums">
          {sorted.length} dari {rows.length} baris
        </p>
      </div>

      {/* Saringan status hanya mengenal yang statusnya tercatat; baris enrolmen
          tidak menyimpan status aktif sama sekali, dan "tidak tahu" tidak boleh
          dibaca sebagai "tidak". Dinyatakan, bukan disembunyikan. */}
      {filter.status !== "semua" && (
        <p className="text-11 text-ink-faint">
          Saringan status hanya berlaku untuk baris yang punya status tercatat; baris dari sisi
          anggota tidak menyimpannya dan tidak ikut di sini.
        </p>
      )}

      {/* Kepala menempel: daftar nama panjang tanpa kepala yang menetap tidak terbaca. */}
      <TableWrap maxHeight="70vh">
        <Table>
          <THead sticky>
            <TR>
              <SortTH sortKey="nama" sort={sort} onSort={toggle}>
                Nama
              </SortTH>
              <SortTH sortKey="gender" sort={sort} onSort={toggle}>
                Gender
              </SortTH>
              <SortTH sortKey="kelas" sort={sort} onSort={toggle}>
                Kelas
              </SortTH>
              <SortTH sortKey="musyrif" sort={sort} onSort={toggle}>
                Musyrif
              </SortTH>
              <SortTH sortKey="kelasProgram" sort={sort} onSort={toggle}>
                Kelas-program
              </SortTH>
              <SortTH sortKey="peran" sort={sort} onSort={toggle}>
                Peran
              </SortTH>
              <SortTH sortKey="mulai" sort={sort} onSort={toggle}>
                Mulai
              </SortTH>
              <SortTH sortKey="status" sort={sort} onSort={toggle}>
                Status
              </SortTH>
            </TR>
            <TR>
              <TH className="pt-0 text-11 font-normal text-ink-faint" colSpan={4}>
                daftar orang mentah dari cermin Maahir
              </TH>
              <TH className="pt-0 text-11 font-normal text-ink-faint" colSpan={4}>
                enrolmen apa adanya — tanpa angka kehadiran
              </TH>
            </TR>
          </THead>
          <TBody zebra>
            {sorted.length === 0 && (
              <TR>
                <TD colSpan={8} className="py-6 text-center text-14 text-ink-muted">
                  Tidak ada orang pada saringan ini.
                </TD>
              </TR>
            )}
            {sorted.map((r) => (
              <TR key={r.key}>
                <TD className="font-medium">
                  <Link
                    href={`/${program}/peserta/${encodeURIComponent(r.key)}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {r.nama}
                  </Link>
                  {/* Baris yang hanya ada sebagai enrolmen ditandai terang-terangan:
                      ia bukan orang yang terdaftar di roster `peserta`, dan tidak
                      ada yang menjamin dua enrolmen bernama sama adalah satu orang. */}
                  {r.sumber === "anggota" && (
                    <span
                      className="ml-2 text-11 text-ink-faint"
                      title="Baris ini datang dari anggota tanpa peserta_id — enrolmen membawa namanya sendiri dan tidak menunjuk baris peserta mana pun. Satu baris di sini = satu enrolmen, bukan satu orang yang sudah dipastikan."
                    >
                      hanya enrolmen
                    </span>
                  )}
                </TD>
                <TD className="text-ink-muted">{labelGender(r.gender) ?? <Kosong />}</TD>
                <TD>{r.kelasNama ?? <Kosong />}</TD>
                <TD className="text-ink-muted">{r.musyrifNama ?? <Kosong />}</TD>
                <TD className="text-12">
                  {r.keanggotaan.length === 0 ? (
                    <Kosong />
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.keanggotaan.map((k) => (
                        <Badge
                          key={k.anggotaId}
                          tone={k.peran ? "info" : "neutral"}
                          title={[
                            k.peran ? `peran ${k.peran}` : null,
                            k.mulaiTanggal ? `mulai ${tanggalPendek(k.mulaiTanggal)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        >
                          {k.programKelasNama ?? "kelas-program tak dikenal"}
                        </Badge>
                      ))}
                    </span>
                  )}
                </TD>
                <TD>
                  {r.peran ? (
                    <Badge tone={r.peran === "ketua" ? "indigo" : "teal"}>{r.peran}</Badge>
                  ) : (
                    <Kosong />
                  )}
                </TD>
                {/* mulai_tanggal null pada mayoritas baris: em dash, tidak dikarang. */}
                <TD className="whitespace-nowrap tabular-nums">
                  {r.mulaiTanggal == null ? <Kosong /> : tanggalPendek(r.mulaiTanggal)}
                </TD>
                {/* null di sini berarti "tidak tercatat", bukan "nonaktif". */}
                <TD>
                  {r.aktif == null ? (
                    <Kosong />
                  ) : r.aktif ? (
                    <Badge tone="success">aktif</Badge>
                  ) : (
                    <Badge tone="warning">nonaktif</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}
