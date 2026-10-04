/**
 * Turning HKM CMS's "Dari Surah" / "Sampai Surah" export column into a
 * surah number, without depending on their surah endpoint.
 *
 * That endpoint (`/api/quran/surahs`) proxies taslim.life, which has been
 * unreachable from their servers since 19 Agu 2026 — and because `fetchSurahs()`
 * was the first call in the HKM sync, the whole run died there: 416 consecutive
 * failures, seven days of stale setoran, over a lookup table.
 *
 * The same outage degraded the export itself: rows that used to carry a latin
 * name ("Maryam", "An-Nahl") now carry the placeholder "Surah 19". So a fix that
 * only revived the endpoint would still map nothing. Both shapes are handled
 * here, numbers first, and the name map is built from data we already hold.
 */

import { SURA_NAMES } from "./sura-names.data";

/** Normalize for name lookup: case, spaces, hyphens and apostrophes all vary. */
export function suraKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Highest valid surah number; anything beyond it is junk, not data. */
const MAX_SURA = 114;

const NUMERIC = /^\s*(?:surah|surat|qs)?\s*[.:-]?\s*(\d{1,3})\s*$/i;

/**
 * Resolve one export cell to a surah number.
 *
 * Order matters: the numeric placeholder is unambiguous and needs no reference
 * data, so it is tried before the name map. Returns null rather than guessing —
 * a wrong surah silently corrupts the "Peta Surah" heatmap, while a null just
 * leaves it uncoloured.
 */
export function parseSuraNumber(
  name: string | null | undefined,
  byName: ReadonlyMap<string, number>,
): number | null {
  if (name == null) return null;
  const raw = String(name).trim();
  if (raw === "") return null;

  const m = NUMERIC.exec(raw);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= MAX_SURA ? n : null;
  }

  return byName.get(suraKey(raw)) ?? null;
}

/**
 * Build the latin-name → number map, least authoritative first so a live
 * upstream answer wins over remembered rows, which in turn beat the baked-in
 * table.
 *
 * Three layers because each covers the others' failure:
 *   SURA_NAMES  — always there, needs no network and no prior sync.
 *   remembered  — rows an earlier sync already resolved for this program; keeps
 *                 spellings we learned after the table was baked.
 *   upstream    — the live endpoint, when it answers at all.
 *
 * The baked table matters more than it looks: the degraded export overwrites
 * `raw` with placeholders, so the remembered layer erodes to nothing after one
 * full re-export. That is how this map would have quietly emptied itself.
 */
export function buildSuraNameMap(
  remembered: Iterable<{ name: string | null; number: number | null }>,
  upstream: Iterable<{ latinName?: string | null; surahNumber?: number | null }> = [],
): Map<string, number> {
  const map = new Map<string, number>();
  const put = (name: string | null | undefined, num: number | null | undefined) => {
    if (!name || num == null) return;
    if (num < 1 || num > MAX_SURA) return;
    const key = suraKey(name);
    // A placeholder ("Surah 19") must never enter the name map — it would shadow
    // nothing useful and only bloat it; parseSuraNumber handles that shape.
    if (key === "" || NUMERIC.test(name)) return;
    map.set(key, num);
  };
  for (const [num, name] of SURA_NAMES) put(name, num);
  for (const r of remembered) put(r.name, r.number);
  for (const s of upstream) put(s.latinName, s.surahNumber);
  return map;
}
