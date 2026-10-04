import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getProgram } from "@/lib/programs/resolve";
import { getHalaqahList, type HalaqahRow } from "@/lib/insights/halaqah";
import { usiaMonths } from "@/lib/directory/usia";

/**
 * Program directory: the flat "who is in this program" lists — every peserta
 * with their contact + placement + attendance, and every pengajar with the
 * halaqah they hold.
 *
 * Both read the synced read-model (students_sync / halaqah_sync / jadwal_sync)
 * and reuse getHalaqahList() for the per-halaqah aggregates (jadwal string,
 * peserta count, meeting counts) so the numbers can't drift from the ones the
 * dashboard shows.
 *
 * The peserta list additionally left-joins the app-owned `students` table for
 * the three fields upstream never exposes — parents' names and date of birth —
 * and the wali list reads the xlsx-sourced family overlay. Both are empty for
 * every program except Mabni, so nothing else changes shape.
 */

export type PesertaRow = {
  tilawahUserId: number;
  name: string | null;
  userCode: string | null;
  phone: string | null;
  gender: number | null; // 1=Ikhwan, 2=Akhwat
  halaqahId: number | null;
  halaqahName: string | null;
  level: string | null;
  type: string | null;
  jadwal: string | null;
  pengajar: string | null;
  /** pivot.status: 1 = aktif, 0 = tidak aktif. Null when tilawah never set it. */
  statusCode: number | null;
  /** pivot.reason free text (mengundurkan diri / dinonaktifkan / …). */
  statusText: string | null;
  attendanceRate: number | null; // date-relative: hadir ÷ pertemuan terjadi
  hadirCount: number | null;
  effectiveMeetings: number | null;
  izinCount: number | null;
  recordedMeetings: number | null;
  /** tilawah's own "6/26" progress string, kept verbatim. */
  pertemuan: string | null;
  semesterPct: number | null; // tilawah's hadir ÷ seluruh pertemuan semester
  // ── from the app-owned `students` row, null when there isn't one ──
  fatherName: string | null;
  motherName: string | null;
  birthDate: string | null; // ISO 'YYYY-MM-DD' — pg returns `date` as a string
  /** Derived from birthDate here, so the page and the export agree. */
  usiaMonths: number | null;
  /** Label batch asal, hanya terisi pada tampilan "semua batch" (lib/directory/semua-batch.ts). */
  batch?: string | null;
  /** Slug program asal baris ini — tautan halaqah harus menunjuk ke sana, bukan ke program yang dibuka. */
  programSlug?: string;
};

/** One child slot on one family, flattened for the directory + export. */
export type WaliRow = {
  fatherName: string | null;
  motherName: string | null;
  /** "Jumlah Anak" as the workbook states it — not a count of the rows below. */
  childCount: number | null;
  ordinal: number;
  childName: string;
  /** false = sibling who is not enrolled in this program. Expected, not missing data. */
  enrolled: boolean;
  halaqahName: string | null;
  level: string | null;
};

export type PengajarRow = {
  pengajar: string;
  phone: string | null;
  halaqahCount: number;
  studentCount: number;
  avgRate: number | null; // peserta-weighted average across their halaqah
  belowCount: number;
  recordedMeetings: number;
  totalMeetings: number;
  dueTanpaPresensi: number;
  levels: string[];
  genders: number[];
  halaqah: HalaqahRow[];
  /** Lihat PesertaRow.batch. */
  batch?: string | null;
  programSlug?: string;
};

export type PesertaDirectory = {
  programName: string;
  rows: PesertaRow[];
  /** Empty for every program without the xlsx family overlay. */
  wali: WaliRow[];
};

export type PengajarDirectory = {
  programName: string;
  rows: PengajarRow[];
};

