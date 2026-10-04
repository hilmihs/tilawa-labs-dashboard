/**
 * View model for `/maahir/kehadiran` — turns the stored `rekap/kehadiran`
 * payload into the class picker and the anggota × pertemuan grid.
 *
 * Pure on purpose (no DB, no React): the rules that are easy to get wrong here
 * are all data rules, and they are cheap to pin down in a test against the real
 * capture in `lib/maahir/__fixtures__/kehadiran.json`.
 *
 * Three of those rules, stated once so the page never re-litigates them:
 *
 * 1. NOTHING is recomputed. Upstream owns the attendance arithmetic (docs
 *    §9: sakit leaves the denominator, a whitewashed member counts as 100%,
 *    a mid-period joiner's denominator starts at `mulaiTanggal`). We show
 *    `persenHadir` and `totals` as given and only ever COUNT rows —
 *    classes, members, meetings, unfilled sessions — which no upstream rule
 *    touches.
 * 2. `persenHadir: null` is "penyebutnya kosong", not 0%. It renders as an
 *    em dash; printing 0% would accuse a member of never attending.
 * 3. A cell has three states, not two: a code, `"-"` (the session happened but
 *    presensi was never filled), and a MISSING key (no row recorded for this
 *    member at all). They read differently to a coordinator, so they are kept
 *    apart all the way to the cell.
 *
 * Period labels are NOT built here — they come from `meta` via
 * `periodLabel()` in lib/maahir/rekap.ts.
 */
import type {
  MaahirCounts,
  MaahirGender,
  MaahirKehadiranPayload,
  MaahirKelasKehadiran,
  MaahirPerPertemuanKode,
} from "@/lib/maahir/types";

export type GenderFilter = "semua" | "ikhwan" | "akhwat";

/** Query-string gender → filter. Anything unrecognised falls back to "semua". */
export function parseGender(v: string | undefined | null): GenderFilter {
  return v === "ikhwan" || v === "akhwat" ? v : "semua";
}

// ── Class picker ────────────────────────────────────────────────────────────

export type KelasRingkas = {
  kelasId: string;
  kelasName: string;
  gender: MaahirGender;
  jadwalHari: string[];
  jumlahAnggota: number;
  jumlahPertemuan: number;
  /** Sessions in the window whose presensi is still empty — upstream's count. */
  belumDiisi: number;
};

/**
 * The classes to offer in the picker, in UPSTREAM's order. Deliberately not
 * re-sorted: the API already groups akhwat then ikhwan, and any sort we invent
 * here (by name, by belumDiisi) would read as a ranking the data doesn't make.
 */
export function ringkasKelas(
  payload: MaahirKehadiranPayload | null | undefined,
  gender: GenderFilter = "semua",
): KelasRingkas[] {
  const list = Array.isArray(payload) ? payload : [];
  return list
    .filter((k) => gender === "semua" || k.gender === gender)
    .map((k) => ({
      kelasId: k.kelasId,
      kelasName: k.kelasName,
      gender: k.gender,
      jadwalHari: k.jadwalHari ?? [],
      jumlahAnggota: k.anggota?.length ?? 0,
      jumlahPertemuan: k.pertemuan?.length ?? 0,
      belumDiisi: k.belumDiisi ?? 0,
    }));
}

/**
 * The class to render: the requested one when it survives the gender filter,
 * otherwise the first of the filtered list. Returning the first (rather than
 * nothing) keeps the grid populated when someone flips the gender toggle while
 * a class of the other gender is selected.
 */
export function pilihKelas(
  payload: MaahirKehadiranPayload | null | undefined,
  gender: GenderFilter = "semua",
  kelasId?: string | null,
): MaahirKelasKehadiran | null {
  const list = (Array.isArray(payload) ? payload : []).filter(
    (k) => gender === "semua" || k.gender === gender,
  );
  return list.find((k) => k.kelasId === kelasId) ?? list[0] ?? null;
}

/** Counts across the picker — rows counted, never percentages averaged. */
export function totalRingkas(list: KelasRingkas[]): {
  kelas: number;
  anggota: number;
  pertemuan: number;
  belumDiisi: number;
} {
  return {
    kelas: list.length,
    anggota: list.reduce((n, k) => n + k.jumlahAnggota, 0),
    pertemuan: list.reduce((n, k) => n + k.jumlahPertemuan, 0),
    belumDiisi: list.reduce((n, k) => n + k.belumDiisi, 0),
  };
}

// ── The grid ────────────────────────────────────────────────────────────────

export type GridKolom = {
  pertemuanId: string;
  tanggal: string; // "2026-08-24"
  tanggalLabel: string; // "24 Agu"
  programLabel: string; // "Kelas Maahir" | "At-Tibyan" | "Muallim Najih"
  /** true when the class mixes programs, so the header has to say which one. */
  tampilkanProgram: boolean;
};

