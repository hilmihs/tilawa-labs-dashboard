/**
 * Roster + prefilled defaults for the HKM surat generator.
 *
 * The formatting rules live in `surat-format.ts` (pure, client-safe); this
 * module is the DB half. Every value it returns is a suggestion the operator
 * can override in the form.
 */
import { sql } from "drizzle-orm";
import { pesertaAktif } from "@/lib/enrollment";
import { getDb } from "@/lib/db/client";
import { getProgram } from "@/lib/programs/resolve";
import {
  formatPukul,
  splitHalaqahName,
  suggestPengajar,
  titleCaseName,
  type Gender,
} from "./surat-format";

export type SuratCandidate = {
  tilawahUserId: number;
  halaqahUserId: number | null;
  /** As stored upstream, e.g. "HANAFI RIVALDI". */
  namaRaw: string;
  /** Title-cased suggestion, e.g. "Hanafi Rivaldi". */
  nama: string;
  halaqahId: number | null;
  /** As stored upstream, e.g. "HKM 12 IKHWAN". */
  halaqahNameRaw: string | null;
  /** Letter form, e.g. "HKM 12". */
  halaqah: string | null;
  /** Letter form, e.g. "HKM 12 - Ikhwan". */
  kelas: string | null;
  gender: Gender;
  hari: string | null;
  pukul: string | null;
  tempat: string | null;
  pengajarRaw: string | null;
  /** Honorific + first name, e.g. "Ustadzah Tasmiah". */
  pengajar: string | null;
  /** First meeting of the halaqah, ISO date. */
  tanggalMulai: string | null;
  alfa: number;
  telat: number;
};

type Row = {
  tilawah_user_id: number;
  halaqah_user_id: number | null;
  name: string | null;
  halaqah_id: number | null;
  halaqah_name: string | null;
  day: string | null;
  session: string | null;
  pengajar: string | null;
  tempat: string | null;
  tanggal_mulai: string | null;
  alfa: number | string;
  telat: number | string;
};

/**
 * The whole roster in one query. hkm-presensi has ~191 peserta, small enough to
 * hand to the client and filter there rather than round-tripping per keystroke.
 *
 * attendance_sync.status: 0=Alfa, 1=Hadir, 2=Telat, 3=Izin (see lib/sync/tilawah-sync.ts).
 */
export async function getSuratCandidates(rosterSlug: string): Promise<SuratCandidate[]> {
  const program = await getProgram(rosterSlug);
  if (!program) return [];

  const db = getDb();
  const res = await db.execute<Row>(sql`
    with mulai as (
      select tilawah_halaqah_id, min(schedule_date)::text as start_date
      from jadwal_sync
      where program_id = ${program.id}
      group by 1
    ), att as (
      select halaqah_user_id,
             count(*) filter (where status = '0') as alfa,
             count(*) filter (where status = '2') as telat
      from attendance_sync
      where program_id = ${program.id} and halaqah_user_id is not null
      group by 1
    )
    select ss.tilawah_user_id,
           ss.halaqah_user_id,
           ss.name,
           ss.halaqah_id,
           h.name        as halaqah_name,
           h.day,
           h.session,
           h.pengajar,
           h.raw->>'description' as tempat,
           m.start_date  as tanggal_mulai,
           coalesce(a.alfa, 0)  as alfa,
           coalesce(a.telat, 0) as telat
    from students_sync ss
    left join halaqah_sync h on h.program_id = ss.program_id
                            and h.tilawah_halaqah_id = ss.halaqah_id
    left join mulai m on m.tilawah_halaqah_id = ss.halaqah_id
    left join att a   on a.halaqah_user_id    = ss.halaqah_user_id
    where ss.program_id = ${program.id}
      and ${pesertaAktif("ss")}
    order by h.name nulls last, ss.name
  `);

  return res.rows.map((r) => {
    const namaRaw = (r.name ?? "").trim();
    const { halaqah, kelas, gender } = splitHalaqahName(r.halaqah_name);
    return {
      tilawahUserId: Number(r.tilawah_user_id),
      halaqahUserId: r.halaqah_user_id == null ? null : Number(r.halaqah_user_id),
      namaRaw,
      nama: titleCaseName(namaRaw),
      halaqahId: r.halaqah_id == null ? null : Number(r.halaqah_id),
      halaqahNameRaw: r.halaqah_name,
      halaqah,
      kelas,
      gender,
      hari: r.day?.trim() || null,
      pukul: formatPukul(r.session),
      tempat: r.tempat?.trim() || null,
      pengajarRaw: r.pengajar?.trim() || null,
      pengajar: suggestPengajar(r.pengajar, gender),
      tanggalMulai: r.tanggal_mulai,
      alfa: Number(r.alfa ?? 0),
      telat: Number(r.telat ?? 0),
    };
  });
}
