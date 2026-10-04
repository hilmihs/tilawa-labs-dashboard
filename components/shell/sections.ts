import {
  Home,
  Link2,
  LayoutGrid,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Users,
  GraduationCap,
  BookOpen,
  BookMarked,
  Inbox,
  BarChart3,
  Mail,
  Replace,
  ClipboardList,
  ClipboardCheck,
  Eye,
  SearchCheck,
  ShieldAlert,
  FileWarning,
  FileCheck2,
  MessageSquareWarning,
  Target,
  Newspaper,
  BadgeCheck,
  MonitorPlay,
  Megaphone,
  SquarePen,
  Timer,
  IdCard,
  NotebookPen,
  Repeat,
  type LucideIcon,
} from "lucide-react";

/** Every navigable section, keyed so the chrome can pick an icon + canonical label. */
export type SectionKey =
  | "beranda"
  | "overview"
  | "dashboard"
  | "peserta"
  | "pengajar"
  | "silabus"
  | "asesmen"
  | "inbox"
  | "report"
  | "surat"
  // Sambungan akun setoran (HKM/berkah_api saja) — app/[program]/sambungan.
  | "sambungan"
  | "perubahan"
  | "piket"
  | "ringkasan"
  // Layar rinci yang disuapi API Maahir. Sampai 7 Sep 2026 semuanya route
  // yatim — halamannya sudah jalan, tapi tidak pernah masuk nav mana pun, jadi
  // hanya bisa dibuka kalau URL-nya diketik manual. Lihat app/[program]/layout.tsx.
  | "kehadiran"
  | "tibyan"
  | "sp"
  | "shakwa"
  | "disiplin"
  | "observasi"
  | "inspeksi"
  | "evaluasi"
  | "scorecard"
  | "kabar"
  | "kurasi"
  // Layar dinding + alat pengisiannya — lihat LAYAR_NAV.
  | "tv"
  | "arahan"
  | "arahanRotasi"
  | "arahanIsi"
  | "countdown"
  // Administrasi kepanitiaan acara — app/acara.
  | "acara"
  // Daftar individu lintas program + CV per orang — app/orang.
  | "orang"
  // Penilaian panitia Div. Kaderisasi — app/penilaian.
  | "penilaianKader";

/** One nav entry. `href` is computed server-side (it carries the program slug +
 *  feature flags); `key` selects the icon and the canonical display label
 *  ({@link SECTION_LABEL}) — `label` is only a fallback. */
export interface NavItem {
  key: SectionKey;
  href: string;
  label: string;
  /** Optional count badge (e.g. open action items on Inbox). */
  badge?: number;
}

export const SECTION_ICON: Record<SectionKey, LucideIcon> = {
  beranda: Home,
  overview: LayoutGrid,
  dashboard: CalendarCheck,
  peserta: Users,
  pengajar: GraduationCap,
  silabus: BookOpen,
  asesmen: ClipboardCheck,
  inbox: Inbox,
  report: BarChart3,
  surat: Mail,
  sambungan: Link2,
  perubahan: Replace,
  piket: ClipboardList,
  ringkasan: NotebookPen,
  kehadiran: CalendarRange,
  tibyan: BookMarked,
  sp: FileWarning,
  shakwa: MessageSquareWarning,
  disiplin: ShieldAlert,
  observasi: Eye,
  inspeksi: SearchCheck,
  evaluasi: FileCheck2,
  scorecard: Target,
  kabar: Newspaper,
  kurasi: BadgeCheck,
  tv: MonitorPlay,
  arahan: Megaphone,
  arahanRotasi: Repeat,
  arahanIsi: SquarePen,
  countdown: Timer,
  acara: CalendarDays,
  orang: IdCard,
  penilaianKader: ClipboardCheck,
};

/**
 * Canonical, full-word Indonesian label for every section — the single source of
 * truth for how a destination is named anywhere in the chrome (rail, tabs,
 * drawer). Layouts still pass `label` on each `NavItem`, but the chrome prefers
 * this map so the same destination can never be called two different things.
 * Change a nav name here, not in the 20+ layouts.
 */
export const SECTION_LABEL: Record<SectionKey, string> = {
  beranda: "Beranda",
  overview: "Semua Program",
  dashboard: "Kehadiran",
  peserta: "Peserta",
  pengajar: "Pengajar",
  silabus: "Silabus",
  asesmen: "Asesmen",
  inbox: "Tindak Lanjut",
  report: "Laporan",
  surat: "Surat",
  sambungan: "Sambungan Akun",
  perubahan: "Perubahan",
  piket: "Piket",
  ringkasan: "Ringkasan Kajian",
  kehadiran: "Rincian Kelas",
  tibyan: "At-Tibyan",
  sp: "SP",
  shakwa: "Shakwa",
  disiplin: "Disiplin",
  observasi: "Observasi",
  inspeksi: "Inspeksi",
  evaluasi: "Hasil Ujian",
  scorecard: "Scorecard",
  kabar: "Kabar",
  kurasi: "Kurasi",
  tv: "Layar Board",
  arahan: "Papan Arahan",
  arahanRotasi: "Papan Rotasi",
  arahanIsi: "Isi Arahan",
  countdown: "Countdown",
  acara: "Acara",
  orang: "Daftar Individu",
  penilaianKader: "Penilaian",
};

