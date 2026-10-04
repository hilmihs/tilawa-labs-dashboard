/**
 * Data untuk `/[program]/peserta/[orang]` — semua yang Maahir tahu tentang satu
 * orang, dalam satu kali muat.
 *
 * Dua sumber, dan batasnya sama dengan layar Maahir lain:
 *
 * - **Angka** (persen hadir, level SP, capaian setoran) disalin dari
 *   `maahir_rekap` — baris milik `anggotaId` orang ini di tiap tarikan rekap.
 * - **Riwayat** (tiap presensi, tiap setoran, tiap rekaman, tiap pemutihan)
 *   dari `maahir_sync`, disaring ke id orang ini.
 *
 * Rekap dicocokkan lewat `anggotaId`, bukan nama: satu orang bisa punya
 * beberapa enrolmen, dan nama bukan kunci.
 */
import {
  readAnggota,
  readKehadiranAnggota,
  readKelas,
  readLibur,
  readMusyrif,
  readPemutihan,
  readPenilaianPeserta,
  readPertemuan,
  readPeserta,
  readProgramKelas,
  readRekaman,
  readSetoranPeserta,
  type MaahirAnggota,
  type MaahirPenilaianPesertaEntity,
  type MaahirPemutihanEntity,
  type MaahirPeserta,
  type MaahirProgramKelas,
} from "@/lib/maahir/entities";
import { periodLabel, readKehadiran, readLaporanMaahir, readSp } from "@/lib/maahir/rekap";
import { rekapMonths } from "@/lib/integrations/maahir/rekap-routes";
import type {
  MaahirAnggotaKelas,
  MaahirPertemuan,
  MaahirSetoranPeserta,
  MaahirSpRow,
} from "@/lib/maahir/types";
import {
  buildLibur,
  buildRiwayatKehadiran,
  buildSetoran,
  resolveOrang,
  urutPemutihan,
  type LiburBaris,
  type RiwayatKehadiranBaris,
  type SetoranBaris,
} from "./view-model";

export type Keanggotaan = {
  anggota: MaahirAnggota;
  programKelas: MaahirProgramKelas | null;
};

/** Satu kelas di satu tarikan `rekap/kehadiran` yang memuat orang ini. */
export type RekapKehadiranKelas = {
  kelasName: string;
  pertemuan: MaahirPertemuan[];
  baris: MaahirAnggotaKelas;
};

export type RekapKehadiranBulan = {
  bulan: string;
  periode: string | null;
  fetchedAt: Date;
  kelas: RekapKehadiranKelas[];
};

export type RekapSetoranBulan = {
  bulan: string;
  periode: string | null;
  baris: MaahirSetoranPeserta[];
};

export type OrangMaahir = {
  jenis: "peserta" | "anggota";
  key: string;
  nama: string;
  gender: string | null;
  /** `peserta.active`; null pada enrolmen lepas = tidak diketahui. */
  aktif: boolean | null;
  kelasNama: string | null;
  musyrifNama: string | null;
  keanggotaan: Keanggotaan[];
  /** rekap/sp kumulatif — null = belum ditarik; [] = ditarik, orang ini tak ada di daftar. */
  sp: { rows: MaahirSpRow[]; mulai: string; cutoff: string; fetchedAt: Date } | null;
  kehadiranBulanan: RekapKehadiranBulan[];
  setoranBulanan: RekapSetoranBulan[];
  riwayat: RiwayatKehadiranBaris[];
  /** null = orang ini bukan `peserta` (setoran hanya milik peserta). */
  setoran: SetoranBaris[] | null;
  penilaian: MaahirPenilaianPesertaEntity[] | null;
  pemutihan: MaahirPemutihanEntity[];
  libur: LiburBaris[];
};

export type OrangMaahirHasil =
  | { state: "siap"; orang: OrangMaahir }
  | { state: "alihkan"; pesertaId: string }
  | { state: "tidak-ada" };

