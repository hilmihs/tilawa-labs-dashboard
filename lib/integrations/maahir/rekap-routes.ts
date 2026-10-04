/**
 * The seven `rekap/*` routes of the Maahir Public API, and HOW each one's period
 * is built. Description + pure functions only — nothing here touches the network
 * or the database, so the sync pass and the read layer can share one definition
 * of "which period string belongs to this route" instead of each re-deriving it.
 *
 * That sharing is the whole point: `periode` is the storage key in `maahir_rekap`,
 * so if the writer stores `2026-08` and the reader asks for `2026-07-28..2026-08-27`
 * the page silently renders "belum ditarik" forever. Both call `rekapPeriode()`.
 *
 * The three period shapes are NOT interchangeable (docs/API-PUBLIC.md §9):
 *   - `bulan` (`YYYY-MM`) is what we SEND, but the window it means differs per
 *     route: `laporan-maahir`/`kehadiran`/`tibyan` mean 28→27, `hits-disiplin`
 *     mode=bulan means the full 1–end calendar month. We never label a chart from
 *     this string — `meta.mulai`/`meta.sampai` do that (see lib/maahir/rekap.ts).
 *   - `shakwa` has no `bulan` parameter at all; it takes `dari`+`sampai`, so we
 *     key it by the explicit window and ask for the same 28→27 report window.
 *   - `sp` is cumulative since the program started; it has no period. Its row is
 *     stored under `periode = ""` and its effective end date is `meta.cutoff`.
 */

export type MaahirRekapRouteName =
  | "rekap/laporan-maahir"
  | "rekap/kehadiran"
  | "rekap/tibyan"
  | "rekap/matrix-guru"
  | "rekap/hits-disiplin"
  | "rekap/sp"
  | "rekap/shakwa";

/** How `periode` is formed for a route — see the module comment. */
export type MaahirPeriodKind =
  /** `YYYY-MM`; upstream resolves it to the 28→27 report window. */
  | "bulan-laporan"
  /** `YYYY-MM`; upstream resolves it to the full calendar month. */
  | "bulan-kalender"
  /** `YYYY-MM-DD..YYYY-MM-DD`; the window is sent explicitly. */
  | "jendela"
  /** `""` — cumulative, no period. */
  | "kumulatif";

export type MaahirRekapRoute = {
  route: MaahirRekapRouteName;
  /** API scope the key must carry; a 403 here means only this route is skipped. */
  scope: "maahir" | "hits" | "penilaian" | "shakwa";
  periodKind: MaahirPeriodKind;
  /** Params that are always sent regardless of period (e.g. hits-disiplin mode). */
  fixedParams?: Record<string, string>;
};

export const MAAHIR_REKAP_ROUTES: MaahirRekapRoute[] = [
  { route: "rekap/laporan-maahir", scope: "maahir", periodKind: "bulan-laporan" },
  { route: "rekap/kehadiran", scope: "maahir", periodKind: "bulan-laporan" },
  { route: "rekap/tibyan", scope: "maahir", periodKind: "bulan-laporan" },
  { route: "rekap/matrix-guru", scope: "penilaian", periodKind: "bulan-laporan" },
  // mode=minggu exists upstream but is out of scope for v1 (no screen uses it).
  {
    route: "rekap/hits-disiplin",
    scope: "hits",
    periodKind: "bulan-kalender",
    fixedParams: { mode: "bulan" },
  },
  { route: "rekap/sp", scope: "maahir", periodKind: "kumulatif" },
  { route: "rekap/shakwa", scope: "shakwa", periodKind: "jendela" },
];

export const MAAHIR_REKAP_ROUTE_NAMES = MAAHIR_REKAP_ROUTES.map((r) => r.route);

export function maahirRekapRoute(route: MaahirRekapRouteName): MaahirRekapRoute {
  const found = MAAHIR_REKAP_ROUTES.find((r) => r.route === route);
  if (!found) throw new Error(`Unknown Maahir rekap route: ${route}`);
  return found;
}

