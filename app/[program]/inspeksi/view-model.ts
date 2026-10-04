/**
 * `penilaian-pedagogis` → layar "Inspeksi" (penilaian bulanan oleh ketua
 * kelompok). Modul MURNI: tidak menyentuh DB, tidak mengimpor `next/*`, dan
 * tanggal masuk-keluar sebagai string apa adanya.
 *
 * Empat aturan yang membentuk modul ini — semuanya cara layar ini bisa berbohong
 * kalau tidak dijaga:
 *
 * 1. **Tidak ada angka yang diturunkan ulang.** `docs/API-PUBLIC.md` §9 melarang
 *    menghitung ulang angka rekap dari entitas mentah, dan `rekap/matrix-guru`
 *    (tempat `rata_rata_pedagogis` tinggal) adalah snapshot upstream, bukan
 *    hitungan yang boleh ditiru. Jadi di sini TIDAK ADA rata-rata, TIDAK ADA
 *    peringkat, dan TIDAK ADA persentase kelengkapan. Yang ada hanya kelima skor
 *    mentah apa adanya dan CACAHAN baris ("14 dari 46 pengajar sudah dinilai") —
 *    itu panjang daftar, bukan metrik bisnis, dan persis yang ditampilkan
 *    upstream sendiri.
 * 2. **`null` bukan 0.** Pada 418 baris cermin (7 Sep 2026) `skor_kepatuhan_sop`
 *    terisi 120 baris (~29%), `skor_metode_pengajaran` 192 (~46%), tiga sisanya
 *    ~82%. Hampir separuh sel kosong. Merender 0 di sana menuduh pengajarnya
 *    gagal total, jadi setiap sel kosong tetap `null` sampai ke `formatSkor`,
 *    yang mengembalikan tanda pisah.
 * 3. **SOP BUKAN komponen pedagogis.** `skor_kepatuhan_sop` memang diisi pada
 *    formulir yang sama, tapi upstream mengarsipkannya di bawah **soft skill**
 *    pada `matrix-rekap` (`indikator-standar.kepatuhan_sop.kategori =
 *    'soft_skill'`), sehingga `rata_rata_pedagogis` hanya mencakup empat kolom
 *    lainnya. Karena itu `KOLOM_SOP` dipisah dari `KOLOM_PEDAGOGIS` di tingkat
 *    tipe, bukan sekadar diberi jarak di tabel: apa pun yang mengulang daftar
 *    pedagogis tidak akan pernah kejatuhan SOP.
 * 4. **Satu-satunya perbandingan yang boleh** adalah "di bawah standar", karena
 *    ambangnya datang dari tabel rubrik `indikator-standar` itu sendiri
 *    (`standar = 4` untuk kelima kode ini), bukan dari hitungan kita.
 *
 * `matrix_exclude` adalah opt-out milik upstream (5 dari 183 pengajar): mereka
 * tetap ditampilkan, tapi tidak pernah masuk cacahan "belum dinilai" — kalau
 * tidak, layar ini akan menuntut penilaian yang memang tidak diminta.
 */
import type {
  MaahirGender,
  MaahirHitsHalaqah,
  MaahirHitsPengajar,
  MaahirIndikatorStandar,
  MaahirKelompokPengajar,
  MaahirPenilaianPedagogis,
  MaahirTeguran,
} from "@/lib/maahir/entities";

/** Kolom skor pada `penilaian-pedagogis`, seperti nama fieldnya di cermin. */
export type SkorField =
  | "skor_kepatuhan_silabus"
  | "skor_manajemen_halaqah"
  | "skor_evaluasi_penguasaan"
  | "skor_metode_pengajaran"
  | "skor_kepatuhan_sop";

type KolomDef = {
  /** `indikator-standar.kode` — jembatan ke rubrik. */
  kode: string;
  field: SkorField;
  /** Dipakai hanya bila `indikator-standar` belum tersinkron. */
  labelBawaan: string;
};

/**
 * Empat kolom pedagogis, urut seperti layar upstream (SILABUS / MANAJEMEN
 * HALAQAH / EVALUASI), dengan `metode_pengajaran` di belakang: ia paling jarang
 * terisi (~46%) sehingga ekor tabel yang banyak kosong lebih jujur dibaca
 * daripada lubang di tengah.
 *
 * SOP TIDAK ada di daftar ini — lihat catatan 3 di kepala berkas.
 */