export async function loadOrangMaahir(key: string): Promise<OrangMaahirHasil> {
  const [peserta, anggota] = await Promise.all([readPeserta(), readAnggota()]);
  const r = resolveOrang(key, peserta, anggota);
  if (r.jenis === "tidak-ada") return { state: "tidak-ada" };
  if (r.jenis === "alihkan") return { state: "alihkan", pesertaId: r.pesertaId };

  const p: MaahirPeserta | null = r.jenis === "peserta" ? r.peserta : null;
  const enrolmen = r.jenis === "peserta" ? r.anggota : [r.anggota];
  const anggotaIds = enrolmen.map((a) => a.id);
  const pesertaIds = p ? [p.id] : [];
  const programKelasIds = [
    ...new Set(enrolmen.map((a) => a.program_kelas_id).filter((x): x is string => !!x)),
  ];

  const [bulanBerjalan, bulanLalu] = rekapMonths();
  const bulanList = [bulanBerjalan, bulanLalu];

  const [
    programKelas,
    kelas,
    musyrif,
    kehadiran,
    setoranRows,
    penilaian,
    pemutihan,
    libur,
    spRead,
    kehadiranReads,
    laporanReads,
  ] = await Promise.all([
    readProgramKelas(),
    readKelas(),
    readMusyrif(),
    readKehadiranAnggota(anggotaIds),
    p ? readSetoranPeserta(pesertaIds) : Promise.resolve(null),
    p ? readPenilaianPeserta(pesertaIds) : Promise.resolve(null),
    readPemutihan(anggotaIds),
    readLibur(programKelasIds),
    readSp(),
    Promise.all(bulanList.map((b) => readKehadiran(b))),
    Promise.all(bulanList.map((b) => readLaporanMaahir(b))),
  ]);

  const pertemuanIds = [
    ...new Set(kehadiran.map((k) => k.pertemuan_id).filter((x): x is string => !!x)),
  ];
  const [pertemuan, rekaman] = await Promise.all([
    readPertemuan(pertemuanIds),
    setoranRows ? readRekaman(setoranRows.map((s) => s.id)) : Promise.resolve([]),
  ]);

  const idSet = new Set(anggotaIds);
  const pkById = new Map(programKelas.map((pk) => [pk.id, pk]));
  const kelasRow = p?.kelas_id ? kelas.find((k) => k.id === p.kelas_id) : undefined;
  const musyrifRow = kelasRow?.musyrif_id
    ? musyrif.find((m) => m.id === kelasRow.musyrif_id)
    : undefined;

  const kehadiranBulanan: RekapKehadiranBulan[] = [];
  bulanList.forEach((bulan, i) => {
    const read = kehadiranReads[i];
    if (!read) return;
    const kelasList: RekapKehadiranKelas[] = [];
    for (const k of read.payload ?? []) {
      for (const a of k.anggota ?? []) {
        if (idSet.has(a.anggotaId)) {
          kelasList.push({ kelasName: k.kelasName, pertemuan: k.pertemuan ?? [], baris: a });
        }
      }
    }
    kehadiranBulanan.push({
      bulan,
      periode: periodLabel(read.meta),
      fetchedAt: read.fetchedAt,
      kelas: kelasList,
    });
  });

  const setoranBulanan: RekapSetoranBulan[] = [];
  bulanList.forEach((bulan, i) => {
    const read = laporanReads[i];
    const list = read?.payload?.takhassus?.setoran?.peserta;
    if (!read || !Array.isArray(list)) return;
    setoranBulanan.push({
      bulan,
      periode: periodLabel(read.meta),
      baris: list.filter((s) => idSet.has(s.anggotaId)),
    });
  });

  return {
    state: "siap",
    orang: {
      jenis: p ? "peserta" : "anggota",
      key,
      nama: p?.name ?? enrolmen[0]?.name ?? "—",
      gender: p?.gender ?? null,
      aktif: p ? (p.active ?? null) : null,
      kelasNama: kelasRow?.name ?? null,
      musyrifNama: musyrifRow?.name ?? null,
      keanggotaan: enrolmen
        .map((a) => ({
          anggota: a,
          programKelas: a.program_kelas_id ? (pkById.get(a.program_kelas_id) ?? null) : null,
        }))
        .sort((a, b) =>
          (a.programKelas?.name ?? "").localeCompare(b.programKelas?.name ?? "", "id"),
        ),
      sp: spRead
        ? {
            rows: (spRead.payload?.list ?? []).filter((s) => idSet.has(s.anggotaId)),
            mulai: spRead.payload?.mulai ?? "",
            cutoff: spRead.payload?.cutoff ?? "",
            fetchedAt: spRead.fetchedAt,
          }
        : null,
      kehadiranBulanan,
      setoranBulanan,
      riwayat: buildRiwayatKehadiran(kehadiran, pertemuan, programKelas),
      setoran: setoranRows ? buildSetoran(setoranRows, rekaman, musyrif) : null,
      penilaian: penilaian
        ? [...penilaian].sort((a, b) => (b.year_month ?? "").localeCompare(a.year_month ?? ""))
        : null,
      pemutihan: urutPemutihan(pemutihan),
      libur: buildLibur(libur, programKelas),
    },
  };
}
