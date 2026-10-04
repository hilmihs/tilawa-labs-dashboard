/**
 * Which sections a program actually shows in its top bar.
 *
 * This exists because the tab list used to be one hardcoded array for every
 * program (see git history of app/[program]/layout.tsx). That was wrong in both
 * directions at once:
 *
 *   - It offered tabs that can only ever render an empty state. The Maahir sync
 *     writes `maahir_sync` / `maahir_rekap` and nothing else, so under `/maahir`
 *     the four tilawah-backed tabs (Peserta, Pengajar, Silabus, Tindak Lanjut)
 *     and the generic Laporan branch all read tables that hold zero rows for
 *     that program — verified 7 Sep 2026: halaqah_sync/students_sync/
 *     jadwal_sync/guru_sync each `count(*) = 0` for slug `maahir`.
 *   - It hid the tabs that DO have data. Every Maahir-fed detail screen
 *     (kehadiran, tibyan, sp, shakwa, disiplin, evaluasi, asesmen) shipped as an
 *     orphan route: reachable only by typing the URL, with at most one buried
 *     in-body link.
 *
 * So the rule here is one rule, applied twice: **a tab is listed only when the
 * route behind it will render something.** Each predicate below therefore
 * mirrors that route's own `notFound()` gate exactly. When you change a gate in
 * a `page.tsx`, change it here too or the nav starts pointing at a 404.
 */
import type { NavItem } from "@/components/shell/sections";
import { getProgramConfig } from "@/lib/programs/config";
import type { Program } from "@/lib/programs/resolve";

/** The bits of a program row this module needs — keeps it testable without a DB. */
export type NavProgram = Pick<Program, "slug" | "dataSourceType" | "config">;

/**
 * Maahir batch uuids pinned onto a HITS program by scripts/pin-maahir-batches.ts.
 * Presence of a pin is what makes the HITS-scoped Maahir screens (disiplin,
 * observasi, inspeksi, matrix) able to scope `maahir_sync` rows to this program;
 * without it they can only render the "tanpa-pin" empty state.
 *
 * Accepts both a bare string and a list: `hits-regular-jan` legitimately spans
 * two batches. Same lenient parse as `app/[program]/disiplin/queries.ts`, kept
 * here so the nav and the pages can never disagree about what "pinned" means.
 */
export function maahirHitsBatchIds(config: unknown): string[] {
  const raw = (config as { maahirHitsBatchId?: unknown } | null)?.maahirHitsBatchId;
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.filter((v): v is string => typeof v === "string" && v.trim() !== ""))];
}

export function hasMaahirPin(config: unknown): boolean {
  return maahirHitsBatchIds(config).length > 0;
}

/** Mirrors app/[program]/disiplin/page.tsx — `reportFormat: "hits"` or a `hits*` slug. */
export function isHitsProgram(p: NavProgram): boolean {
  return getProgramConfig(p).reportFormat === "hits" || p.slug.startsWith("hits");
}

/** Mirrors app/[program]/shakwa/page.tsx — a real HITS slug, or any program with a pin. */
export function isShakwaProgram(p: NavProgram): boolean {
  return /^hits(-|$)/.test(p.slug) || hasMaahirPin(p.config);
}

/**
 * Section tabs for a program, in reading order.
 *
 * Maahir-native programs (`maahir_api`) get a completely different list from the
 * tilawah ones — see the file header. They share no route except the dashboard.
 */
export type OpsiTab = {
  /**
   * Program punya nilai (Evaluasi Halaqah Maahir atau ujian tilawah) — dihitung
   * layout lewat lib/insights/evaluasi/maahir.ts#punyaHasilUjian. Tanpa nilai ini
   * tab tetap muncul untuk semua program tilawah (perilaku lama).
   */
  punyaHasilUjian?: boolean;
};

