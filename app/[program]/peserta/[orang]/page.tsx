/**
 * `/[program]/peserta/[orang]` — semua yang Maahir tahu tentang satu orang.
 *
 * Khusus program `maahir_api`; program lain 404 (roster mereka punya layarnya
 * sendiri). Kunci URL = id `peserta` atau id `anggota` — lihat `resolveOrang`.
 *
 * Susunan halaman mengikuti batas rekap vs mentah: blok "Angka resmi" hanya
 * menyalin `maahir_rekap`; blok di bawahnya adalah riwayat mentah, satu baris
 * per kejadian, tanpa persen apa pun.
 *
 * `catatan` presensi dan `alasan` pemutihan ikut tampil — sama dengan grid
 * Kehadiran dan layar SP yang sudah menampilkannya ke pengguna ber-login.
 * Halaman ini `noindex` dan tidak punya jalur ekspor (docs §7).
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProgram } from "@/lib/programs/resolve";
import { Badge } from "@/components/ui/badge";
import { TableWrap, Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { toneBadgeClass, type StatusTone } from "@/lib/ui/status";
import type { MaahirKehadiranKode } from "@/lib/maahir/types";
import { persenLabel, fetchedAtLabel } from "../../kehadiran/view-model";
import { labelGender, tanggalPendek } from "../maahir-view-model";
import { loadOrangMaahir, type OrangMaahir } from "./queries";
import {
  cacahPerStatus,
  durasiLabel,
  jamLabel,
  labelJenisRekaman,
  labelStatusKehadiran,
  labelStatusSetoran,
  waktuWib,
} from "./view-model";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rincian Peserta Maahir", robots: { index: false, follow: false } };

const STATUS_TONE: Record<string, StatusTone> = {
  hadir: "success",
  terlambat: "warning",
  izin: "info",
  sakit: "teal",
  tidak_ada_keterangan: "danger",
};

const KODE_TONE: Record<MaahirKehadiranKode, StatusTone> = {
  H: "success",
  T: "warning",
  I: "info",
  S: "teal",
  A: "danger",
};

const NILAI_TONE: Record<string, StatusTone> = {
  hijau: "success",
  kuning: "warning",
  merah: "danger",
};

const SETORAN_TONE: Record<string, StatusTone> = {
  checked: "success",
  submitted: "info",
  draft: "neutral",
};

function Kosong() {
  return <span className="text-ink-muted">—</span>;
}

function Bagian({
  judul,
  keterangan,
  children,
}: {
  judul: string;
  keterangan?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold">{judul}</h2>
        {keterangan && <p className="mt-0.5 text-xs text-ink-muted">{keterangan}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function OrangMaahirPage({
  params,
}: {
  params: Promise<{ program: string; orang: string }>;
}) {
  const { program, orang: key } = await params;
  const programRow = await getProgram(program);
  if (!programRow || programRow.dataSourceType !== "maahir_api") notFound();

  const hasil = await loadOrangMaahir(decodeURIComponent(key));
  if (hasil.state === "alihkan") redirect(`/${program}/peserta/${hasil.pesertaId}`);
  if (hasil.state === "tidak-ada") notFound();
  const o = hasil.orang;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <Kepala o={o} program={program} />
      <KeanggotaanBagian o={o} />
      <AngkaResmi o={o} />
      <RiwayatPresensi o={o} />
      {o.setoran && <SetoranBagian setoran={o.setoran} />}
      {o.penilaian && o.penilaian.length > 0 && <PenilaianBagian o={o} />}
      <PemutihanBagian o={o} />
      <LiburBagian o={o} />
    </main>
  );
}

// ── Kepala ─────────────────────────────────────────────────────────────────

function Kepala({ o, program }: { o: OrangMaahir; program: string }) {
  const peran = o.keanggotaan.some((k) => k.anggota.is_ketua)
    ? "Ketua"
    : o.keanggotaan.some((k) => k.anggota.is_wakil)
      ? "Wakil"
      : null;
  return (
    <div className="space-y-2">
      <Link href={`/${program}/peserta`} className="text-xs text-ink-muted hover:underline">
        ← Semua peserta
      </Link>
      <h1 className="text-[19px] font-bold tracking-[-0.01em]">{o.nama}</h1>
      <div className="flex flex-wrap items-center gap-1.5">
        {o.jenis === "peserta" ? (
          <Badge tone="indigo">Peserta</Badge>
        ) : (
          <Badge
            tone="neutral"
            title="Enrolmen tanpa peserta_id: upstream tidak menautkannya ke baris peserta mana pun, jadi riwayat di sini hanya milik enrolmen ini."
          >
            Enrolmen lepas
          </Badge>
        )}
        {labelGender(o.gender) && <Badge tone="neutral">{labelGender(o.gender)}</Badge>}
        {o.aktif === true && <Badge tone="success">Aktif</Badge>}
        {o.aktif === false && <Badge tone="danger">Nonaktif</Badge>}
        {peran && <Badge tone="warning">{peran}</Badge>}
      </div>
      {(o.kelasNama || o.musyrifNama) && (
        <p className="text-sm text-ink-muted">
          Kelas {o.kelasNama ?? "—"}
          {o.musyrifNama && <> · musyrif {o.musyrifNama}</>}
        </p>
      )}
    </div>
  );
}

// ── Keanggotaan ────────────────────────────────────────────────────────────

function KeanggotaanBagian({ o }: { o: OrangMaahir }) {
  return (
    <Bagian judul={`Keanggotaan (${o.keanggotaan.length})`}>
      {o.keanggotaan.length === 0 ? (
        <p className="text-sm text-ink-muted">Belum terdaftar di program-kelas mana pun.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {o.keanggotaan.map(({ anggota: a, programKelas: pk }) => {
            const mulai = jamLabel(pk?.waktu_mulai ?? null);
            const selesai = jamLabel(pk?.waktu_selesai ?? null);
            return (
              <div
                key={a.id}
                className="rounded-xl border border-neutral-300 bg-card p-3 text-sm dark:border-neutral-800 dark:bg-transparent"
              >
                <div className="flex flex-wrap items-center gap-1.5 font-medium">
                  {pk?.name ?? "Program-kelas tidak ada di cermin"}
                  {a.is_ketua && <Badge tone="warning">Ketua</Badge>}
                  {!a.is_ketua && a.is_wakil && <Badge tone="warning">Wakil</Badge>}
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-ink-muted">Jadwal</dt>
                  <dd>
                    {pk?.jadwal_hari?.length ? pk.jadwal_hari.join(", ") : <Kosong />}
                    {mulai && (
                      <span className="text-ink-muted">
                        {" "}
                        · {mulai}
                        {selesai && `–${selesai}`}
                      </span>
                    )}
                  </dd>
                  <dt className="text-ink-muted">Presensi</dt>
                  <dd>
                    {pk?.presensi_sifat ?? <Kosong />}
                    {pk?.self_attendance && <span className="text-ink-muted"> · isi sendiri</span>}
                  </dd>
                  <dt className="text-ink-muted">Mulai</dt>
                  <dd>{a.mulai_tanggal ? tanggalPendek(a.mulai_tanggal) : <Kosong />}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </Bagian>
  );
}

// ── Angka resmi (rekap) ────────────────────────────────────────────────────

function AngkaResmi({ o }: { o: OrangMaahir }) {
  return (
    <Bagian
      judul="Angka resmi Maahir"
      keterangan="Disalin dari rekap Maahir apa adanya — sesi sakit di luar penyebut, pemutihan dihitung 100%, penyebut dimulai dari tanggal masuk. Jangan dibandingkan dengan cacah riwayat di bawah."
    >
      <div className="space-y-4">
        {o.kehadiranBulanan.length === 0 ? (
          <p className="text-sm text-ink-muted">Rekap kehadiran belum ditarik untuk dua periode terakhir.</p>
        ) : (
          o.kehadiranBulanan.map((b) =>
            b.kelas.length === 0 ? (
              <p key={b.bulan} className="text-sm text-ink-muted">
                Kehadiran {b.periode ?? b.bulan}: tidak tercantum di rekap periode ini.
              </p>
            ) : (
              b.kelas.map((k) => (
                <KartuKehadiran
                  key={`${b.bulan}-${k.kelasName}-${k.baris.anggotaId}`}
                  k={k}
                  periode={b.periode ?? b.bulan}
                  ditarik={fetchedAtLabel(b.fetchedAt)}
                />
              ))
            ),
          )
        )}

        <KartuSp o={o} />

        {o.setoranBulanan.some((b) => b.baris.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-muted">Capaian setoran (Takhassus)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {o.setoranBulanan.flatMap((b) =>
                b.baris.map((s) => (
                  <div
                    key={`${b.bulan}-${s.anggotaId}`}
                    className="rounded-xl border border-neutral-300 bg-card p-3 text-sm dark:border-neutral-800 dark:bg-transparent"
                  >
                    <p className="text-xs text-ink-muted">{b.periode ?? b.bulan}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{persenLabel(s.persen)}</p>
                    <p className="text-xs text-ink-muted">
                      {s.halaman} / {s.target} halaman · setor {s.pertemuanSetor} dari {s.sesiTarget} sesi
                    </p>
                    {s.rincian && <p className="mt-1 text-xs">{s.rincian}</p>}
                  </div>
                )),
              )}
            </div>
          </div>
        )}
      </div>
    </Bagian>
  );
}

// Periode Maahir 28→27 melintasi dua bulan, jadi nomor hari saja ambigu.
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const KODE_NAMA: Record<MaahirKehadiranKode, string> = {
  H: "Hadir",
  T: "Telat",
  I: "Izin",
  S: "Sakit",
  A: "Alfa",
};

/**
 * Satu kartu per kelas per periode. Disusun untuk dibaca sekilas: persen resmi
 * + bar di kanan atas, lalu satu kotak berwarna per pertemuan (warna = status,
 * tanggal + bulan di dalam, nama status di tooltip), lalu hanya status yang terjadi — chip "A 0" dulu
 * cuma menambah warna tanpa informasi. Catatan per pertemuan ditulis bersama
 * tanggalnya; titik kecil di kotak menandai pertemuan yang punya catatan.
 */