// ── Month arithmetic (string in, string out — no Date, no timezone) ──────────

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertMonth(bulan: string): void {
  if (!MONTH_RE.test(bulan)) throw new Error(`Bulan harus YYYY-MM, dapat: ${bulan}`);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `shiftMonth("2026-01", -1) === "2025-12"`. Pure string math on purpose: a Date
 *  round-trip here would shift the month for anyone east of UTC. */
export function shiftMonth(bulan: string, delta: number): string {
  assertMonth(bulan);
  const [y, m] = bulan.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}

/** The `YYYY-MM` a Date falls in, read with LOCAL parts (the server runs on WIB). */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/**
 * The Maahir report window for a month: `2026-08` → 28 Jul .. 27 Aug 2026.
 * Docs §9: the report period is 28→27, NOT the calendar month. Callers that need
 * a label must still read `meta.mulai`/`meta.sampai` from the stored response —
 * this helper only builds the window we ask for.
 */
export function reportWindow(bulan: string): { mulai: string; sampai: string } {
  assertMonth(bulan);
  return { mulai: `${shiftMonth(bulan, -1)}-28`, sampai: `${bulan}-27` };
}

/**
 * The Maahir REPORT month a day belongs to. The window runs 28→27, so from the
 * 28th onward the running period is already next month's: 2026-09-28 is in
 * `2026-10` (28 Sep .. 27 Oct), not in `2026-09`. `iso` is a WIB "YYYY-MM-DD".
 */
export function bulanLaporan(iso: string): string {
  const bulan = iso.slice(0, 7);
  return Number(iso.slice(8, 10)) >= 28 ? shiftMonth(bulan, 1) : bulan;
}

/** `bulanLaporan` for a Date, read with LOCAL parts like `monthOf`. */
export function bulanLaporanOf(date: Date): string {
  return bulanLaporan(`${monthOf(date)}-${pad2(date.getDate())}`);
}

/** Bulan berjalan + bulan lalu. Last month is re-pulled every run because
 *  presensi corrections land late and silently change a closed month. */
export function rekapMonths(today: Date = new Date()): [string, string] {
  const current = monthOf(today);
  return [current, shiftMonth(current, -1)];
}

// ── Period key + params ─────────────────────────────────────────────────────

/**
 * The `maahir_rekap.periode` value for a route. Writer and reader MUST both go
 * through this, otherwise a stored row is unreachable (see module comment).
 * `bulan` is required for every route except `rekap/sp`, which is cumulative.
 */
export function rekapPeriode(route: MaahirRekapRouteName, bulan?: string): string {
  const kind = maahirRekapRoute(route).periodKind;
  if (kind === "kumulatif") return "";
  if (!bulan) throw new Error(`Route ${route} butuh bulan (YYYY-MM)`);
  if (kind === "jendela") {
    const { mulai, sampai } = reportWindow(bulan);
    return `${mulai}..${sampai}`;
  }
  assertMonth(bulan);
  return bulan;
}

/** Query params for one pull — period params included, filters merged in. */
export function rekapParams(
  route: MaahirRekapRouteName,
  bulan?: string,
  filters: MaahirRekapFilters = {},
): Record<string, string> {
  const def = maahirRekapRoute(route);
  const params: Record<string, string> = { ...(def.fixedParams ?? {}) };
  if (def.periodKind === "jendela") {
    if (!bulan) throw new Error(`Route ${route} butuh bulan (YYYY-MM)`);
    const { mulai, sampai } = reportWindow(bulan);
    params.dari = mulai;
    params.sampai = sampai;
  } else if (def.periodKind !== "kumulatif") {
    if (!bulan) throw new Error(`Route ${route} butuh bulan (YYYY-MM)`);
    assertMonth(bulan);
    params.bulan = bulan;
  }
  if (filters.gender) params.gender = filters.gender;
  if (filters.program) params.program = filters.program;
  // `kelas_id` repeats upstream; the client's URLSearchParams takes one value, so
  // the multi-class case has to be requested per class. v1 never filters by class.
  const kelas = normaliseKelasIds(filters.kelasId);
  if (kelas.length === 1) params.kelas_id = kelas[0];
  else if (kelas.length > 1) throw new Error("kelas_id ganda belum didukung di v1");
  return params;
}

export type MaahirRekapFilters = {
  gender?: "ikhwan" | "akhwat" | null;
  /** `rekap/kehadiran` only. */
  program?: "kelas_maahir" | "at_tibyan" | null;
  /** `rekap/kehadiran` only. */
  kelasId?: string[] | string | null;
};

function normaliseKelasIds(v: MaahirRekapFilters["kelasId"]): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return [...new Set(arr.filter(Boolean))].sort();
}

