/**
 * Read layer over `maahir_rekap` — the cached `rekap/*` responses. Pages call
 * these and never touch `payload` themselves (spec: "Halaman tidak pernah
 * menyentuh payload mentah").
 *
 * Two rules this module exists to enforce:
 *
 * 1. `null` means BELUM DITARIK, not zero. A month that was never fetched — or a
 *    route whose scope the API key lacks — has no row, and the screen must say so.
 *    Rendering 0 there would report "nobody attended" for a fetch that never ran.
 * 2. A period label comes from `meta.mulai`/`meta.sampai` ONLY. `rekap/laporan-maahir`
 *    for `bulan=2026-08` means 28 Jul–27 Aug, while `rekap/hits-disiplin` for the
 *    same `2026-08` means 1 Aug–1 Sep (docs §9). Deriving the label from the month
 *    name would silently show two different windows as the same period.
 *
 * Reads are scoped to programs with `dataSourceType = 'maahir_api'`, so a route
 * pulled for one program can never surface under another.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { maahirRekap, programs } from "@/lib/db/schema";
import {
  rekapParamsKey,
  rekapPeriode,
  type MaahirRekapFilters,
  type MaahirRekapRouteName,
} from "@/lib/integrations/maahir/rekap-routes";
import type {
  MaahirHitsDisiplinPayload,
  MaahirKehadiranPayload,
  MaahirLaporanPayload,
  MaahirMatrixPayload,
  MaahirRekapMeta,
  MaahirRekapPayloadMap,
  MaahirShakwaPayload,
  MaahirSpPayload,
  MaahirTibyanPayload,
} from "@/lib/maahir/types";

/** One cached response. `fetchedAt` is what a screen shows as "terakhir ditarik". */
export type MaahirRekapRead<T> = {
  payload: T;
  meta: MaahirRekapMeta;
  fetchedAt: Date;
};

/**
 * Newest cached row for a route + period + params, or `null` when it was never
 * pulled. Generic over the route so the payload type follows the route name.
 */
