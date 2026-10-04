/**
 * Entitas mentah `maahir_sync` (peserta, anggota, kelas, musyrif, program-kelas)
 * → baris daftar orang siap render untuk `/maahir/peserta`.
 *
 * Modul MURNI: tanpa DB, tanpa `next/*`. Semua bacaannya sudah dikerjakan
 * `maahir-queries.ts`; di sini hanya penggabungan, penamaan, dan pengurutan.
 *
 * Empat hal yang dijaga modul ini, semuanya cara layar ini bisa berbohong:
 *
 * 1. **Tidak ada angka turunan.** `docs/API-PUBLIC.md` §9 melarang menurunkan
 *    ulang angka rekap dari entitas mentah — tujuh aturan bisnis (sesi sakit
 *    yang keluar dari penyebut, pemutihan yang memaksa 100%, peserta yang masuk
 *    di tengah periode, dua definisi "bulan") tinggal di Maahir. Jadi di sini
 *    tidak ada persentase kehadiran, rata-rata, peringkat, atau skor. Yang ada
 *    hanya **cacah baris yang sedang dirender** — itu panjang daftar, bukan
 *    metrik. Angka kehadiran resmi tetap di `/[program]/kehadiran`.
 *
 * 2. **Daftar ini GABUNGAN, bukan join.** `anggota.peserta_id` null pada 147
 *    dari 227 baris cermin (diukur 8 Sep 2026), dan baris itu membawa `name`-nya
 *    sendiri. Jadi rosternya = orang yang ada sebagai `peserta` ∪ baris `anggota`
 *    yang tidak menunjuk siapa pun. Sisi kedua TIDAK boleh dibuang.
 *
 * 3. **Identitas tidak dikarang.** Untuk baris `anggota` tanpa `peserta_id`,
 *    satu baris enrolmen = satu baris tabel. Menggabungkan dua enrolmen bernama
 *    sama menjadi "satu orang" adalah klaim yang tidak dijamin data mana pun:
 *    nama bukan kunci, dan upstream sendiri tidak menautkannya. Cacah nama unik
 *    tetap dilaporkan, tapi sebagai cacah NAMA, bukan cacah orang.
 *
 * 4. **Kosong bukan nol, dan bukan "tidak".** `peserta.active` hanya ada di sisi
 *    peserta; untuk baris sisi anggota status aktifnya `null` = tidak diketahui,
 *    dan harus tercetak em dash — bukan "nonaktif". Begitu juga `mulai_tanggal`,
 *    yang null pada 201 dari 227 baris.
 *
 * Catatan tanggal: `mulai_tanggal` adalah `YYYY-MM-DD` polos dan diperlakukan
 * sebagai string dari ujung ke ujung — lewat `new Date()` ia dibaca sebagai
 * tengah malam UTC dan tercetak mundur sehari untuk siapa pun di barat UTC.
 */
import type {
  MaahirAnggota,
  MaahirKelas,
  MaahirOrang,
  MaahirPeserta,
  MaahirProgramKelas,
} from "@/lib/maahir/entities";

// ── Tanggal (string masuk, string keluar) ──────────────────────────────────

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** "2026-08-07" → "7 Agu 2026". Sengaja tanpa `Date` (lihat header). */
export function tanggalPendek(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return iso;
  return `${Number(m[3])} ${BULAN_PENDEK[idx]} ${m[1]}`;
}

