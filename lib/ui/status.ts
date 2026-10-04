/**
 * Shared status-tone color pairs — the app's `-100/-700` (light) + `-950/-300`
 * (dark) pill convention, consolidated so badges, chips and the report status
 * strip all pull from one place instead of re-declaring color maps.
 *
 * Earth tones (design "Overhaul Warna Logo" 1a). `app/globals.css` re-points
 * the emerald/amber/red/blue palettes so step 100 is the chip fill and 700 the
 * chip text of the design's status chips — these classes land on the exact
 * pairs (all ≥ 5.7:1):
 *   success  Aman       #E2EEE5 / #2F6546
 *   warning  Perhatian  #F7EBCF / #7E500A
 *   danger   Kritis     #F5DFD9 / #8E3324
 *   info     Izin       #E0E9EF / #35556B
 * Tailwind's stock teal/indigo are cool and saturated and are NOT re-pointed
 * there, so those two tones carry their own warm hexes here:
 *   teal     sage-teal  #DCEBE7 / #235C57   (6.2:1; dark 8.7:1)
 *   indigo   mulberry   #EEE3EC / #6A3D63   (6.8:1; dark 8.9:1)
 * `neutral` text moved 500 → 600: warm neutral-500 on neutral-100 is 4.15:1.
 */
export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "teal"
  | "indigo"
  | "neutral";

export const toneBadgeClass: Record<StatusTone, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  teal: "bg-[#dcebe7] text-[#235c57] dark:bg-[#10231f] dark:text-[#93c7bf]",
  indigo: "bg-[#eee3ec] text-[#6a3d63] dark:bg-[#2a1827] dark:text-[#d7b3d0]",
  neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

/**
 * The design's status-chip typography (1a): uppercase 11px bold, .06em
 * tracking, 3px × 10px. Opt-in via `<Badge caps>`; plain badges keep their
 * sentence-case look so names and free text are not shouted.
 */
export const chipCapsClass = "px-2.5 py-[3px] text-11 font-bold uppercase tracking-[0.06em]";

/**
 * Presensi status codes as stored in `attendance_sync.status`. `name` is the
 * full label for tooltips and screen-reader text; `label` is the single letter
 * the attendance matrix paints in each cell.
 */
export const attendanceStatus: Record<number, { label: string; name: string; tone: StatusTone }> = {
  0: { label: "A", name: "Alfa", tone: "danger" },
  1: { label: "H", name: "Hadir", tone: "success" },
  2: { label: "T", name: "Telat", tone: "warning" },
  3: { label: "I", name: "Izin/Sakit", tone: "info" },
};

/**
 * Solid square per presensi code for the attendance matrix — the design's cell
 * colors (1a/1c), all on the `-600` step of the earth palettes:
 *   H #3D7A57   T #94600E   I #3D6078   A #A63F2D
 * The squares carry meaning, so each needs 3:1 against the row (WCAG 1.4.11):
 * light 5.1 / 5.3 / 6.7 / 6.2:1 on white and ≥ 4.47:1 on a neutral-100 zebra
 * band. Dark steps up to `-400` (5.4 / 6.4 / 4.9 / 4.2:1 on the dark card);
 * the `-500` ramp left Alfa at 3.07:1 there.
 */
export const attendanceCellClass: Record<number, string> = {
  0: "bg-red-600 dark:bg-red-400",
  1: "bg-emerald-600 dark:bg-emerald-400",
  2: "bg-amber-600 dark:bg-amber-400",
  3: "bg-blue-600 dark:bg-blue-400",
};

/**
 * "Belum" (meeting not held / no data) is the absence of a status, so it is
 * drawn HOLLOW in both themes — transparent with a 1px control-weight outline
 * (`--border-strong`: 3.50:1 on white, 4.07:1 on the dark card) — never as a
 * fifth fill color.
 */
export const attendanceCellEmptyClass = "border border-border-strong";

/** Pill classes for a presensi status, or null for an unrecognised code. */
export function attendanceClass(status: number): string | null {
  const s = attendanceStatus[status];
  return s ? toneBadgeClass[s.tone] : null;
}