function KartuKehadiran({
  k,
  periode,
  ditarik,
}: {
  k: OrangMaahir["kehadiranBulanan"][number]["kelas"][number];
  periode: string;
  ditarik: string;
}) {
  const a = k.baris;
  const kodeUrut: MaahirKehadiranKode[] = ["H", "T", "I", "S", "A"];
  const pertemuan = [...k.pertemuan].sort((x, y) => x.tanggal.localeCompare(y.tanggal));
  const ringkas = kodeUrut.filter((kode) => (a.totals?.[kode] ?? 0) > 0);
  const persen = a.persenHadir;
  const catatanTanggal = pertemuan.flatMap((p) => {
    const c = a.catatanPerPertemuan?.[p.id];
    return c ? [{ id: p.id, tgl: `${p.tanggal.slice(8, 10)}/${p.tanggal.slice(5, 7)}`, kode: a.perPertemuan?.[p.id], c }] : [];
  });
  return (
    <div className="rounded-xl border border-neutral-300 bg-card p-4 text-sm dark:border-neutral-800 dark:bg-transparent">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{k.kelasName}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {periode} · ditarik {ditarik}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold leading-none tabular-nums">{persenLabel(persen)}</p>
          <p className="mt-1 text-[11px] text-ink-muted">kehadiran resmi</p>
        </div>
      </div>

      {persen != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${Math.max(0, Math.min(100, persen))}%` }}
          />
        </div>
      )}

      {pertemuan.length > 0 && (
        <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1.5">
          {pertemuan.map((p) => {
            const kode = a.perPertemuan?.[p.id];
            const catatan = a.catatanPerPertemuan?.[p.id];
            const nyata = kode && kode !== "-";
            const tone: StatusTone = nyata ? KODE_TONE[kode] : "neutral";
            const nama = nyata ? KODE_NAMA[kode] : "Belum diisi";
            return (
              <li
                key={p.id}
                title={`${tanggalPendek(p.tanggal)} · ${nama} · ${p.programLabel}${catatan ? ` · ${catatan}` : ""}`}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-md leading-none ${toneBadgeClass[tone]}`}
              >
                <span className="text-[13px] font-semibold tabular-nums">{Number(p.tanggal.slice(8, 10))}</span>
                <span className="mt-0.5 text-[9px] font-medium opacity-75">{BULAN_PENDEK[Number(p.tanggal.slice(5, 7)) - 1]}</span>
                {catatan && (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-current" aria-label="ada catatan" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {ringkas.length === 0 ? (
          <span className="text-ink-muted">Belum ada pertemuan tercatat.</span>
        ) : (
          ringkas.map((kode) => (
            <span key={kode} className="inline-flex items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${toneBadgeClass[KODE_TONE[kode]]}`} />
              <span className="text-ink-muted">{KODE_NAMA[kode]}</span>
              <span className="font-semibold tabular-nums">{a.totals?.[kode] ?? 0}</span>
            </span>
          ))
        )}
      </div>

      {catatanTanggal.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
          {catatanTanggal.map((c) => (
            <li key={c.id} className="flex gap-2">
              <span className="w-10 shrink-0 tabular-nums text-ink-muted">{c.tgl}</span>
              <span>
                {c.kode && c.kode !== "-" && <span className="text-ink-muted">{KODE_NAMA[c.kode]} — </span>}
                {c.c}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        a.keterangan && (
          <p className="mt-3 border-t border-border pt-3 text-xs text-ink-muted">Catatan: {a.keterangan}</p>
        )
      )}
    </div>
  );
}

function KartuSp({ o }: { o: OrangMaahir }) {
  if (!o.sp) {
    return <p className="text-sm text-ink-muted">Rekap SP belum ditarik.</p>;
  }
  const rentang =
    o.sp.mulai && o.sp.cutoff
      ? `${tanggalPendek(o.sp.mulai)} – ${tanggalPendek(o.sp.cutoff)}`
      : "rentang tidak tercatat";
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-ink-muted">
        Surat peringatan · kumulatif {rentang}
      </p>
      {o.sp.rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Tidak tercantum di daftar SP.</p>
      ) : (
        o.sp.rows.map((s) => (
          <div
            key={s.anggotaId}
            className="rounded-xl border border-neutral-300 bg-card p-3 text-sm dark:border-neutral-800 dark:bg-transparent"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{s.kelasName}</span>
              <Badge tone={s.sp >= 3 ? "danger" : s.sp >= 1 ? "warning" : "success"}>
                {s.sp > 0 ? `SP ${s.sp}` : "Tanpa SP"}
              </Badge>
              {s.spKotor !== s.sp && (
                <span className="text-xs text-ink-muted">sebelum pemutihan: SP {s.spKotor}</span>
              )}
            </div>
            <p className="mt-1 text-xs tabular-nums text-ink-muted">
              Hadir {s.hadir} · Terlambat {s.terlambat} · Izin {s.izin} · Sakit {s.sakit} · Alpa {s.alpa}
            </p>
            {s.penetapan.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs">
                {s.penetapan.map((p, i) => (
                  <li key={i}>
                    SP {p.level} · {tanggalPendek(p.tanggal)} · {p.pemicu}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Riwayat presensi (mentah) ──────────────────────────────────────────────

function RiwayatPresensi({ o }: { o: OrangMaahir }) {
  const cacah = cacahPerStatus(o.riwayat);
  return (
    <Bagian
      judul={`Riwayat presensi (${o.riwayat.length})`}
      keterangan="Setiap baris presensi yang tercatat, semua periode. Cacah di bawah hanya jumlah baris, bukan persen kehadiran."
    >
      {o.riwayat.length === 0 ? (
        <p className="text-sm text-ink-muted">Belum ada baris presensi tercatat.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {cacah.map((c) => (
              <Badge key={c.status} tone={STATUS_TONE[c.status] ?? "neutral"}>
                {labelStatusKehadiran(c.status)} {c.n}
              </Badge>
            ))}
          </div>
          <TableWrap maxHeight={520}>
            <Table>
              <THead sticky>
                <TR>
                  <TH>Tanggal</TH>
                  <TH>Kegiatan</TH>
                  <TH>Status</TH>
                  <TH>Mode</TH>
                  <TH>Setoran</TH>
                  <TH>Catatan</TH>
                  <TH>Diisi</TH>
                </TR>
              </THead>
              <TBody zebra>
                {o.riwayat.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap">{r.tanggal ? tanggalPendek(r.tanggal) : <Kosong />}</TD>
                    <TD className="min-w-[10rem]">
                      {r.programKelasNama ?? r.kegiatan ?? <Kosong />}
                      {r.jam && <span className="block text-xs text-ink-muted">{r.jam}</span>}
                    </TD>
                    <TD>
                      <Badge tone={(r.status && STATUS_TONE[r.status]) || "neutral"}>
                        {labelStatusKehadiran(r.status)}
                      </Badge>
                    </TD>
                    <TD className="text-ink-muted">{r.mode ?? <Kosong />}</TD>
                    <TD className="tabular-nums">
                      {r.setoranHalaman != null ? `${r.setoranHalaman} hlm` : <Kosong />}
                    </TD>
                    <TD className="max-w-[16rem] text-xs">{r.catatan ?? <Kosong />}</TD>
                    <TD className="whitespace-nowrap text-xs text-ink-muted">{waktuWib(r.diisiAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </>
      )}
    </Bagian>
  );
}

// ── Setoran pekanan ────────────────────────────────────────────────────────

function SetoranBagian({ setoran }: { setoran: NonNullable<OrangMaahir["setoran"]> }) {
  return (
    <Bagian
      judul={`Setoran pekanan (${setoran.length})`}
      keterangan="Rekaman per setoran beserta nilai musyrif. Nilai kosong = belum dinilai."
    >
      {setoran.length === 0 ? (
        <p className="text-sm text-ink-muted">Belum ada setoran tercatat.</p>
      ) : (
        <div className="space-y-2">
          {setoran.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-neutral-300 bg-card p-3 text-sm dark:border-neutral-800 dark:bg-transparent"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  Pekan {s.weekStart ? tanggalPendek(s.weekStart) : "—"}
                </span>
                <Badge tone={(s.status && SETORAN_TONE[s.status]) || "neutral"}>
                  {labelStatusSetoran(s.status)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Dikirim {waktuWib(s.submittedAt)}
                {s.checkedAt && (
                  <>
                    {" "}
                    · dicek {waktuWib(s.checkedAt)}
                    {s.pengecek && <> oleh {s.pengecek}</>}
                  </>
                )}
              </p>
              {s.rekaman.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {s.rekaman.map((r) => (
                    <li
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800"
                    >
                      <span>{labelJenisRekaman(r.jenis)}</span>
                      <span className="tabular-nums text-ink-muted">{durasiLabel(r.durasiDetik)}</span>
                      <Badge tone={(r.nilai && NILAI_TONE[r.nilai]) || "neutral"}>
                        {r.nilai ?? "belum dinilai"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-ink-muted">Tanpa rekaman.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Bagian>
  );
}

// ── Penilaian, pemutihan, libur ────────────────────────────────────────────

function PenilaianBagian({ o }: { o: OrangMaahir }) {
  return (
    <Bagian judul="Penilaian bulanan" keterangan="Skor kosong = belum dinilai, bukan nol.">
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH>Bulan</TH>
              <TH>Bacaan</TH>
              <TH>Hafalan</TH>
              <TH>Penilai</TH>
            </TR>
          </THead>
          <TBody>
            {o.penilaian!.map((p) => (
              <TR key={p.id}>
                <TD>{p.year_month ?? <Kosong />}</TD>
                <TD className="tabular-nums">{p.skor_bacaan ?? <Kosong />}</TD>
                <TD className="tabular-nums">{p.skor_hafalan ?? <Kosong />}</TD>
                <TD className="text-ink-muted">{p.assessor_role?.replace(/_/g, " ") ?? <Kosong />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </Bagian>
  );
}

function PemutihanBagian({ o }: { o: OrangMaahir }) {
  if (o.pemutihan.length === 0) return null;
  return (
    <Bagian
      judul={`Pemutihan (${o.pemutihan.length})`}
      keterangan="Bulan yang diputihkan dihitung hadir penuh di rekap Maahir."
    >
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH>Bulan</TH>
              <TH>Alasan</TH>
              <TH>Oleh</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {o.pemutihan.map((p) => (
              <TR key={p.id}>
                <TD className="whitespace-nowrap">
                  {p.month ?? <Kosong />}
                  {p.tanggal && <span className="block text-xs text-ink-muted">{tanggalPendek(p.tanggal)}</span>}
                </TD>
                <TD className="max-w-[18rem] text-xs">{p.alasan ?? <Kosong />}</TD>
                <TD className="text-ink-muted">{p.dibuat_oleh ?? <Kosong />}</TD>
                <TD>
                  {p.dibatalkan_pada ? (
                    <Badge tone="neutral">Dibatalkan {waktuWib(p.dibatalkan_pada)}</Badge>
                  ) : (
                    <Badge tone="success">Berlaku</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </Bagian>
  );
}

function LiburBagian({ o }: { o: OrangMaahir }) {
  if (o.libur.length === 0) return null;
  return (
    <details className="group space-y-3">
      <summary className="cursor-pointer text-[15px] font-semibold">
        Libur kelas ({o.libur.length})
      </summary>
      <TableWrap className="mt-3">
        <Table>
          <THead>
            <TR>
              <TH>Tanggal</TH>
              <TH>Program-kelas</TH>
              <TH>Keterangan</TH>
            </TR>
          </THead>
          <TBody>
            {o.libur.map((l) => (
              <TR key={l.id}>
                <TD className="whitespace-nowrap">
                  {tanggalPendek(l.mulai)}
                  {l.selesai && l.selesai !== l.mulai && <> – {tanggalPendek(l.selesai)}</>}
                </TD>
                <TD>{l.programKelasNama ?? <Kosong />}</TD>
                <TD className="text-xs text-ink-muted">{l.keterangan ?? <Kosong />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </details>
  );
}