/** "ikhwan" → "Ikhwan". Nilai yang belum dikenal tetap tampil apa adanya. */
export function labelGender(gender: string | null): string | null {
  if (!gender) return null;
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

// ── Bentuk baris ───────────────────────────────────────────────────────────

/**
 * Dari sisi mana baris ini datang. Dicetak di layar apa adanya: pembaca berhak
 * tahu bahwa "hanya enrolmen" bukan orang yang terdaftar di roster Maahir.
 */
export type MaahirRosterSumber = "peserta" | "anggota";

/** Peran dalam sebuah kelas-program. `null` = anggota biasa. */
export type MaahirPeran = "ketua" | "wakil";

/** Satu enrolmen ke satu program-kelas. */
export type MaahirKeanggotaan = {
  anggotaId: string;
  programKelasId: string | null;
  /** `null` = program-kelas-nya tidak ada di cermin — barisnya tetap tampil. */
  programKelasNama: string | null;
  peran: MaahirPeran | null;
  /** `YYYY-MM-DD` apa adanya; null pada mayoritas baris. */
  mulaiTanggal: string | null;
};

export type MaahirRosterBaris = {
  /** Kunci render. Sisi peserta = id peserta; sisi anggota = id baris anggota. */
  key: string;
  sumber: MaahirRosterSumber;
  nama: string;
  gender: string | null;
  /** Hanya sisi peserta punya kelas musyrif; sisi anggota selalu null. */
  kelasId: string | null;
  kelasNama: string | null;
  musyrifNama: string | null;
  /** `peserta.active`. `null` pada sisi anggota = TIDAK DIKETAHUI, bukan "tidak". */
  aktif: boolean | null;
  keanggotaan: MaahirKeanggotaan[];
  /** Peran tertinggi di antara keanggotaan: ketua > wakil > tanpa peran. */
  peran: MaahirPeran | null;
  /** `mulai_tanggal` paling awal yang terisi; null bila tak satu pun terisi. */
  mulaiTanggal: string | null;
};

/**
 * Cacah baris MENTAH yang sedang dirender. Bukan angka rekap: tidak ada
 * penyebut, tidak ada persen, dan angkanya tidak boleh diadu dengan tab
 * Kehadiran.
 */
export type MaahirRosterRingkas = {
  /** Orang yang ada sebagai baris `peserta`. */
  peserta: number;
  /** Baris `anggota` tanpa `peserta_id` — satu baris enrolmen, satu baris tabel. */
  anggotaLepas: number;
  /** Cacah NAMA berbeda di antara `anggotaLepas`. Bukan cacah orang. */
  namaLepas: number;
  /** Seluruh baris `anggota` yang dirender, kedua sisi digabung. */
  keanggotaan: number;
  /** Peserta yang tidak punya satu pun enrolmen. */
  pesertaTanpaKelasProgram: number;
  programKelas: number;
  kelas: number;
};

export type MaahirRosterView = {
  baris: MaahirRosterBaris[];
  ringkas: MaahirRosterRingkas;
  /** Program-kelas yang benar-benar dipakai baris di layar, untuk saringan. */
  programKelasOpsi: { id: string; nama: string }[];
  /** Nilai gender yang benar-benar muncul — termasuk yang belum dikenal. */
  genderOpsi: string[];
};

export type MaahirRosterSumberData = {
  peserta: MaahirPeserta[];
  anggota: MaahirAnggota[];
  kelas: Pick<MaahirKelas, "id" | "name" | "musyrif_id">[];
  musyrif: Pick<MaahirOrang, "id" | "name">[];
  programKelas: Pick<MaahirProgramKelas, "id" | "name">[];
};

// ── Penggabungan ───────────────────────────────────────────────────────────

/** Nama null selalu di belakang, apa pun arah urutannya. */
function bandingNama(a: string | null, b: string | null): number {
  if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1;
  return a.localeCompare(b, "id", { numeric: true });
}

/** ketua menang atas wakil; keduanya false → tanpa peran (null, bukan "anggota"). */
function peranBaris(a: Pick<MaahirAnggota, "is_ketua" | "is_wakil">): MaahirPeran | null {
  if (a.is_ketua === true) return "ketua";
  if (a.is_wakil === true) return "wakil";
  return null;
}

/** Tanggal terisi paling awal, atau `null` bila tak satu pun terisi — bukan "". */
function mulaiPalingAwal(rows: MaahirKeanggotaan[]): string | null {
  const ada = rows
    .map((k) => k.mulaiTanggal)
    .filter((t): t is string => typeof t === "string" && t !== "");
  return ada.length === 0 ? null : ada.reduce((a, b) => (a <= b ? a : b));
}

/** Peran tertinggi di seluruh enrolmen seseorang. */
function peranTertinggi(rows: MaahirKeanggotaan[]): MaahirPeran | null {
  if (rows.some((k) => k.peran === "ketua")) return "ketua";
  if (rows.some((k) => k.peran === "wakil")) return "wakil";
  return null;
}

export function buildMaahirRosterView(sumber: MaahirRosterSumberData): MaahirRosterView {
  const kelasById = new Map(sumber.kelas.map((k) => [k.id, k]));
  const musyrifById = new Map(sumber.musyrif.map((m) => [m.id, m]));
  const programKelasById = new Map(sumber.programKelas.map((pk) => [pk.id, pk]));

  const keanggotaanDari = (a: MaahirAnggota): MaahirKeanggotaan => ({
    anggotaId: a.id,
    programKelasId: a.program_kelas_id,
    programKelasNama: a.program_kelas_id
      ? (programKelasById.get(a.program_kelas_id)?.name ?? null)
      : null,
    peran: peranBaris(a),
    mulaiTanggal: a.mulai_tanggal,
  });

  // Sisi 1 — orang yang ada sebagai `peserta`; enrolmennya dikumpulkan padanya.
  const perPeserta = new Map<string, MaahirKeanggotaan[]>();
  // Sisi 2 — enrolmen yang tidak menunjuk siapa pun. Tetap satu baris per
  // enrolmen: menggabungkannya per nama akan mengarang identitas (lihat header).
  const lepas: MaahirAnggota[] = [];
  for (const a of sumber.anggota) {
    if (a.peserta_id == null) {
      lepas.push(a);
      continue;
    }
    const bucket = perPeserta.get(a.peserta_id);
    if (bucket) bucket.push(keanggotaanDari(a));
    else perPeserta.set(a.peserta_id, [keanggotaanDari(a)]);
  }

  const barisPeserta: MaahirRosterBaris[] = sumber.peserta.map((p) => {
    const kelas = p.kelas_id ? (kelasById.get(p.kelas_id) ?? null) : null;
    const musyrif = kelas?.musyrif_id ? (musyrifById.get(kelas.musyrif_id) ?? null) : null;
    const keanggotaan = (perPeserta.get(p.id) ?? []).sort((a, b) =>
      bandingNama(a.programKelasNama, b.programKelasNama) || a.anggotaId.localeCompare(b.anggotaId),
    );
    return {
      key: p.id,
      sumber: "peserta",
      nama: p.name,
      gender: p.gender ?? null,
      kelasId: p.kelas_id,
      kelasNama: kelas?.name ?? null,
      musyrifNama: musyrif?.name ?? null,
      aktif: p.active ?? null,
      keanggotaan,
      peran: peranTertinggi(keanggotaan),
      mulaiTanggal: mulaiPalingAwal(keanggotaan),
    };
  });

  const barisLepas: MaahirRosterBaris[] = lepas.map((a) => {
    const keanggotaan = [keanggotaanDari(a)];
    return {
      key: a.id,
      sumber: "anggota",
      nama: a.name,
      // Baris enrolmen tidak membawa gender; menebaknya dari gender
      // program-kelas akan mengarang atribut orang dari atribut kelas.
      gender: null,
      kelasId: null,
      kelasNama: null,
      musyrifNama: null,
      // Bukan `false`: enrolmen tidak menyimpan status aktif sama sekali.
      aktif: null,
      keanggotaan,
      peran: peranTertinggi(keanggotaan),
      mulaiTanggal: mulaiPalingAwal(keanggotaan),
    };
  });

  // Urutan: nama, lalu sisi peserta lebih dulu bila namanya kebetulan sama,
  // lalu kunci sebagai pemutus supaya stabil antar-render.
  const baris = [...barisPeserta, ...barisLepas].sort(
    (a, b) =>
      bandingNama(a.nama, b.nama) ||
      (a.sumber === b.sumber ? 0 : a.sumber === "peserta" ? -1 : 1) ||
      a.key.localeCompare(b.key),
  );

  const dipakai = new Set<string>();
  for (const r of baris) {
    for (const k of r.keanggotaan) if (k.programKelasId) dipakai.add(k.programKelasId);
  }
  const programKelasOpsi = [...dipakai]
    .map((id) => ({ id, nama: programKelasById.get(id)?.name ?? id }))
    .sort((a, b) => bandingNama(a.nama, b.nama));

  const genderOpsi = [
    ...new Set(baris.map((r) => r.gender).filter((g): g is string => g != null)),
  ].sort((a, b) => a.localeCompare(b, "id"));

  return {
    baris,
    ringkas: {
      peserta: barisPeserta.length,
      anggotaLepas: barisLepas.length,
      namaLepas: new Set(barisLepas.map((r) => r.nama)).size,
      keanggotaan: baris.reduce((n, r) => n + r.keanggotaan.length, 0),
      pesertaTanpaKelasProgram: barisPeserta.filter((r) => r.keanggotaan.length === 0).length,
      programKelas: programKelasOpsi.length,
      kelas: new Set(
        barisPeserta.map((r) => r.kelasId).filter((id): id is string => id != null),
      ).size,
    },
    programKelasOpsi,
    genderOpsi,
  };
}

// ── Saringan klien ─────────────────────────────────────────────────────────

/**
 * `"aktif"`/`"nonaktif"` hanya menyaring baris yang statusnya DIKETAHUI. Baris
 * sisi anggota (aktif `null`) tidak ikut di kedua saringan itu — memasukkannya
 * ke "nonaktif" berarti membaca "tidak tahu" sebagai "tidak".
 */
export type MaahirRosterFilter = {
  /** `"semua"` atau id program-kelas. */
  programKelas: string;
  /** `"semua"` atau salah satu nilai gender yang muncul. */
  gender: string;
  status: "semua" | "aktif" | "nonaktif";
};

export const MAAHIR_ROSTER_FILTER_AWAL: MaahirRosterFilter = {
  programKelas: "semua",
  gender: "semua",
  status: "semua",
};

/** Menyaring tampilan saja — tidak ada angka yang dihitung ulang. */
export function filterRoster(
  rows: MaahirRosterBaris[],
  f: MaahirRosterFilter,
): MaahirRosterBaris[] {
  return rows.filter((r) => {
    if (f.programKelas !== "semua" && !r.keanggotaan.some((k) => k.programKelasId === f.programKelas))
      return false;
    if (f.gender !== "semua" && r.gender !== f.gender) return false;
    if (f.status === "aktif" && r.aktif !== true) return false;
    if (f.status === "nonaktif" && r.aktif !== false) return false;
    return true;
  });
}
