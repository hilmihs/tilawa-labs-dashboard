import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { foldedJadwalCte } from "@/lib/reports/meeting-fold";
import { getMabniGuruAttendance } from "./guru-attendance";

/**
 * Mabni's recap, as ONE message to ONE person.
 *
 * Every other program gets a per-teacher magic link. Mabni cannot: its upstream
 * exposes no phone number for any of its 14 teachers (lib/sync/mabni-sync.ts
 * writes `phone: null` explicitly), so there is nobody to send a link to. The
 * coordinator's decision, 16 Aug 2026: send the whole roster to Khadijah Sabil Nugroho
 * and let her distribute it.
 *
 * No token, no link, no confirmation loop — this is a report, not a request. A
 * magic link would be meaningless here because the recipient is not the person
 * whose attendance it describes.
 */

export type MabniTeacherLine = {
  guruId: number | null;
  nama: string;
  halaqah: number;
  meetings: number;
  taught: number;
  hadir: number;
  telat: number;
  izin: number;
};

export type MabniDigest = {
  start: string;
  end: string;
  teachers: MabniTeacherLine[];
  totals: { teachers: number; meetings: number; taught: number };
};

/** Per-teacher attendance for the Mabni program over one period. */
export async function getMabniDigest(start: string, end: string): Promise<MabniDigest | null> {
  const db = getDb();
  const prog = await db.execute(sql`
    select id from programs where slug = 'mabni' limit 1
  `);
  const programId = prog.rows[0]?.id as string | undefined;
  if (!programId) return null;

  // Same per-meeting attribution and meeting-fold as the tilawah recap, so the
  // numbers here mean exactly what they mean everywhere else in the dashboard.
  const rows = await db.execute(sql`
    with ${foldedJadwalCte}
    select coalesce(j.guru_id, h.guru_id) as guru_id,
           coalesce(
             (select min(g.name) from guru_sync g
               where g.program_id = j.program_id and g.tilawah_guru_id = coalesce(j.guru_id, h.guru_id)),
             h.pengajar,
             '(tanpa pengajar)'
           ) as nama,
           count(distinct j.tilawah_halaqah_id)::int as halaqah,
           count(*)::int as meetings,
           count(*) filter (where j.eff_status in (3, 4))::int as taught
    from jf j
    join halaqah_sync h
      on h.program_id = j.program_id and h.tilawah_halaqah_id = j.tilawah_halaqah_id
    where j.program_id = ${programId}
      and j.schedule_date between ${start} and ${end}
    group by 1, 2
    order by 2
  `);

  const attendance = await getMabniGuruAttendance(programId, start, end);

  const teachers: MabniTeacherLine[] = rows.rows.map((r) => {
    const guruId = r.guru_id != null ? Number(r.guru_id) : null;
    const att = (guruId != null ? attendance.get(guruId) : undefined) ?? { hadir: 0, telat: 0, izin: 0 };
    return {
      guruId,
      nama: String(r.nama),
      halaqah: Number(r.halaqah),
      meetings: Number(r.meetings),
      taught: Number(r.taught),
      hadir: att.hadir,
      telat: att.telat,
      izin: att.izin,
    };
  });

  return {
    start,
    end,
    teachers,
    totals: {
      teachers: teachers.length,
      meetings: teachers.reduce((n, t) => n + t.meetings, 0),
      taught: teachers.reduce((n, t) => n + t.taught, 0),
    },
  };
}

export type MabniMessageInput = {
  recipientName: string;
  digest: MabniDigest;
  periodLabel: string;
  lockLabel: string;
};

/**
 * The WhatsApp text. Deliberately a plain list rather than a table: WhatsApp has
 * no monospace guarantee, and a wrapped table is harder to read than one line
 * per teacher.
 */
export function buildMabniMessage(input: MabniMessageInput): string {
  const { digest } = input;
  const lines = digest.teachers.map(
    (t) =>
      `• ${t.nama} — ${t.taught}/${t.meetings} pertemuan · hadir ${t.hadir} telat ${t.telat} izin ${t.izin} · ${t.halaqah} halaqah`,
  );

  return [
    `Assalamu'alaikum warahmatullahi wabarakatuh, Ustadzah ${input.recipientName} 🙏`,
    "",
    `Berikut rekap kehadiran mengajar Madrasah Nusantara periode ${input.periodLabel}:`,
    "",
    ...lines,
    "",
    `Total: ${digest.totals.taught} dari ${digest.totals.meetings} pertemuan tercatat, ` +
      `${digest.totals.teachers} pengajar.`,
    "",
    "Mohon berkenan meneruskan ke masing-masing pengajar untuk dicek. Rekap ini disusun " +
      "hanya dari data di website; presensi yang dicatat lewat spreadsheet — baik yang dikirim " +
      "via teks WhatsApp maupun yang diisi di spreadsheet — belum termasuk di sini.",
    "",
    `⏰ Presensi dikunci ${input.lockLabel}. Setelah itu, pertemuan tanpa presensi dihitung tidak diisi.`,
    "",
    "Jazaakumullahu khairan 🌿",
  ].join("\n");
}
