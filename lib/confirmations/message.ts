import type { RecapCounts } from "./types";

/**
 * WhatsApp copy for the monthly teacher recap blast.
 *
 * Deliberately pure: no database, no env, no clock. The blast endpoint
 * (/api/agent/konfirmasi-rekap) hands the finished string to the Hermes agent,
 * so the wording has to be reproducible and unit-testable, and the assistant's
 * own repo can copy this shape verbatim.
 *
 * The message stays short on purpose: the per-meeting detail lives behind the
 * magic link, not in WhatsApp. A long message gets skimmed, and a skimmed
 * message gets a reflexive "siap ustadz" instead of a real confirmation.
 *
 * NOTE: HERMES.md §9 documents the message templates the assistant is allowed
 * to send. If this template changes, §9 must be updated in the same commit —
 * otherwise the agent keeps blasting a version of the copy that no longer
 * matches what the /rekap page actually offers.
 */

export type RecapMessageInput = {
  nama: string;
  /** Program names taught during the period, already human-readable. */
  programs: string[];
  counts: RecapCounts;
  /** Absolute URL to /rekap/<token>. Sent as-is so WA can autolink it. */
  link: string;
  /** e.g. "16 Juli – 15 Agustus 2026" — formatted by the caller. */
  periodLabel: string;
  /** e.g. "17 Agustus 2026 pukul 16.00 WIB". */
  lockLabel: string;
  /** Program slugs taught during the period — drives batch-specific notices. */
  programSlugs?: string[];
  /** Period end (YYYY-MM-DD), so a one-off notice cannot outlive its cycle. */
  periodEnd?: string;
};

/**
 * A notice that belongs to ONE cycle, not to the template.
 *
 * HITS Reguler Januari and April ran their 16–19 July meetings on the
 * attendance spreadsheet, not in tilawah, so those teachers would read a gap
 * this recap cannot possibly see. The reminder is gated on both the batch and
 * the period: once the window moves on, it stops being sent without anyone
 * having to remember to delete it. When this cycle is over, this block and its
 * test can go.
 */
const SPREADSHEET_NOTICE = {
  periodEnd: "2026-08-15",
  slugs: ["hits-regular-jan", "hits-regular-apr"],
  text:
    "Khusus HITS Reguler Batch Januari & April: presensi pertemuan 16–19 Juli 2026 " +
    "diisi di spreadsheet absensi pengajar, bukan di website. Mohon dilengkapi di sana — " +
    "rekap di atas tidak menghitung yang ada di spreadsheet.",
} as const;

function spreadsheetNotice(input: RecapMessageInput): string | null {
  if (input.periodEnd !== SPREADSHEET_NOTICE.periodEnd) return null;
  const slugs = input.programSlugs ?? [];
  return slugs.some((s) => (SPREADSHEET_NOTICE.slugs as readonly string[]).includes(s))
    ? SPREADSHEET_NOTICE.text
    : null;
}

/**
 * Join the program names for the halaqah bullet.
 *
 * Duplicates are dropped: a teacher holding two halaqah in the same program
 * would otherwise read "(HITS Reguler, HITS Reguler)", which looks like a bug
 * and invites a reply asking about it instead of a confirmation.
 */
function formatPrograms(programs: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of programs) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out.join(", ");
}

/**
 * Build the recap confirmation message for one teacher.
 *
 * Never embeds the phone number, the raw token or any other teacher's name —
 * the blast is forwarded by a human operator often enough that anything in the
 * body has to be safe to screenshot.
 */
export function buildRecapMessage(input: RecapMessageInput): string {
  const { nama, counts, link, periodLabel, lockLabel } = input;
  const programs = formatPrograms(input.programs);

  const halaqahLine = programs
    ? `• ${counts.halaqah} halaqah (${programs})`
    : `• ${counts.halaqah} halaqah`;

  const lines: string[] = [
    `Assalamu'alaikum warahmatullahi wabarakatuh, Ustadz/ah ${nama.trim()} 🙏`,
    "",
    `Rekap kehadiran mengajar Anda periode ${periodLabel}:`,
    halaqahLine,
    `• ${counts.taught} dari ${counts.meetings} pertemuan tercatat sudah diajar`,
  ];

  // Chasing someone who owes nothing is how a blast loses its credibility for
  // the next round, so the gap line is dropped entirely at zero and replaced
  // with an acknowledgement.
  if (counts.gaps > 0) {
    lines.push(`• ${counts.gaps} pertemuan belum ada catatan presensi`);
  } else {
    lines.push("", "Semua pertemuan sudah tercatat — mohon konfirmasi bila sudah sesuai.");
  }

  lines.push(
    "",
    "Mohon dicek dan dikonfirmasi di tautan ini:",
    link,
    "",
    'Di halaman tersebut Ustadz/ah bisa menyatakan rekap sudah tepat, membuka "Mulai Kelas" untuk pertemuan yang terluput lalu mengisi presensinya, menyatakan sudah mengajar tetapi terkendala sistem, atau menuliskan sendiri bila ada data yang tidak sesuai. Untuk reschedule atau badal, ubah tanggal / ganti pengajarnya langsung di cms.tilawalabs.demo.',
    "",
    // Said in the message itself, not only on the page: a teacher who records
    // attendance in a spreadsheet would otherwise read the gap count as an
    // accusation about work they did record, somewhere this recap cannot see.
    "Catatan: rekap ini hanya menghitung presensi yang tercatat di cms.tilawalabs.demo. Presensi yang dicatat lewat spreadsheet belum termasuk.",
  );

  const notice = spreadsheetNotice(input);
  if (notice) lines.push("", notice);

  lines.push(
    "",
    `⏰ Presensi dikunci ${lockLabel}. Setelah itu, pertemuan tanpa presensi dihitung tidak diisi.`,
    "",
    "Jazaakumullahu khairan 🌿",
  );

  return lines.join("\n");
}
