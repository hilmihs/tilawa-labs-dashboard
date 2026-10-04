import type { Program } from "@/lib/programs/resolve";

export type Segmentation = {
  primary: "marhalah" | "level"; // both read from halaqah_sync.level; label differs by program
  secondary: "gender" | null;
};

/**
 * Which monthly-report layout a program uses. "hits" = the coordinator recap
 * (blocks per halaqah type × level, Ikhwan/Akhwat rows, five columns incl.
 * Peserta Keluar / Keberlangsungan / pengajar di bawah target). Anything else
 * keeps the original status-bucket recap.
 */
export type ReportFormat = "default" | "hits";

export type ProgramConfig = {
  segmentation: Segmentation | null; // null = no aggregate breakdown, just the student table
  // `perubahan` = the badal / teacher-record recap; only meaningful for programs
  // backed by jadwal_sync (the tilawah ones), so HKM/berkah stay off.
  // `surat` = the HKM letter generator (penerimaan + peringatan 1/2/3).
  // `asesmen` = /[program]/asesmen, the al-Fatihah assessment reader. Its source
  // is division-wide and carries no program id (see lib/insights/alfatihah), so
  // the flag decides *where the link lives*, not what the page shows: it hangs
  // under the HITS programs because that is the division that runs the
  // assessment, and duplicating the same link under every program would only
  // suggest a per-program scoping the upstream does not have.
  // `ringkasan` = /[program]/ringkasan-kajian, ceklis harian setoran ringkasan
  // kajian (HITS Ortu ABK). Data hidup di DB dashboard, tidak ke tilawah.
  features: { piket: boolean; perubahan: boolean; surat: boolean; asesmen: boolean; ringkasan: boolean };
  reportFormat: ReportFormat;
  // Slug of the tilawah program holding this program's roster and presensi
  // (HKM → hkm-presensi). Set when the program's own data source carries no
  // attendance: the dashboard embeds that program as a tab, and the overview
  // reads its headline numbers from there instead of showing zeroes.
  presensiSlug: string | null;
};

const DEFAULT_CONFIG: ProgramConfig = {
  segmentation: null,
  features: { piket: false, perubahan: false, surat: false, asesmen: false, ringkasan: false },
  reportFormat: "default",
  presensiSlug: null,
};

/** Read a program's display config with safe defaults for the missing bits. */
export function getProgramConfig(program: Pick<Program, "config">): ProgramConfig {
  const raw = (program.config ?? {}) as Partial<ProgramConfig>;
  const seg = raw.segmentation;
  return {
    segmentation:
      seg && (seg.primary === "marhalah" || seg.primary === "level")
        ? { primary: seg.primary, secondary: seg.secondary === "gender" ? "gender" : null }
        : null,
    features: {
      piket: raw.features?.piket ?? DEFAULT_CONFIG.features.piket,
      perubahan: raw.features?.perubahan ?? DEFAULT_CONFIG.features.perubahan,
      surat: raw.features?.surat ?? DEFAULT_CONFIG.features.surat,
      asesmen: raw.features?.asesmen ?? DEFAULT_CONFIG.features.asesmen,
      ringkasan: raw.features?.ringkasan ?? DEFAULT_CONFIG.features.ringkasan,
    },
    reportFormat: raw.reportFormat === "hits" ? "hits" : DEFAULT_CONFIG.reportFormat,
    presensiSlug:
      typeof raw.presensiSlug === "string" && raw.presensiSlug.trim()
        ? raw.presensiSlug.trim()
        : DEFAULT_CONFIG.presensiSlug,
  };
}

export function genderLabel(g: number | null): string {
  return g === 1 ? "Ikhwan" : g === 2 ? "Akhwat" : "-";
}

type PairedProgram = Pick<Program, "slug" | "config">;

/**
 * The program that embeds `slug` as its presensi tab (hkm-presensi → hkm), or
 * null. The pair is one program to its users: the child keeps its own row and
 * sync, but is reached through the parent rather than listed beside it.
 */
export function presensiParentOf<T extends PairedProgram>(programs: T[], slug: string): T | null {
  return (
    programs.find((p) => p.slug !== slug && getProgramConfig(p).presensiSlug === slug) ?? null
  );
}

/**
 * Drop every paired presensi program whose parent is also in `visible`, so the
 * switcher and the overview show "HKM" once instead of HKM + HKM — Presensi.
 * A child whose parent is not visible (a coordinator granted only the child)
 * stays, or that user would lose their only way in.
 */
export function hidePairedPresensi<T extends PairedProgram>(visible: T[]): T[] {
  return visible.filter((p) => !presensiParentOf(visible, p.slug));
}