export const KOLOM_PEDAGOGIS: readonly KolomDef[] = [
  { kode: "kepatuhan_silabus", field: "skor_kepatuhan_silabus", labelBawaan: "Kepatuhan Silabus" },
  { kode: "manajemen_halaqah", field: "skor_manajemen_halaqah", labelBawaan: "Manajemen Halaqah" },
  {
    kode: "evaluasi_penguasaan",
    field: "skor_evaluasi_penguasaan",
    labelBawaan: "Evaluasi & Penguasaan",
  },
  {
    kode: "metode_pengajaran",
    field: "skor_metode_pengajaran",
    labelBawaan: "Metode Pengajaran Modul",
  },
] as const;

/** Kolom kelima, sengaja berdiri sendiri: upstream mengarsipkannya di soft skill. */
export const KOLOM_SOP: KolomDef = {
  kode: "kepatuhan_sop",
  field: "skor_kepatuhan_sop",
  labelBawaan: "Kepatuhan SOP Teknis",
};

export type InspeksiIndikator = {
  kode: string;
  field: SkorField;
  /** `indikator-standar.nama` bila rubriknya tersinkron, kalau tidak label bawaan. */
  label: string;
  /** `kategori` upstream apa adanya: `pedagogis` untuk empat kolom, `soft_skill` untuk SOP. */
  kategori: string | null;
  /** Ambang dari rubrik. Null = rubrik belum ditarik → tidak ada tanda "di bawah standar". */
  standar: number | null;
};

/** Legenda rubrik untuk kaki tabel. `sop` sengaja bukan anggota `pedagogis`. */
export type InspeksiLegenda = {
  pedagogis: InspeksiIndikator[];
  sop: InspeksiIndikator;
};

/** Satu sel skor: angka mentah + ambang rubriknya, tanpa turunan apa pun. */
export type InspeksiSel = {
  kode: string;
  label: string;
  /** Apa adanya dari cermin. `null` = belum diisi, DILARANG dirender sebagai 0. */
  nilai: number | null;
  standar: number | null;
  /** `nilai < standar`. Selalu false saat `nilai` atau `standar` null. */
  dibawahStandar: boolean;
};

export type InspeksiBaris = {
  pengajarId: string;
  nama: string;
  gender: MaahirGender | null;
  /** true = ketua kelompok, yaitu orang yang mengisi formulir ini untuk yang lain. */
  isKetua: boolean;
  /** Opt-out upstream: ditampilkan, tapi tidak pernah ditagih penilaian. */
  dikecualikan: boolean;
  /** false = sudah dinonaktifkan di Maahir tapi masih memegang halaqah batch ini. */
  active: boolean;
  /** Halaqah yang diampu DI BATCH PROGRAM INI. */
  halaqahDiBatch: number;
  /** Empat kolom pedagogis, urut `KOLOM_PEDAGOGIS`. */
  pedagogis: InspeksiSel[];
  /** Kolom SOP, terpisah. */
  sop: InspeksiSel;
  /** true = tidak ada baris `penilaian-pedagogis` sama sekali untuk bulan ini. */
  belumDinilai: boolean;
  /** Baris penilaiannya ada, tapi kelima skornya kosong — "terbuka, belum diisi". */
  barisKosong: boolean;
  /** `updated_at` apa adanya (string ISO), tidak pernah lewat `new Date()`. */
  diperbaruiPada: string | null;
  /** Cacahan teguran bulan ini. `null` = cermin teguran tidak ikut dibaca. */
  teguranBulan: number | null;
};

export type InspeksiKelompok = {
  /** `kelompok_id` upstream; string kosong untuk yang belum berkelompok. */
  id: string;
  nama: string;
  gender: MaahirGender | null;
  rows: InspeksiBaris[];
  /** Punya baris penilaian bulan ini (di luar yang `matrix_exclude`). */
  dinilai: number;
  /** Belum punya baris (di luar yang `matrix_exclude`). */
  belumDinilai: number;
  /** Pengajar `matrix_exclude` — dihitung terpisah, tidak menagih siapa pun. */
  dikecualikan: number;
};

export type InspeksiRingkas = {
  pengajar: number;
  /** Penyebut kalimat kepala: pengajar yang memang ditagih penilaian. */
  ditagih: number;
  dinilai: number;
  belumDinilai: number;
  dikecualikan: number;
  kelompok: number;
  /**
   * `pengajar_id` yang memegang halaqah batch ini tapi tidak punya baris di
   * `hits/pengajar`. Bukan nol nilai — mereka tidak bisa ditampilkan sama sekali.
   */
  tanpaProfil: number;
};

export type InspeksiView = {
  bulan: string;
  kelompok: InspeksiKelompok[];
  ringkas: InspeksiRingkas;
  legenda: InspeksiLegenda;
};

