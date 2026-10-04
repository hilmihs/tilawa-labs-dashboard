/**
 * The class-category vocabulary of the Mabni roster workbook, and how it lines
 * up with `halaqah_sync`.
 *
 * Two spellings of the same thing live in that workbook:
 *
 *   sheet "Data Pengajar"            "Al Marhalah al-Ūlā Usbu’i Ikhwan"
 *   sheet "Data Anak, Usia, …"       "M1 IKHWAN USBU'I"
 *
 * Both are parsed by the one function here on purpose — two parsers would
 * eventually disagree about what "M2" means, and the disagreement would be
 * invisible until a teacher showed up attached to the wrong class.
 *
 * The category is deliberately COARSER than a halaqah: "Al Marhalah al-Ūlā
 * Usbu'i Ikhwan" covers three separate halaqah in the mirror. So a category
 * resolves to a LIST of halaqah ids, never to one, and nothing derived from it
 * is ever written back as a student's placement.
 */

export type Level = "MA" | "M1" | "M2" | "M3";
export type Gender = 1 | 2; // 1 = Ikhwan, 2 = Akhwat — the mirror's convention
export type Jenis = "yaumi" | "usbui";

export type KelasKategori = {
  /** The source text this entry came from, verbatim, after splitting on newlines. */
  raw: string;
  level: Level;
  gender: Gender;
  /** null when the category names no cadence — MA carries no qualifier. */
  jenis: Jenis | null;
  /** Canonical identity: "M1-1-usbui", "MA-2". Stable across both spellings. */
  key: string;
};

/** The shape `matchHalaqah` needs; satisfied by a row of `halaqah_sync`. */
export type HalaqahLike = {
  halaqahId: number;
  name: string | null;
  level: string | null;
  jenis: string | null;
};

/**
 * Fold a category fragment down to bare lowercase words.
 *
 * The apostrophes are DELETED rather than normalized to ASCII. The workbook
 * carries three different characters in the same position — `Usbu’i` (U+2019)
 * on some rows, `Usbu'i` on others, `USBU'I` on the santri sheet — and deleting
 * the whole class of them means `usbui` comes out of all three without anyone
 * having to remember which row uses which.
 *
 * NFKD + diacritic-stripping is what turns `Ūlā` into `Ula` and `Atfāl` into
 * `Atfal`; the workbook's macrons are not reproduced anywhere else in the app.
 */
function fold(fragment: string): string {
  return fragment
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’ʼ'`´]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/*
 * Longest-token-first. `thaaniyah` contains no `ula`, but the reverse ordering
 * of a looser pattern would shadow it, and a marhalah silently reading as the
 * wrong level is the one failure here nobody would notice by eye.
 */
const LEVEL_PATTERNS: [RegExp, Level][] = [
  [/\bthalithah\b|\btsalitsah\b|\btsalisah\b|\bm3\b/, "M3"],
  [/\bthaaniyah\b|\bthaniyah\b|\btsaniyah\b|\btsaniah\b|\bm2\b/, "M2"],
  [/\bula\b|\bm1\b/, "M1"],
  [/\batfal\b|\bma\b/, "MA"],
];

function levelOf(folded: string): Level | null {
  for (const [pattern, level] of LEVEL_PATTERNS) {
    if (pattern.test(folded)) return level;
  }
  return null;
}

function genderOf(folded: string): Gender | null {
  if (/\bikhwan\b/.test(folded)) return 1;
  if (/\bakhwat\b/.test(folded)) return 2;
  return null;
}

function jenisOf(folded: string): Jenis | null {
  if (/\byaumi\b/.test(folded)) return "yaumi";
  if (/\busbui\b/.test(folded)) return "usbui";
  return null;
}

export function kategoriKey(level: Level, gender: Gender, jenis: Jenis | null): string {
  return jenis ? `${level}-${gender}-${jenis}` : `${level}-${gender}`;
}

/**
 * Parse one "Kategori Kelas" cell into the classes it names.
 *
 * Returns MORE than one entry when the cell holds several classes joined by a
 * newline — two cells in the pengajar sheet do exactly that, e.g. "Al Marhalah
 * al-Thaaniyah Yaumi Akhwat \nAl Marhalah al-Thaaniyah Usbu'i Akhwat".
 *
 * Returns an EMPTY array for anything it cannot read with certainty. Callers
 * are expected to report those strings rather than guess: a wrong guess here
 * silently misfiles a teacher, an unparsed string is a line in a dry-run
 * report that someone can fix in the workbook.
 */
export function parseKelasKategori(raw: string | null | undefined): KelasKategori[] {
  if (!raw) return [];

  const out: KelasKategori[] = [];
  for (const fragment of String(raw).split(/\r?\n/)) {
    const trimmed = fragment.trim();
    if (!trimmed) continue;

    const folded = fold(trimmed);
    const level = levelOf(folded);
    const gender = genderOf(folded);
    if (!level || !gender) continue; // unreadable — the caller reports it

    const jenis = jenisOf(folded);
    out.push({ raw: trimmed, level, gender, jenis, key: kategoriKey(level, gender, jenis) });
  }
  return out;
}

/**
 * Gender of a halaqah, read off its name: "(M1) Akhwat - Yaumi - Yuva & Fira".
 *
 * `halaqah_sync` has no gender column — the dashboard derives it elsewhere from
 * the peserta in the class, which is unavailable for a halaqah nobody is
 * enrolled in yet. The name always carries it, so the name is what's used here;
 * the importer cross-checks the two and reports any disagreement.
 */
export function halaqahGenderFromName(name: string | null): Gender | null {
  if (!name) return null;
  return genderOf(fold(name));
}

/**
 * Every halaqah in the mirror that a category covers — 0, 1, or several.
 *
 * A null `jenis` matches any cadence (MA names no cadence and both MA halaqah
 * happen to be yaumi). An empty result is a real answer, not an error: the
 * workbook lists classes that have no halaqah upstream at all.
 */
export function matchHalaqah(kategori: KelasKategori, rows: HalaqahLike[]): number[] {
  return rows
    .filter(
      (r) =>
        r.level === kategori.level &&
        halaqahGenderFromName(r.name) === kategori.gender &&
        (kategori.jenis === null || r.jenis === kategori.jenis),
    )
    .map((r) => r.halaqahId)
    .sort((a, b) => a - b);
}
