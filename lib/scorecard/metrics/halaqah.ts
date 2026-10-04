/**
 * Halaqah counting for the scorecard's class and teacher-hour KPIs. Pure — the
 * tilawah resolver loads the rows (halaqah_sync + roster gender tally).
 *
 * The OYP breakdown splits every class/hour KPI four ways, offline/online ×
 * ikhwan/akhwat:
 *   - mode   = halaqah_sync.type as tilawah reports it ('offline' | 'online';
 *              'hybrid' exists only in DPQ and matches neither filter).
 *   - gender = IKHWAN/AKHWAT in the halaqah name when present (every HITS
 *              reguler and Safar halaqah); otherwise the roster majority
 *              ("HITS NURIM 00147 01", "Halaqah 1" of Ortu ABK, "TAHFIZH NURIM
 *              02" carry no gender word but their rosters are single-gender).
 *
 * Teacher hours follow the coordinator's flat rule (17 Sep 2026), not the
 * session length: one halaqah = N hours per week, N per program — HITS and most
 * collaboration classes 3, HITS Ortu ABK 1, HITS Community Mosque 0.75, Tahsin
 * Al-Fatihah LAZ 2 for the class and 1 for its assessment.
 */

export type Gender = 1 | 2;

export type HalaqahRow = {
  programSlug: string;
  name: string | null;
  type: string | null;
  /** Active + inactive roster members per gender. */
  ikhwan: number;
  akhwat: number;
};

export type HalaqahFilter = {
  type?: "offline" | "online";
  gender?: Gender;
};

/** Gender of a halaqah: name keyword first, roster majority second, null when neither decides. */
export function genderHalaqah(r: Pick<HalaqahRow, "name" | "ikhwan" | "akhwat">): Gender | null {
  const name = (r.name ?? "").toLowerCase();
  const ikh = /\bikhwan\b/.test(name);
  const akh = /\bakhwat\b/.test(name);
  if (ikh !== akh) return ikh ? 1 : 2;
  if (r.ikhwan > r.akhwat) return 1;
  if (r.akhwat > r.ikhwan) return 2;
  return null;
}

/**
 * Halaqah matching the filter. A gender filter over a halaqah whose gender
 * cannot be decided throws: silently dropping it would under-count one side.
 */
export function pilihHalaqah(rows: HalaqahRow[], f: HalaqahFilter): HalaqahRow[] {
  return rows.filter((r) => {
    if (f.type && r.type !== f.type) return false;
    if (f.gender) {
      const g = genderHalaqah(r);
      if (g == null) throw new Error(`gender halaqah "${r.name}" (${r.programSlug}) tidak bisa ditentukan`);
      if (g !== f.gender) return false;
    }
    return true;
  });
}

/** Σ jam/minggu: each halaqah contributes its program's hours, else the default. */
export function jamHalaqah(rows: HalaqahRow[], jamPerHalaqah: number, jamPerProgram: Record<string, number> = {}): number {
  return rows.reduce((s, r) => s + (jamPerProgram[r.programSlug] ?? jamPerHalaqah), 0);
}
