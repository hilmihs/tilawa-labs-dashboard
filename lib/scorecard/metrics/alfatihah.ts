/**
 * al-Fatihah recitation-assessment metric source.
 *
 * Data comes from the public assessment API (no auth):
 *   GET {ALFATIHAH_BASE_URL}/api/recitation-evaluations
 * Each record is ONE participant's al-Fatihah recitation being scored (1..10) at
 * some `kegiatan` (a free-text event/program label). The scorecard's al-Fatihah
 * KPIs count these records:
 *   - "Jumlah Peserta … Assessment Al Fatihah"  → UNIQUE participants        (agg: 'participants')
 *                                                  (or raw evaluations, agg: 'evaluations')
 *   - "Jumlah Event Assessment Al Fatihah …"    → distinct event days       (agg: 'events')
 *   - a pass-rate '%' KPI, if ever needed        → score ≥ scoreMin ratio    (agg: 'passRate')
 *
 * A participant is identified by `namaLengkap` (the API exposes no user_id, and
 * `uuid`/`kode_unik` are per-EVALUATION, never repeating). Records with no name
 * (~14 %) cannot be merged, so each counts as its own participant.
 *
 * The API's `kegiatan` column is uncontrolled free text ("Tahsin Al-Fatihah -
 * LAZ", "Assessment Al-Fatihah - Tuku & MAKA", "Al Fatihah Mei 2026"…), so a KPI
 * selects its records with a substring filter carried in `metricParams`, never a
 * hard-coded server-side `kegiatan=` (which is an exact match and misses every
 * variant). Gender lives in `asal_halaqah` (Ikhwan/Akhwat); `divisi` is usually
 * null. Dummy rows are excluded by default.
 */

export type Evaluation = {
  uuid: string;
  kode_unik: string | null;
  kegiatan: string | null;
  divisi: string | null;
  pemeriksa: string | null;
  asal_halaqah: string | null;
  rekomendasi_program: string | null;
  is_dummy: boolean;
  created_at: string; // ISO
  score: number; // 1..10
  namaLengkap: string | null;
};

export type FatihahAgg = "evaluations" | "participants" | "events" | "passRate";