/**
 * One-line "what is this" for the destinations whose name alone doesn't say it.
 * Used by card-style entry points (e.g. /overview) — the rail and tabs only ever
 * show {@link SECTION_LABEL}.
 */
export const SECTION_HINT: Partial<Record<SectionKey, string>> = {
  kehadiran: "Grid anggota × pertemuan per kelas Maahir, satu kelas sekali lihat.",
  tibyan: "Kajian At-Tibyan: KPI, tren, ranking kelas, dan anggota perlu perhatian.",
  sp: "Surat Peringatan kumulatif sejak awal program, termasuk pemutihan.",
  shakwa: "Aduan, izin, dan masukan yang masuk lewat formulir Shakwa.",
  disiplin: "Rekap disiplin pengajar HITS: insiden, cakupan observasi, hutang menit.",
  observasi: "Keterangan harian ketua kelas per pertemuan — sumber nilai soft skill.",
  inspeksi: "Penilaian pedagogis ketua kelompok: silabus, manajemen, evaluasi, SOP.",
  evaluasi: "Hasil ujian peserta beserta halaqah dan pengajarnya.",
  tv: "Papan dinding publik: kehadiran hari ini lintas program + kabar berjalan.",
  arahan: "Papan dinding arahan Dewan: usia arahan, PIC, dan checkpoint terakhir.",
  arahanRotasi: "Papan dinding bergilir: Task Board, fokus program pekanan, lalu Layar Board (data kemarin).",
  arahanIsi: "Form dari HP: tambah arahan baru atau perbarui checkpoint-nya.",
  countdown: "Layar hitung mundur momen ibadah & perjalanan (perlu password bersama).",
  orang: "Satu baris per orang lintas program: akun, halaqah yang diampu, kajian yang diikuti.",
};

/** Display name for a nav entry: canonical label first, caller's label as fallback. */
export function navLabel(item: NavItem): string {
  return SECTION_LABEL[item.key] ?? item.label;
}

/**
 * One destination, one navigation system. Layouts historically passed the
 * program sections in *both* `railItems` and `tabs`; the rail keeps only what
 * the tabs don't already carry (cross-program context: Semua Program,
 * Scorecard, Kabar, Kurasi).
 */
export function railWithoutTabs(railItems: NavItem[], tabs: NavItem[]): NavItem[] {
  if (tabs.length === 0) return railItems;
  const taken = new Set(tabs.map((t) => t.href));
  return railItems.filter((item) => !taken.has(item.href));
}

/**
 * Layar dinding — deliberately NOT part of {@link divisionRail}.
 *
 * These are kiosk screens meant to sit open on a TV in the building, plus the
 * one form that feeds a kiosk. They are not daily coordinator tools, and putting
 * them next to Kehadiran/Peserta would invite someone to "work" inside a board
 * that has no filters and no PII. So the chrome renders them as a separate,
 * quieter group at the bottom of the rail (and under its own heading in the
 * mobile drawer), never among the sections.
 *
 * Access, for the record — none of these is gated by the coordinator session:
 * `/tv` and `/arahan*` are public in middleware.ts (aggregate + role labels
 * only, no PII), and `/countdown` demands the shared page password
 * (page_passwords slug 'countdown') inside the page itself. Showing the links
 * to a logged-in coordinator therefore grants nothing new; each page still
 * enforces its own rule.
 */
export const LAYAR_NAV: NavItem[] = [
  { key: "tv", href: "/tv", label: "Layar Board" },
  { key: "arahan", href: "/arahan", label: "Papan Arahan" },
  { key: "arahanRotasi", href: "/arahan?mode=rotasi", label: "Papan Rotasi" },
  { key: "arahanIsi", href: "/arahan/isi", label: "Isi Arahan" },
  { key: "countdown", href: "/countdown", label: "Countdown" },
];

/** Drop entries whose href is already reachable from another nav surface. */
export function withoutHrefs(items: NavItem[], ...taken: NavItem[][]): NavItem[] {
  const seen = new Set(taken.flat().map((t) => t.href));
  return items.filter((item) => !seen.has(item.href));
}

/** Rail items for program-less screens (overview, scorecard, "belum ada program"). */
export function divisionRail(opts: {
  isSuper?: boolean;
  kabar?: boolean;
  kurasi?: boolean;
  includeOverview?: boolean;
}): NavItem[] {
  return [
    ...(opts.includeOverview
      ? [
          { key: "beranda" as const, href: "/", label: "Beranda" },
          { key: "overview" as const, href: "/overview", label: "Semua Program" },
        ]
      : []),
    { key: "acara" as const, href: "/acara", label: "Acara" },
    { key: "orang" as const, href: "/orang", label: "Daftar Individu" },
    { key: "penilaianKader" as const, href: "/penilaian", label: "Penilaian" },
    { key: "pengajar" as const, href: "/pengajar", label: "Pengajar" },
    ...(opts.isSuper ? [{ key: "scorecard" as const, href: "/scorecard", label: "Scorecard" }] : []),
    ...(opts.kabar ? [{ key: "kabar" as const, href: "/berita", label: "Kabar" }] : []),
    ...(opts.kurasi ? [{ key: "kurasi" as const, href: "/berita/kurasi", label: "Kurasi" }] : []),
  ];
}