export type BuildInspeksiInput = {
  bulan: string;
  pengajar: MaahirHitsPengajar[];
  kelompok: MaahirKelompokPengajar[];
  /** Halaqah batch program ini — dipakai untuk menyaring pengajar, seperti tab Matrix. */
  halaqah: MaahirHitsHalaqah[];
  penilaian: MaahirPenilaianPedagogis[];
  indikator: MaahirIndikatorStandar[];
  /** Opsional: kalau cermin teguran belum ditarik, kolomnya tidak boleh berisi 0. */
  teguran?: MaahirTeguran[] | null;
};

const TANPA_KELOMPOK = "";

/** Halaqah batch ini per `pengajar_id`. Kunci join yang sama dengan tab Matrix. */
function halaqahPerPengajar(halaqah: MaahirHitsHalaqah[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const h of halaqah) {
    if (!h.pengajar_id) continue;
    n.set(h.pengajar_id, (n.get(h.pengajar_id) ?? 0) + 1);
  }
  return n;
}

/** Rubrik per kode, untuk mengambil `nama` dan `standar` upstream. */
function rubrik(indikator: MaahirIndikatorStandar[]): Map<string, MaahirIndikatorStandar> {
  return new Map(indikator.map((i) => [i.kode, i]));
}

function indikatorDari(def: KolomDef, ref: Map<string, MaahirIndikatorStandar>): InspeksiIndikator {
  const r = ref.get(def.kode);
  return {
    kode: def.kode,
    field: def.field,
    label: r?.nama ?? def.labelBawaan,
    kategori: r?.kategori ?? null,
    standar: typeof r?.standar === "number" && Number.isFinite(r.standar) ? r.standar : null,
  };
}