const GREGORIAN_MONTHS =
  /\b(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b/;

/**
 * Semantic bucket for an evaluation, per the coordinator's rule: HITS is ONLY
 * the "HITS Reguler <bulan> Dasar" batches — kegiatan starting with "HITS" and
 * carrying a Gregorian month ("HITS Juni 26", "HITS Reguler April Dasar"). A
 * Hijri-named or special HITS class ("HITS Safar", "HITS Ramadhan Spesial") is
 * NOT reguler dasar and falls to Kolaborasi, as does every other recitation
 * assessment (Half Deen, LAZ, RS Ummi, Al-Fatihah bulanan, …) — all "perbaikan
 * bacaan tahsin al-fatihah / al-quran".
 */
export function classifyBucket(kegiatan: string | null): "hits" | "kolaborasi" {
  const k = norm(kegiatan);
  const isHitsReguler =
    /^hits\b/.test(k) && GREGORIAN_MONTHS.test(k) && !/spesial|hirs/.test(k);
  return isHitsReguler ? "hits" : "kolaborasi";
}

export type FatihahParams = {
  agg: FatihahAgg;
  /** Restrict to one semantic bucket (see classifyBucket). */
  bucket?: "hits" | "kolaborasi";
  /** Record matches when its `kegiatan` contains ANY of these (case-insensitive). Empty/absent = match all. */
  kegiatanAny?: string[];
  /** …and contains NONE of these. */
  kegiatanNot?: string[];
  /** Restrict to one gender halaqah. */
  asalHalaqah?: "Ikhwan" | "Akhwat";
  /** 'events': what makes one event — a distinct calendar day (default, Jakarta) or a distinct kegiatan label. */
  eventBy?: "date" | "kegiatan";
  /**
   * 'events': an event only counts when it holds at least this many evaluations.
   * The API is full of late entries — one or two rows typed days after the real
   * session (Half Deen: 889 rows on 18 Jan, then 1–3 rows on a dozen later days).
   * Counted raw, each straggler day would be its own "event".
   */
  minPerEvent?: number;
  /** 'passRate': numerator = score ≥ scoreMin (default 6 = "Baik"). */
  scoreMin?: number;
};

const DEFAULT_BASE = "https://assessment.tilawalabs.demo";

export function alfatihahBaseUrl(): string {
  return (process.env.ALFATIHAH_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

type Paginated = {
  data: Evaluation[];
  current_page: number;
  last_page: number;
  total: number;
};

/**
 * Fetch every non-dummy evaluation in [start, end] (inclusive, YYYY-MM-DD),
 * optionally scoped to one gender halaqah. Pages until `last_page`.
 */
export async function fetchEvaluations(
  window: { start: string; end: string; asalHalaqah?: "Ikhwan" | "Akhwat" },
  opts: { baseUrl?: string; perPage?: number; signal?: AbortSignal } = {},
): Promise<Evaluation[]> {
  const base = opts.baseUrl ?? alfatihahBaseUrl();
  const perPage = opts.perPage ?? 100;
  const q = new URLSearchParams({
    date_from: window.start,
    date_to: window.end,
    is_dummy: "false",
    per_page: String(perPage),
  });
  if (window.asalHalaqah) q.set("asal_halaqah", window.asalHalaqah);

  const out: Evaluation[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    q.set("page", String(page));
    const url = `${base}/api/recitation-evaluations?${q.toString()}`;
    const res = await fetch(url, { signal: opts.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`alfatihah API ${res.status} for ${url}`);
    const j = (await res.json()) as Paginated;
    out.push(...(j.data ?? []));
    lastPage = j.last_page ?? 1;
    page += 1;
  } while (page <= lastPage);

  return out;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Does one record pass the kegiatan / gender filters? */
export function matches(e: Evaluation, p: FatihahParams): boolean {
  if (e.is_dummy) return false;
  if (p.asalHalaqah && e.asal_halaqah !== p.asalHalaqah) return false;
  if (p.bucket && classifyBucket(e.kegiatan) !== p.bucket) return false;
  const keg = norm(e.kegiatan);
  if (p.kegiatanAny && p.kegiatanAny.length > 0) {
    if (!p.kegiatanAny.some((k) => keg.includes(k.toLowerCase()))) return false;
  }
  if (p.kegiatanNot && p.kegiatanNot.some((k) => keg.includes(k.toLowerCase()))) return false;
  return true;
}

export type MetricResult = { value: number; pembagi: number | null };

/** Calendar day in Jakarta (UTC+7, no DST) of an ISO timestamp; "" when unreadable. */
function jakartaDate(iso: string | null | undefined): string {
  const t = Date.parse(iso ?? "");
  return Number.isNaN(t) ? "" : new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Pure aggregation over a pre-fetched record set (the window). */
export function aggregate(records: Evaluation[], p: FatihahParams): MetricResult {
  const hit = records.filter((e) => matches(e, p));

  if (p.agg === "evaluations") {
    return { value: hit.length, pembagi: null };
  }
  if (p.agg === "participants") {
    const named = new Set<string>();
    let unnamed = 0;
    for (const e of hit) {
      const name = (e.namaLengkap ?? "").trim().toLowerCase();
      if (name) named.add(name);
      else unnamed += 1;
    }
    return { value: named.size + unnamed, pembagi: null };
  }
  if (p.agg === "events") {
    const by = p.eventBy ?? "date";
    const counts = new Map<string, number>();
    for (const e of hit) {
      const key = by === "kegiatan" ? norm(e.kegiatan) : jakartaDate(e.created_at);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const min = p.minPerEvent ?? 1;
    return { value: [...counts.values()].filter((n) => n >= min).length, pembagi: null };
  }
  // passRate
  const min = p.scoreMin ?? 6;
  const pass = hit.filter((e) => e.score >= min).length;
  return { value: pass, pembagi: hit.length };
}
