/**
 * Data untuk `/[program]/inspeksi`.
 *
 * `penilaian-pedagogis` ditarik untuk SELURUH HITS sekaligus (418 baris, 7 Sep
 * 2026), jadi penyempitan ke satu program terjadi DI SINI — persis seperti tab
 * Matrix dan halaman Disiplin: batch yang dipin pada program → halaqah di batch
 * itu → `pengajar_id` yang mengampunya. Menyaring dengan cara lain (nama, tebak
 * dari daftar pengajar) akan membocorkan kelompok milik koordinator lain.
 *
 * Semua SQL-nya milik `lib/maahir/entities.ts`; modul ini hanya merangkai
 * bacaan, memilih bulan, dan menerjemahkan kegagalan jadi keadaan bernama.
 * Setiap sebab "tidak ada angka" punya keadaan sendiri, karena "belum dipin",
 * "scope ditolak", "belum ditarik" dan "cermin kosong" adalah empat kalimat yang
 * berbeda dan tidak satu pun di antaranya adalah nol.
 */
import {
  entityLastSync,
  isEntityForbidden,
  readHitsHalaqah,
  readHitsPengajar,
  readIndikatorStandar,
  readKelompokPengajar,
  readPenilaianPedagogis,
  readTeguran,
  type MaahirTeguran,
} from "@/lib/maahir/entities";
import { maahirHitsBatchIds } from "@/lib/programs/nav";
import { buildInspeksiView, bulanTersedia, resolveBulan, type InspeksiView } from "./view-model";

export type InspeksiData =
  | { state: "tanpa-pin" }
  | { state: "scope-ditolak" }
  | { state: "belum-ditarik" }
  | { state: "mirror-kosong"; batchIds: string[] }
  | {
      state: "siap";
      view: InspeksiView;
      /** Bulan yang dirender — selalu salah satu dari `pilihanBulan`. */
      bulan: string;
      /** Bulan yang benar-benar ada di cermin, terbaru dulu. Tidak dikarang dari kalender. */
      pilihanBulan: string[];
      /** Kapan `penilaian-pedagogis` terakhir ditarik. */
      ditarikPada: Date | null;
      /** `indikator-standar` belum tersinkron → tidak ada ambang, jadi tidak ada tanda merah. */
      rubrikKosong: boolean;
      /** `hits/teguran` belum pernah ditarik → kolom teguran disembunyikan, bukan diisi 0. */
      teguranAktif: boolean;
    };

/**
 * Entitas yang, bila scope-nya ditolak (403 `forbidden_scope`), membuat layar
 * ini mustahil dirender. Diperiksa terpisah dari sync supaya masalah izin tidak
 * pernah dilaporkan sebagai "belum ditarik".
 */
const ENTITAS_WAJIB = ["penilaian-pedagogis", "hits/pengajar", "hits/halaqah"] as const;

export async function loadInspeksi(
  config: unknown,
  bulanParam: string | undefined,
): Promise<InspeksiData> {
  const batchIds = maahirHitsBatchIds(config);
  if (batchIds.length === 0) return { state: "tanpa-pin" };

  const [halaqah, pengajar, kelompok, penilaian, indikator, ditarikPada, teguranSync, ditolak] =
    await Promise.all([
      readHitsHalaqah(batchIds),
      readHitsPengajar(),
      readKelompokPengajar(),
      readPenilaianPedagogis(),
      readIndikatorStandar(),
      entityLastSync("penilaian-pedagogis"),
      entityLastSync("hits/teguran"),
      Promise.all(ENTITAS_WAJIB.map((e) => isEntityForbidden(e))),
    ]);

  if (ditolak.some(Boolean)) return { state: "scope-ditolak" };
  if (ditarikPada == null || penilaian.length === 0) return { state: "belum-ditarik" };
  if (halaqah.length === 0 || pengajar.length === 0) return { state: "mirror-kosong", batchIds };

  const pilihanBulan = bulanTersedia(penilaian);
  const bulan = resolveBulan(bulanParam, pilihanBulan);
  // Baris ada tapi tidak satu pun ber-`year_month` yang bisa dibaca: tidak ada
  // bulan yang jujur bisa ditawarkan, jadi diperlakukan sama dengan belum ditarik.
  if (bulan == null) return { state: "belum-ditarik" };

  // Teguran hanya dibaca kalau cerminnya memang pernah ditarik; kalau tidak,
  // kolomnya akan menampilkan 0 untuk semua orang — nol palsu.
  const pengajarIds = [
    ...new Set(halaqah.map((h) => h.pengajar_id).filter((v): v is string => !!v)),
  ];
  const teguran: MaahirTeguran[] | null =
    teguranSync != null && pengajarIds.length > 0 ? await readTeguran(pengajarIds) : null;

  return {
    state: "siap",
    view: buildInspeksiView({
      bulan,
      pengajar,
      kelompok,
      halaqah,
      penilaian,
      indikator,
      teguran,
    }),
    bulan,
    pilihanBulan,
    ditarikPada,
    rubrikKosong: indikator.length === 0,
    teguranAktif: teguran != null,
  };
}