/**
 * Canonical `maahir_rekap.params_key`: ONLY the filter params (gender, program,
 * kelas_id) — never the period, which already lives in its own column. Sorted and
 * deduped so the same filter set always produces the same key no matter how the
 * caller ordered it; the unparameterised pull (all of v1) is the empty string.
 */
export function rekapParamsKey(filters: MaahirRekapFilters = {}): string {
  const parts: string[] = [];
  if (filters.gender) parts.push(`gender=${filters.gender}`);
  const kelas = normaliseKelasIds(filters.kelasId);
  if (kelas.length) parts.push(`kelas_id=${kelas.join(",")}`);
  if (filters.program) parts.push(`program=${filters.program}`);
  return parts.sort().join("&");
}

// ── The run plan ────────────────────────────────────────────────────────────

export type MaahirRekapPull = {
  route: MaahirRekapRouteName;
  /** Storage key — `maahir_rekap.periode`. */
  periode: string;
  /** Storage key — `maahir_rekap.params_key`. */
  paramsKey: string;
  /** What to send to the API. */
  params: Record<string, string>;
  /** The month this pull is about; absent for the cumulative `rekap/sp`. */
  bulan?: string;
};

/**
 * Everything one sync run should fetch: five monthly routes × (bulan berjalan +
 * bulan lalu), plus cumulative `sp` and the running `shakwa` window = 12 requests.
 * Order is deliberate — the current month first, so a run cut short by an upstream
 * outage still refreshed what the dashboard shows by default.
 */
export function maahirRekapPulls(today: Date = new Date()): MaahirRekapPull[] {
  const [current, previous] = rekapMonths(today);
  // On the 28th–31st the running 28→27 period is next month's. Without this the
  // report routes would keep refreshing a closed period and never pull the open
  // one, and every screen reading "bulan laporan" would find no row.
  const laporan = bulanLaporanOf(today);
  const pulls: MaahirRekapPull[] = [];
  for (const bulan of [...new Set([laporan, current, previous])]) {
    for (const def of MAAHIR_REKAP_ROUTES) {
      if (def.periodKind === "kumulatif" || def.periodKind === "jendela") continue;
      // Calendar-month routes have no "next month" to pull yet.
      if (def.periodKind === "bulan-kalender" && bulan === laporan && laporan !== current) continue;
      pulls.push({
        route: def.route,
        periode: rekapPeriode(def.route, bulan),
        paramsKey: rekapParamsKey(),
        params: rekapParams(def.route, bulan),
        bulan,
      });
    }
  }
  pulls.push({
    route: "rekap/sp",
    periode: rekapPeriode("rekap/sp"),
    paramsKey: rekapParamsKey(),
    params: rekapParams("rekap/sp"),
  });
  // Only the running window: shakwa tickets are worked the week they arrive, and
  // last month's window is already closed by the time a later run would re-ask.
  // On the 28th–31st the calendar month is pulled too, because the shakwa page
  // still keys its default view by calendar month.
  for (const bulan of new Set([laporan, current])) {
    pulls.push({
      route: "rekap/shakwa",
      periode: rekapPeriode("rekap/shakwa", bulan),
      paramsKey: rekapParamsKey(),
      params: rekapParams("rekap/shakwa", bulan),
      bulan,
    });
  }
  return pulls;
}
