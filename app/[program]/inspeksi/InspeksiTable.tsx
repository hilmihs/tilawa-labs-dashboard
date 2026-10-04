"use client";

/**
 * Tabel Inspeksi — satu tabel PER KELOMPOK, seperti layar upstream.
 *
 * Kenapa per kelompok dan bukan satu tabel besar bersaring: formulir ini diisi
 * per kelompok oleh ketuanya masing-masing, jadi pertanyaan yang dibawa orang ke
 * layar ini selalu "kelompok mana yang belum selesai". Satu tabel panjang dengan
 * kolom kelompok menjawab itu hanya kalau diurutkan dulu, dan menghilangkan
 * cacahan per kelompok ("7 dari 9 dinilai") yang justru jadi intinya. Penyaringan
 * ke SATU kelompok tetap ada, tapi dikerjakan di server lewat `?kelompok=` —
 * tautan yang bisa dibagikan — sementara `SegmentedControl` di sini hanya
 * menyaring BARIS (semua / belum dinilai / sudah dinilai) di seluruh tabel
 * sekaligus, tanpa memuat ulang halaman.
 *
 * Aturan render yang jadi alasan berkas ini ada:
 *   - sel kosong dirender sebagai tanda pisah, TIDAK PERNAH 0. Pada cermin 7 Sep
 *     2026 hampir separuh sel skor null (SOP hanya 29% terisi); nol di sana
 *     terbaca sebagai nilai gagal;
 *   - kelima skor tampil apa adanya — tidak ada rata-rata, peringkat, atau
 *     persentase kelengkapan yang dihitung di layar ini (docs/API-PUBLIC.md §9).
 *     Yang muncul hanya cacahan baris;
 *   - `skor_kepatuhan_sop` berdiri di kolomnya sendiri, dipisah garis, karena
 *     upstream mengarsipkannya di SOFT SKILL — ia bukan komponen
 *     `rata_rata_pedagogis`;
 *   - "di bawah standar" diwarnai, dan ambangnya datang dari `indikator-standar`
 *     (standar = 4), bukan dari perbandingan yang dikarang di sini.
 */
import * as React from "react";
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
import { cn } from "@/lib/utils";
import {
  formatSkor,
  KOLOM_PEDAGOGIS,
  tanggalSingkat,
  type InspeksiBaris,
  type InspeksiKelompok,
  type InspeksiLegenda,
  type InspeksiSel,
} from "./view-model";

/** Nilai satu kolom pedagogis pada satu baris; `null` kalau kolomnya kosong. */
function nilaiKolom(row: InspeksiBaris, kode: string): number | null {
  return row.pedagogis.find((s) => s.kode === kode)?.nilai ?? null;
}

// Konstanta level modul: peta ini jadi dependensi `useMemo` di useTableSort —
// objek baru tiap render akan mengurutkan ulang seluruh tabel tanpa alasan.
const ACCESSORS: SortAccessors<InspeksiBaris> = {
  nama: (r) => r.nama,
  halaqah: (r) => r.halaqahDiBatch,
  kepatuhan_silabus: (r) => nilaiKolom(r, "kepatuhan_silabus"),
  manajemen_halaqah: (r) => nilaiKolom(r, "manajemen_halaqah"),
  evaluasi_penguasaan: (r) => nilaiKolom(r, "evaluasi_penguasaan"),
  metode_pengajaran: (r) => nilaiKolom(r, "metode_pengajaran"),
  kepatuhan_sop: (r) => r.sop.nilai,
  teguran: (r) => r.teguranBulan,
  diperbarui: (r) => r.diperbaruiPada,
};

type Saringan = "semua" | "belum" | "dinilai";

const SARINGAN: { value: Saringan; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "belum", label: "Belum dinilai" },
  { value: "dinilai", label: "Sudah dinilai" },
];

function saring(rows: InspeksiBaris[], f: Saringan): InspeksiBaris[] {
  if (f === "semua") return rows;
  if (f === "belum") return rows.filter((r) => r.belumDinilai);
  return rows.filter((r) => !r.belumDinilai);
}

/** Satu sel skor. Kosong = tanda pisah; di bawah standar = kuning + judul jelas. */
function Skor({ sel }: { sel: InspeksiSel }) {
  if (sel.nilai == null) {
    return (
      <span className="text-ink-faint" title={`${sel.label} — belum diisi`}>
        —
      </span>
    );
  }
  return (
    <span
      className={cn("tabular-nums", sel.dibawahStandar && "font-medium text-warn")}
      title={
        sel.standar == null
          ? sel.label
          : `${sel.label} — standar ${formatSkor(sel.standar)}${
              sel.dibawahStandar ? " (di bawah standar)" : ""
            }`
      }
    >
      {formatSkor(sel.nilai)}
    </span>
  );
}

function Baris({ row, teguranAktif }: { row: InspeksiBaris; teguranAktif: boolean }) {
  const diperbarui = tanggalSingkat(row.diperbaruiPada);
  return (
    <TR>
      <TD className="font-medium">
        {row.nama}
        {row.isKetua && (
          <Badge tone="info" className="ml-2">
            ketua
          </Badge>
        )}
        {row.dikecualikan && (
          <Badge tone="neutral" className="ml-2" title="matrix_exclude di Maahir">
            dikecualikan
          </Badge>
        )}
        {!row.active && <span className="ml-2 text-11 text-ink-faint">nonaktif</span>}
        {row.belumDinilai && (
          <Badge tone="warning" className="ml-2">
            belum
          </Badge>
        )}
        {row.barisKosong && (
          <Badge tone="neutral" className="ml-2" title="Baris penilaiannya ada, tapi kelima skornya masih kosong">
            terbuka, kosong
          </Badge>
        )}
      </TD>
      <TD numeric className="text-ink-muted">
        {row.halaqahDiBatch}
      </TD>
      {row.pedagogis.map((s) => (
        <TD key={s.kode} numeric>
          <Skor sel={s} />
        </TD>
      ))}
      {/* Garis kiri = batas kategori. SOP dikumpulkan di formulir yang sama tapi
          diarsipkan upstream sebagai soft skill. */}
      <TD numeric className="border-l border-neutral-300 dark:border-neutral-800">
        <Skor sel={row.sop} />
      </TD>
      {teguranAktif && (
        <TD numeric className={row.teguranBulan ? "text-warn" : "text-ink-faint"}>
          {row.teguranBulan ?? "—"}
        </TD>
      )}
      <TD className="text-12 text-ink-muted">
        {diperbarui ?? <span className="text-ink-faint">—</span>}
      </TD>
    </TR>
  );
}