export function programTabs(p: NavProgram, opsi: OpsiTab = {}): NavItem[] {
  const slug = p.slug;
  const features = getProgramConfig(p).features;

  if (p.dataSourceType === "maahir_api") {
    // Screens fed by the Maahir mirror. Pengajar / Silabus / Tindak Lanjut stay
    // absent: they read the tilawah mirror, which this program never populates
    // (halaqah_sync / students_sync / jadwal_sync / guru_sync all hold 0 rows).
    //
    // `peserta` is here because it no longer reads that mirror — it branches on
    // the data source and serves the roster out of `maahir_sync`. `report` is
    // here because the monthly workbook now has a download route of its own; the
    // page it lands on is the Maahir report surface, not the generic tilawah one.
    return [
      { key: "dashboard", href: `/${slug}/dashboard`, label: "Kehadiran" },
      { key: "kehadiran", href: `/${slug}/kehadiran`, label: "Rincian Kelas" },
      { key: "tibyan", href: `/${slug}/tibyan`, label: "At-Tibyan" },
      { key: "sp", href: `/${slug}/sp`, label: "SP" },
      { key: "peserta", href: `/${slug}/peserta`, label: "Peserta" },
      { key: "report", href: `/${slug}/report`, label: "Laporan" },
    ];
  }

  const tabs: NavItem[] = [
    { key: "dashboard", href: `/${slug}/dashboard`, label: "Kehadiran" },
    { key: "peserta", href: `/${slug}/peserta`, label: "Peserta" },
    { key: "pengajar", href: `/${slug}/pengajar`, label: "Pengajar" },
    { key: "silabus", href: `/${slug}/silabus`, label: "Silabus" },
  ];

  // Hasil ujian peserta: Evaluasi Halaqah Maahir + ujian presensi tilawah — see
  // lib/insights/evaluasi. Tilawah only (the loaders refuse other sources), and
  // only where the program actually has scores. Labelled "Hasil Ujian" because
  // "Evaluasi" read as ambiguous; the route keeps /evaluasi so shared links live.
  if (p.dataSourceType === "tilawah_api" && opsi.punyaHasilUjian !== false) {
    tabs.push({ key: "evaluasi", href: `/${slug}/evaluasi`, label: "Hasil Ujian" });
  }

  // The three Maahir-sourced teacher screens, all gated on the pin.
  //
  // `disiplin` is the subtle one: its own `page.tsx` only checks the HITS shape,
  // so `/tahsin-keluarga/disiplin` resolves and is *supposed* to — a bookmark
  // should land on a screen that explains itself ("batch Maahir belum dipin")
  // rather than a 404. But without a pin `loadDisiplin` can only ever return
  // `tanpa-pin`, and a tab that always renders an empty state is precisely the
  // dead weight this module exists to remove. So the route stays reachable and
  // the tab does not appear. Same reasoning for `observasi` and `inspeksi`,
  // which additionally have nothing to scope their `maahir_sync` rows by.
  if (isHitsProgram(p) && hasMaahirPin(p.config)) {
    tabs.push({ key: "disiplin", href: `/${slug}/disiplin`, label: "Disiplin" });
    tabs.push({ key: "observasi", href: `/${slug}/observasi`, label: "Observasi" });
    tabs.push({ key: "inspeksi", href: `/${slug}/inspeksi`, label: "Inspeksi" });
  }
  if (isShakwaProgram(p)) {
    tabs.push({ key: "shakwa", href: `/${slug}/shakwa`, label: "Shakwa" });
  }
  if (features.asesmen) {
    tabs.push({ key: "asesmen", href: `/${slug}/asesmen`, label: "Asesmen" });
  }

  if (features.ringkasan) {
    tabs.push({ key: "ringkasan", href: `/${slug}/ringkasan-kajian`, label: "Ringkasan Kajian" });
  }

  tabs.push({ key: "inbox", href: `/${slug}/inbox`, label: "Tindak Lanjut" });
  tabs.push({ key: "report", href: `/${slug}/report`, label: "Laporan" });

  if (features.surat) tabs.push({ key: "surat", href: `/${slug}/surat`, label: "Surat" });

  // Sambungan akun setoran — hanya berkah_api punya akun the partner system untuk disambungkan,
  // dan app/[program]/sambungan/page.tsx menolak (notFound) sumber data lain.
  if (p.dataSourceType === "berkah_api") {
    tabs.push({ key: "sambungan", href: `/${slug}/sambungan`, label: "Sambungan" });
  }

  if (features.perubahan) {
    tabs.push({ key: "perubahan", href: `/${slug}/perubahan`, label: "Perubahan" });
  }
  if (features.piket) tabs.push({ key: "piket", href: `/${slug}/piket`, label: "Piket" });

  return tabs;
}