export type GridSel = {
  pertemuanId: string;
  /** `null` = no presensi row for this member; `"-"` = row exists, still empty. */
  kode: MaahirPerPertemuanKode | null;
  catatan: string;
};

export type GridBaris = {
  anggotaId: string;
  nama: string;
  peran: "Ketua" | "Wakil" | null;
  sel: GridSel[];
  totals: MaahirCounts;
  persenHadir: number | null;
  keterangan: string;
};

export type Grid = {
  kolom: GridKolom[];
  baris: GridBaris[];
  /** Dates of sessions upstream flagged `filled: false`, already labelled. */
  sesiBelumDiisi: Array<{ tanggal: string; label: string; programLabel: string }>;
};

const KOSONG_COUNTS: MaahirCounts = { H: 0, I: 0, S: 0, A: 0, T: 0 };

export function buildGrid(kelas: MaahirKelasKehadiran | null | undefined): Grid {
  if (!kelas) return { kolom: [], baris: [], sesiBelumDiisi: [] };

  const pertemuan = [...(kelas.pertemuan ?? [])].sort((a, b) =>
    a.tanggal.localeCompare(b.tanggal),
  );
  const programs = new Set(pertemuan.map((p) => p.program));
  const kolom: GridKolom[] = pertemuan.map((p) => ({
    pertemuanId: p.id,
    tanggal: p.tanggal,
    tanggalLabel: tanggalPendek(p.tanggal),
    programLabel: programLabel(p.programLabel, p.program),
    tampilkanProgram: programs.size > 1,
  }));

  const baris: GridBaris[] = (kelas.anggota ?? []).map((a) => ({
    anggotaId: a.anggotaId,
    nama: a.name,
    peran: a.isKetua ? "Ketua" : a.isWakil ? "Wakil" : null,
    sel: kolom.map((k) => ({
      pertemuanId: k.pertemuanId,
      // `?? null` keeps "tidak ada baris" distinct from the "-" code.
      kode: a.perPertemuan?.[k.pertemuanId] ?? null,
      catatan: a.catatanPerPertemuan?.[k.pertemuanId] ?? "",
    })),
    totals: a.totals ?? KOSONG_COUNTS,
    persenHadir: a.persenHadir ?? null,
    keterangan: a.keterangan ?? "",
  }));

  const sesiBelumDiisi = (kelas.sessions ?? [])
    .filter((s) => !s.filled)
    .map((s) => ({
      tanggal: s.tanggal,
      label: tanggalPendek(s.tanggal),
      programLabel: programLabel(s.programLabel, s.program),
    }))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  return { kolom, baris, sesiBelumDiisi };
}

// ── Formatting ──────────────────────────────────────────────────────────────

const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/** "2026-08-24" → "24 Agu". String math, no `Date`: `new Date("2026-08-24")`
 *  is UTC midnight and prints as the 23rd for a reader west of UTC. */
export function tanggalPendek(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  const bulan = Number(m[2]);
  if (bulan < 1 || bulan > 12) return iso;
  return `${Number(m[3])} ${BULAN_PENDEK[bulan - 1]}`;
}

/**
 * Upstream sends a display label for two of the three programs and the raw key
 * for the third (`muallim_najih` has no `programLabel` of its own in the
 * capture), so an unlabelled key is humanised rather than shown as a slug.
 */
export function programLabel(label: string | null | undefined, program?: string): string {
  const raw = (label ?? "").trim() || (program ?? "");
  if (!raw) return "—";
  if (!raw.includes("_")) return raw;
  return raw
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** `null` → "—". A member with an empty denominator has no percentage; 0%
 *  would be a different, and false, statement. */
export function persenLabel(persen: number | null | undefined): string {
  if (persen == null || !Number.isFinite(persen)) return "—";
  return `${Math.round(persen)}%`;
}

/**
 * "terakhir ditarik" line. The page must stay useful on stale data (spec:
 * "Halaman harus tetap tampil saat data lama"), so this always renders both the
 * wall clock in WIB — where the coordinators are — and how long ago that was.
 */
export function fetchedAtLabel(fetchedAt: Date, now: Date = new Date()): string {
  const jam = fetchedAt.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  const menit = Math.floor((now.getTime() - fetchedAt.getTime()) / 60000);
  const rel =
    menit < 1
      ? "barusan"
      : menit < 60
        ? `${menit} menit lalu`
        : menit < 60 * 24
          ? `${Math.floor(menit / 60)} jam lalu`
          : `${Math.floor(menit / 1440)} hari lalu`;
  return `${jam} WIB (${rel})`;
}

/** How old a pull may get before the page says so out loud. */
export const TARIKAN_BASI_JAM = 36;

export function tarikanBasi(fetchedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - fetchedAt.getTime() > TARIKAN_BASI_JAM * 3600_000;
}