export async function getPesertaDirectory(programSlug: string): Promise<PesertaDirectory | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;
  const db = getDb();

  const [halaqahList, studentRows, waliRows] = await Promise.all([
    getHalaqahList(programSlug),
    /*
     * The left join cannot fan out: `students` is UNIQUE on
     * (program_id, tilawah_user_id), so it contributes at most one row per
     * peserta and the row count is exactly students_sync's. Both sides are
     * aliased because the bare column list only worked while there was one
     * table in the FROM.
     */
    db.execute(sql`
      select ss.tilawah_user_id, ss.name, ss.user_code, ss.phone, ss.gender,
             ss.halaqah_id, ss.pengajar,
             ss.enrollment_status_code, ss.enrollment_status, ss.pertemuan,
             ss.attendance_rate::float as attendance_rate,
             ss.kehadiran_percentage::float as semester_pct,
             ss.hadir_count, ss.effective_meetings, ss.izin_count, ss.recorded_meetings,
             s.father_name, s.mother_name, s.birth_date
      from students_sync ss
      left join students s
        on s.program_id = ss.program_id
       and s.tilawah_user_id = ss.tilawah_user_id
      where ss.program_id = ${program.id}
      order by ss.name asc nulls last
    `),
    // Family overlay. Returns nothing at all for programs without one, which is
    // every program but Mabni today.
    db.execute(sql`
      select g.father_name, g.mother_name, g.child_count,
             c.ordinal, c.child_name, c.student_id, ss.halaqah_id
        from student_guardians g
        join student_guardian_children c on c.guardian_id = g.id
        left join students st on st.id = c.student_id
        left join students_sync ss
          on ss.program_id = st.program_id
         and ss.tilawah_user_id = st.tilawah_user_id
       where g.program_id = ${program.id}
       order by g.father_name asc nulls last, g.mother_name asc nulls last, c.ordinal asc
    `),
  ]);

  const byHalaqah = new Map(halaqahList.map((h) => [h.halaqahId, h]));

  const rows: PesertaRow[] = studentRows.rows.map((r) => {
    const hid = r.halaqah_id != null ? Number(r.halaqah_id) : null;
    const h = hid != null ? byHalaqah.get(hid) : undefined;
    // pg hands `date` back as 'YYYY-MM-DD'; keep it a string rather than
    // round-tripping through Date, which would reintroduce a timezone.
    const birthDate = r.birth_date != null ? String(r.birth_date).slice(0, 10) : null;
    return {
      tilawahUserId: Number(r.tilawah_user_id),
      name: (r.name as string) ?? null,
      userCode: (r.user_code as string) ?? null,
      phone: (r.phone as string) ?? null,
      gender: r.gender != null ? Number(r.gender) : null,
      halaqahId: hid,
      halaqahName: h?.name ?? null,
      level: h?.level ?? null,
      type: h?.type ?? null,
      jadwal: h?.jadwal ?? null,
      // The enrollment carries its own pengajar snapshot; fall back to the
      // halaqah's current teacher when it's blank.
      pengajar: (r.pengajar as string) ?? h?.pengajar ?? null,
      statusCode: r.enrollment_status_code != null ? Number(r.enrollment_status_code) : null,
      statusText: (r.enrollment_status as string) ?? null,
      attendanceRate: r.attendance_rate != null ? Number(r.attendance_rate) : null,
      hadirCount: r.hadir_count != null ? Number(r.hadir_count) : null,
      effectiveMeetings: r.effective_meetings != null ? Number(r.effective_meetings) : null,
      izinCount: r.izin_count != null ? Number(r.izin_count) : null,
      recordedMeetings: r.recorded_meetings != null ? Number(r.recorded_meetings) : null,
      pertemuan: (r.pertemuan as string) ?? null,
      semesterPct: r.semester_pct != null ? Number(r.semester_pct) : null,
      fatherName: (r.father_name as string) ?? null,
      motherName: (r.mother_name as string) ?? null,
      birthDate,
      usiaMonths: usiaMonths(birthDate),
    };
  });

  const wali: WaliRow[] = waliRows.rows.map((r) => {
    const hid = r.halaqah_id != null ? Number(r.halaqah_id) : null;
    const h = hid != null ? byHalaqah.get(hid) : undefined;
    return {
      fatherName: (r.father_name as string) ?? null,
      motherName: (r.mother_name as string) ?? null,
      childCount: r.child_count != null ? Number(r.child_count) : null,
      ordinal: Number(r.ordinal),
      childName: String(r.child_name),
      enrolled: r.student_id != null,
      halaqahName: h?.name ?? null,
      level: h?.level ?? null,
    };
  });

  return { programName: program.name, rows, wali };
}

export async function getPengajarDirectory(programSlug: string): Promise<PengajarDirectory | null> {
  const program = await getProgram(programSlug);
  if (!program) return null;

  const halaqahList = await getHalaqahList(programSlug);

  const groups = new Map<string, HalaqahRow[]>();
  for (const h of halaqahList) {
    const key = h.pengajar?.trim() || "(tanpa pengajar)";
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }

  const rows: PengajarRow[] = [...groups.entries()].map(([pengajar, halaqah]) => {
    const studentCount = halaqah.reduce((n, h) => n + h.studentCount, 0);
    // Weight by peserta, not by halaqah: a 15-peserta halaqah should move the
    // teacher's average more than a 3-peserta one.
    const rated = halaqah.filter((h) => h.avgRate != null && h.studentCount > 0);
    const weighted = rated.reduce((n, h) => n + (h.avgRate as number) * h.studentCount, 0);
    const ratedStudents = rated.reduce((n, h) => n + h.studentCount, 0);
    return {
      pengajar,
      phone: halaqah.find((h) => h.guruPhone)?.guruPhone ?? null,
      halaqahCount: halaqah.length,
      studentCount,
      avgRate: ratedStudents > 0 ? weighted / ratedStudents : null,
      belowCount: halaqah.reduce((n, h) => n + h.belowCount, 0),
      recordedMeetings: halaqah.reduce((n, h) => n + h.recordedMeetings, 0),
      totalMeetings: halaqah.reduce((n, h) => n + h.totalMeetings, 0),
      dueTanpaPresensi: halaqah.reduce((n, h) => n + h.dueTanpaPresensi, 0),
      levels: [...new Set(halaqah.map((h) => h.level).filter((l): l is string => !!l))].sort(),
      genders: [...new Set(halaqah.map((h) => h.gender).filter((g): g is number => g != null))].sort(),
      halaqah: [...halaqah].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    };
  });

  rows.sort((a, b) => a.pengajar.localeCompare(b.pengajar));
  return { programName: program.name, rows };
}