export async function readRekap<R extends MaahirRekapRouteName>(
  route: R,
  bulan?: string,
  filters: MaahirRekapFilters = {},
): Promise<MaahirRekapRead<MaahirRekapPayloadMap[R]> | null> {
  const db = getDb();
  const rows = await db
    .select({
      payload: maahirRekap.payload,
      meta: maahirRekap.meta,
      fetchedAt: maahirRekap.fetchedAt,
    })
    .from(maahirRekap)
    .innerJoin(programs, eq(programs.id, maahirRekap.programId))
    .where(
      and(
        eq(programs.dataSourceType, "maahir_api"),
        eq(maahirRekap.route, route),
        eq(maahirRekap.periode, rekapPeriode(route, bulan)),
        eq(maahirRekap.paramsKey, rekapParamsKey(filters)),
      ),
    )
    // The unique constraint allows one row per program; ordering keeps the read
    // deterministic if a second maahir_api program is ever added.
    .orderBy(desc(maahirRekap.fetchedAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    payload: row.payload as MaahirRekapPayloadMap[R],
    meta: (row.meta ?? {}) as MaahirRekapMeta,
    fetchedAt: row.fetchedAt,
  };
}

/** `bulan` = "YYYY-MM"; upstream resolves it to the 28→27 report window. */
export function readLaporanMaahir(
  bulan: string,
  filters: MaahirRekapFilters = {},
): Promise<MaahirRekapRead<MaahirLaporanPayload> | null> {
  return readRekap("rekap/laporan-maahir", bulan, filters);
}

export function readKehadiran(
  bulan: string,
  filters: MaahirRekapFilters = {},
): Promise<MaahirRekapRead<MaahirKehadiranPayload> | null> {
  return readRekap("rekap/kehadiran", bulan, filters);
}

export function readTibyan(
  bulan: string,
  filters: MaahirRekapFilters = {},
): Promise<MaahirRekapRead<MaahirTibyanPayload> | null> {
  return readRekap("rekap/tibyan", bulan, filters);
}

/** Snapshot, not a live computation — pair with `matrixSnapshotState()`. */
export function readMatrixGuru(
  bulan: string,
  filters: MaahirRekapFilters = {},
): Promise<MaahirRekapRead<MaahirMatrixPayload> | null> {
  return readRekap("rekap/matrix-guru", bulan, filters);
}

/** `bulan` here is the FULL calendar month, unlike the Maahir report routes. */
export function readHitsDisiplin(
  bulan: string,
  filters: MaahirRekapFilters = {},
): Promise<MaahirRekapRead<MaahirHitsDisiplinPayload> | null> {
  return readRekap("rekap/hits-disiplin", bulan, filters);
}

/** Cumulative since the program started — no period. Label it with `meta.cutoff`,
 *  never against the per-period SP block inside `rekap/laporan-maahir`. */
export function readSp(
  filters: MaahirRekapFilters = {},
): Promise<MaahirRekapRead<MaahirSpPayload> | null> {
  return readRekap("rekap/sp", undefined, filters);
}

/** `bulan` selects the 28→27 report window the tickets were counted over. */
export function readShakwa(
  bulan: string,
  filters: MaahirRekapFilters = {},
): Promise<MaahirRekapRead<MaahirShakwaPayload> | null> {
  return readRekap("rekap/shakwa", bulan, filters);
}

// ── Pure helpers (unit-tested against the fixtures) ──────────────────────────

const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const BULAN_PENDEK = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Split "2026-07-28" without a Date: `new Date("2026-07-28")` is UTC midnight,
 *  which prints as the 27th for anyone west of UTC. */
function parts(iso: string): { y: number; m: number; d: number } | null {
  const m = DATE_RE.exec(iso);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { y: Number(m[1]), m: month, d: Number(m[3]) };
}

const shortDate = (p: { y: number; m: number; d: number }, withYear = true) =>
  `${p.d} ${BULAN_PENDEK[p.m - 1]}${withYear ? ` ${p.y}` : ""}`;

/**
 * The label for a period, taken from `meta` ONLY.
 *
 * `meta.mulai`/`meta.sampai` win; `meta.bulan` is the fallback for a response
 * that carries no explicit window. It is NEVER derived from the month name when
 * a window exists — that is what keeps Maahir's 28→27 window distinguishable
 * from `hits-disiplin`'s full calendar month for the very same `bulan=2026-08`.
 *
 * Returns `null` when `meta` says nothing about a period (e.g. `rekap/sp`, which
 * is cumulative — label that one with `meta.cutoff`).
 */
export function periodLabel(meta: MaahirRekapMeta | null | undefined): string | null {
  const mulai = meta?.mulai ? parts(meta.mulai) : null;
  const sampai = meta?.sampai ? parts(meta.sampai) : null;

  if (mulai && sampai) {
    // Drop the repeated year on the left when both ends share it.
    return `${shortDate(mulai, mulai.y !== sampai.y)} – ${shortDate(sampai)}`;
  }
  if (mulai) return `sejak ${shortDate(mulai)}`;
  if (sampai) return `s.d. ${shortDate(sampai)}`;

  const bulan = meta?.bulan;
  if (bulan && /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) {
    const [y, m] = bulan.split("-").map(Number);
    return `${BULAN_PANJANG[m - 1]} ${y}`;
  }
  return null;
}

/**
 * Whether a `rekap/matrix-guru` payload can be shown as is.
 *
 * `belum-dihitung` — no snapshot exists for that month. Upstream still answers
 *   200 with the full teacher list and `matrix: null` on every row (docs §9: the
 *   API never triggers a recompute), so this state is invisible unless checked.
 * `basi` — a snapshot exists but predates the end of the requested month, so the
 *   month is still moving under it (`meta.basi`; date in `meta.snapshot_terakhir`).
 * `siap` — usable.
 *
 * Emptiness is checked BEFORE `basi`: a stale flag on a payload that has no
 * matrix at all still means "never computed", which is the more accurate message.
 * Neither state may be rendered as 0 — a missing snapshot is not a score of zero.
 */
export function matrixSnapshotState(
  meta: MaahirRekapMeta | null | undefined,
  payload: MaahirMatrixPayload | null | undefined,
): "siap" | "basi" | "belum-dihitung" {
  const pengajar = payload?.pengajar;
  const adaMatrix = Array.isArray(pengajar) && pengajar.some((p) => p?.matrix != null);
  if (!adaMatrix) return "belum-dihitung";
  if (meta?.basi === true) return "basi";
  return "siap";
}