function KelompokTable({
  kelompok,
  filter,
  teguranAktif,
  kolomTotal,
}: {
  kelompok: InspeksiKelompok;
  filter: Saringan;
  teguranAktif: boolean;
  kolomTotal: number;
}) {
  const tersaring = React.useMemo(() => saring(kelompok.rows, filter), [kelompok.rows, filter]);
  const { rows, sort, toggle } = useTableSort(tersaring, ACCESSORS);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">
          {kelompok.nama}{" "}
          <span className="font-normal text-ink-faint">({kelompok.rows.length})</span>
        </h2>
        <p className="text-12 text-ink-muted tabular-nums">
          {kelompok.dinilai} dari {kelompok.dinilai + kelompok.belumDinilai} pengajar sudah dinilai
          {kelompok.dikecualikan > 0 && (
            <span className="text-ink-faint">
              {" "}
              · {kelompok.dikecualikan} dikecualikan dari penilaian
            </span>
          )}
        </p>
      </div>

      <TableWrap>
        <Table>
          <THead>
            <TR>
              <SortTH sortKey="nama" sort={sort} onSort={toggle}>
                Pengajar
              </SortTH>
              <SortTH sortKey="halaqah" sort={sort} onSort={toggle} className="text-right">
                Halaqah
              </SortTH>
              {KOLOM_PEDAGOGIS.map((k) => (
                <SortTH
                  key={k.kode}
                  sortKey={k.kode}
                  sort={sort}
                  onSort={toggle}
                  className="text-right"
                >
                  {k.labelBawaan}
                </SortTH>
              ))}
              <SortTH
                sortKey="kepatuhan_sop"
                sort={sort}
                onSort={toggle}
                className="border-l border-neutral-300 text-right dark:border-neutral-800"
              >
                Kepatuhan SOP
              </SortTH>
              {teguranAktif && (
                <SortTH sortKey="teguran" sort={sort} onSort={toggle} className="text-right">
                  Teguran
                </SortTH>
              )}
              <SortTH sortKey="diperbarui" sort={sort} onSort={toggle}>
                Diperbarui
              </SortTH>
            </TR>
            <TR>
              <TH className="pt-0 text-11 font-normal text-ink-faint" colSpan={2} />
              <TH
                className="pt-0 text-center text-11 font-normal text-ink-faint"
                colSpan={KOLOM_PEDAGOGIS.length}
              >
                pedagogis
              </TH>
              <TH className="pt-0 text-center text-11 font-normal text-ink-faint">soft skill</TH>
              <TH className="pt-0" colSpan={teguranAktif ? 2 : 1} />
            </TR>
          </THead>
          <TBody zebra>
            {rows.length === 0 && (
              <TR>
                <TD colSpan={kolomTotal} className="py-6 text-center text-14 text-ink-muted">
                  Tidak ada baris pada saringan ini.
                </TD>
              </TR>
            )}
            {rows.map((r) => (
              <Baris key={r.pengajarId} row={r} teguranAktif={teguranAktif} />
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </section>
  );
}

export function InspeksiTable({
  kelompok,
  legenda,
  teguranAktif,
}: {
  kelompok: InspeksiKelompok[];
  legenda: InspeksiLegenda;
  teguranAktif: boolean;
}) {
  const [filter, setFilter] = React.useState<Saringan>("semua");
  const total = kelompok.reduce((n, k) => n + k.rows.length, 0);
  const tampil = kelompok.reduce((n, k) => n + saring(k.rows, filter).length, 0);
  const kolomTotal = 2 + KOLOM_PEDAGOGIS.length + 1 + (teguranAktif ? 1 : 0) + 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={filter}
          onChange={setFilter}
          options={SARINGAN}
        />
        <p className="text-12 text-ink-muted tabular-nums">
          {tampil} dari {total} baris
        </p>
      </div>

      {kelompok.map((k) => (
        <KelompokTable
          key={k.id || "tanpa-kelompok"}
          kelompok={k}
          filter={filter}
          teguranAktif={teguranAktif}
          kolomTotal={kolomTotal}
        />
      ))}

      <div className="space-y-1 text-11 text-ink-faint">
        <p>
          Tanda &ldquo;—&rdquo; berarti belum diisi, bukan nilai nol. Skor ditampilkan apa adanya
          dari Maahir; tidak ada rata-rata, peringkat, atau persentase yang dihitung di halaman ini.
        </p>
        <p>
          Standar rubrik:{" "}
          {legenda.pedagogis.map((i, idx) => (
            <React.Fragment key={i.kode}>
              {idx > 0 && " · "}
              {i.label} {formatSkor(i.standar)}
            </React.Fragment>
          ))}
          {" · "}
          {legenda.sop.label} {formatSkor(legenda.sop.standar)}. Nilai di bawah standar ditandai
          kuning.
        </p>
      </div>
    </div>
  );
}