/** Angka atau `null` — apa pun yang bukan number berhingga tidak boleh jadi skor. */
function angka(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function sel(
  ind: InspeksiIndikator,
  row: MaahirPenilaianPedagogis | undefined,
): InspeksiSel {
  const nilai = row ? angka(row[ind.field]) : null;
  return {
    kode: ind.kode,
    label: ind.label,
    nilai,
    // Ambangnya milik rubrik, bukan hitungan kita — itu sebabnya perbandingan
    // ini satu-satunya yang diizinkan di layar ini.
    dibawahStandar: nilai != null && ind.standar != null && nilai < ind.standar,
    standar: ind.standar,
  };
}

/**
 * Bulan yang BENAR-BENAR ada di cermin, terbaru dulu.
 *
 * Sengaja tidak diturunkan dari kalender: cermin 7 Sep 2026 memuat 2026-06 s.d.
 * 2026-09, dan menawarkan bulan yang tidak pernah ditarik hanya akan
 * menghasilkan tabel kosong yang tidak bisa dijelaskan.
 */
export function bulanTersedia(penilaian: MaahirPenilaianPedagogis[]): string[] {
  const ada = new Set<string>();
  for (const p of penilaian) {
    if (typeof p.year_month === "string" && /^\d{4}-\d{2}$/.test(p.year_month)) ada.add(p.year_month);
  }
  return [...ada].sort().reverse();
}

/** Bulan yang diminta hanya dipakai kalau memang tersimpan; kalau tidak, yang terbaru. */
export function resolveBulan(requested: string | undefined, tersedia: string[]): string | null {
  if (requested && tersedia.includes(requested)) return requested;
  return tersedia[0] ?? null;
}

export function buildInspeksiView(input: BuildInspeksiInput): InspeksiView {
  const ref = rubrik(input.indikator);
  const legenda: InspeksiLegenda = {
    pedagogis: KOLOM_PEDAGOGIS.map((d) => indikatorDari(d, ref)),
    sop: indikatorDari(KOLOM_SOP, ref),
  };

  const halaqah = halaqahPerPengajar(input.halaqah);

  // Satu baris penilaian per pengajar per bulan. Kalau upstream sampai mengirim
  // dua, yang terakhir menang — bukan dijumlahkan (menjumlahkan skor akan
  // menciptakan angka yang tidak pernah ada di mana pun).
  const skorBulanIni = new Map<string, MaahirPenilaianPedagogis>();
  for (const p of input.penilaian) {
    if (p.year_month !== input.bulan || !p.pengajar_id) continue;
    skorBulanIni.set(p.pengajar_id, p);
  }

  const teguranBulanIni = input.teguran ? new Map<string, number>() : null;
  if (teguranBulanIni && input.teguran) {
    for (const t of input.teguran) {
      if (t.year_month !== input.bulan || !t.pengajar_id) continue;
      teguranBulanIni.set(t.pengajar_id, (teguranBulanIni.get(t.pengajar_id) ?? 0) + 1);
    }
  }

  const namaKelompok = new Map(input.kelompok.map((k) => [k.id, k]));
  const grup = new Map<string, InspeksiKelompok>();

  let dikenal = 0;
  for (const g of input.pengajar) {
    const jumlahHalaqah = halaqah.get(g.id);
    if (jumlahHalaqah === undefined) continue; // bukan pengajar batch program ini
    dikenal += 1;

    const row = skorBulanIni.get(g.id);
    const pedagogis = legenda.pedagogis.map((ind) => sel(ind, row));
    const sop = sel(legenda.sop, row);
    const baris: InspeksiBaris = {
      pengajarId: g.id,
      nama: g.name,
      gender: g.gender ?? null,
      isKetua: g.is_ketua === true,
      dikecualikan: g.matrix_exclude === true,
      active: g.active !== false,
      halaqahDiBatch: jumlahHalaqah,
      pedagogis,
      sop,
      belumDinilai: row == null,
      barisKosong:
        row != null && pedagogis.every((s) => s.nilai == null) && sop.nilai == null,
      diperbaruiPada: row?.updated_at ?? null,
      teguranBulan: teguranBulanIni ? (teguranBulanIni.get(g.id) ?? 0) : null,
    };

    const kid = g.kelompok_id ?? TANPA_KELOMPOK;
    let bucket = grup.get(kid);
    if (!bucket) {
      const k = kid === TANPA_KELOMPOK ? undefined : namaKelompok.get(kid);
      bucket = {
        id: kid,
        // Kelompok yang belum tersinkron tetap tampil dengan idnya, bukan
        // dilebur ke "tanpa kelompok" — dua sebab yang berbeda.
        nama:
          kid === TANPA_KELOMPOK
            ? "Belum masuk kelompok"
            : (k?.name ?? `Kelompok tidak dikenal (${kid})`),
        gender: k?.gender ?? null,
        rows: [],
        dinilai: 0,
        belumDinilai: 0,
        dikecualikan: 0,
      };
      grup.set(kid, bucket);
    }
    bucket.rows.push(baris);
    if (baris.dikecualikan) bucket.dikecualikan += 1;
    else if (baris.belumDinilai) bucket.belumDinilai += 1;
    else bucket.dinilai += 1;
  }

  const kelompok = [...grup.values()].sort((a, b) => {
    // "Belum masuk kelompok" selalu terakhir; sisanya urut nama secara natural
    // supaya "Kelompok 2" mendahului "Kelompok 10".
    if ((a.id === TANPA_KELOMPOK) !== (b.id === TANPA_KELOMPOK)) {
      return a.id === TANPA_KELOMPOK ? 1 : -1;
    }
    return a.nama.localeCompare(b.nama, "id", { numeric: true });
  });
  for (const k of kelompok) {
    k.rows.sort((a, b) => a.nama.localeCompare(b.nama, "id", { numeric: true }));
  }

  const dinilai = kelompok.reduce((n, k) => n + k.dinilai, 0);
  const belumDinilai = kelompok.reduce((n, k) => n + k.belumDinilai, 0);
  const dikecualikan = kelompok.reduce((n, k) => n + k.dikecualikan, 0);

  return {
    bulan: input.bulan,
    kelompok,
    ringkas: {
      pengajar: dinilai + belumDinilai + dikecualikan,
      ditagih: dinilai + belumDinilai,
      dinilai,
      belumDinilai,
      dikecualikan,
      kelompok: kelompok.length,
      tanpaProfil: halaqah.size - dikenal,
    },
    legenda,
  };
}

// ── Format ──────────────────────────────────────────────────────────────────

/**
 * Skor 0–4 dengan dua desimal, seperti cetakan upstream ("4.00", "3.50").
 * `null` jadi tanda pisah — TIDAK PERNAH "0.00". Sama perilakunya dengan
 * `formatSkor` di app/[program]/pengajar/view-model.ts, hanya presisinya beda.
 */
export function formatSkor(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "—";
}

const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** "Agustus 2026" untuk pemilih bulan. Bentuk lain dikembalikan apa adanya. */
export function labelBulan(bulan: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(bulan);
  if (!m) return bulan;
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${BULAN_PANJANG[idx]} ${m[1]}` : bulan;
}

/**
 * "31 Agu 2026" dari `updated_at`. Dipotong dari string, bukan lewat
 * `new Date(...)` yang menggeser tanggal untuk zona di barat UTC.
 */
export function tanggalSingkat(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return null;
  return `${Number(m[3])} ${BULAN_PENDEK[idx]} ${m[1]}`;
}
