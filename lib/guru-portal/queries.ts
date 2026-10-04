import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { normalizePhone } from "@/lib/wa";

/**
 * Read-side helpers for the public teacher portal (/guru). All verification and
 * PII access happens here, server-side — the guru roster is NEVER handed to the
 * browser (the backend holds one shared admin session with full-tenant read).
 */

export type GuruIdentity = { guruIds: number[]; name: string; phone: string | null };

/**
 * Verify a teacher by name + (email OR registered phone). Returns the identity
 * (every tilawah guru id the match resolves to) or null. Weak on purpose — the
 * coordinator approval gate is the real safeguard.
 */
export async function verifyGuruLogin(
  name: string,
  identifier: string,
): Promise<GuruIdentity | null> {
  const db = getDb();
  const trimmedName = name.trim();
  if (!trimmedName || !identifier.trim()) return null;

  const rows = await db.execute(sql`
    select tilawah_guru_id, name, email, phone
    from guru_sync
    where lower(btrim(name)) = lower(btrim(${trimmedName}))
  `);
  if (rows.rows.length === 0) return null;

  const idLower = identifier.trim().toLowerCase();
  const idPhone = normalizePhone(identifier);

  const matched = rows.rows.filter((r) => {
    const email = (r.email as string | null)?.trim().toLowerCase() ?? null;
    const phone = normalizePhone(r.phone as string | null);
    const emailHit = !!email && email === idLower;
    const phoneHit = !!idPhone && !!phone && phone === idPhone;
    return emailHit || phoneHit;
  });
  if (matched.length === 0) return null;

  const guruIds = [...new Set(matched.map((r) => Number(r.tilawah_guru_id)))];
  const displayName = (matched[0].name as string | null) ?? trimmedName;
  const phone = (matched.find((r) => r.phone)?.phone as string | null) ?? null;
  return { guruIds, name: displayName, phone };
}

export type GuruHalaqah = {
  programId: string;
  programSlug: string;
  halaqahId: number;
  name: string | null;
  level: string | null;
  pengajar: string | null;
};

/** Halaqah a guru is responsible for: main teacher OR teaches ≥1 meeting (badal). */
export async function getHalaqahForGuru(guruIds: number[]): Promise<GuruHalaqah[]> {
  if (guruIds.length === 0) return [];
  const db = getDb();
  const ids = sql.join(guruIds, sql`, `);
  const rows = await db.execute(sql`
    select h.program_id, p.slug as program_slug, h.tilawah_halaqah_id,
           h.name, h.level, h.pengajar
    from halaqah_sync h
    join programs p on p.id = h.program_id
    where h.guru_id in (${ids})
       or h.tilawah_halaqah_id in (
         select distinct tilawah_halaqah_id from jadwal_sync where guru_id in (${ids})
       )
    order by p.name, h.name
  `);
  return rows.rows.map((r) => ({
    programId: String(r.program_id),
    programSlug: String(r.program_slug),
    halaqahId: Number(r.tilawah_halaqah_id),
    name: (r.name as string) ?? null,
    level: (r.level as string) ?? null,
    pengajar: (r.pengajar as string) ?? null,
  }));
}

export type PortalMeeting = {
  jadwalId: number;
  order: number | null;
  date: string | null;
  statusLabel: string | null;
  guruId: number | null;
};

export type PortalHalaqah = {
  programId: string;
  programSlug: string;
  halaqahId: number;
  name: string | null;
  level: string | null;
  pengajar: string | null;
  gender: number | null; // 1=ikhwan, 2=akhwat
  meetings: PortalMeeting[];
};

/**
 * Full view of one halaqah for the portal, but only if `guruIds` is authorized
 * for it (main teacher or teaches a meeting). Returns null otherwise — this is
 * the authorization boundary for the portal's per-halaqah pages/actions.
 */
export async function getHalaqahForGuruById(
  guruIds: number[],
  halaqahId: number,
): Promise<PortalHalaqah | null> {
  if (guruIds.length === 0) return null;
  const db = getDb();
  const ids = sql.join(guruIds, sql`, `);

  const halRows = await db.execute(sql`
    select h.program_id, p.slug as program_slug, h.tilawah_halaqah_id,
           h.name, h.level, h.pengajar, h.guru_id
    from halaqah_sync h
    join programs p on p.id = h.program_id
    where h.tilawah_halaqah_id = ${halaqahId}
    limit 1
  `);
  const hal = halRows.rows[0];
  if (!hal) return null;

  const programId = String(hal.program_id);

  const meetingRows = await db.execute(sql`
    select tilawah_jadwal_id as jadwal_id, "order", schedule_date::text as date,
           status_label, guru_id
    from jadwal_sync
    where program_id = ${programId} and tilawah_halaqah_id = ${halaqahId}
    order by schedule_date asc nulls last, "order" asc
  `);
  const meetings: PortalMeeting[] = meetingRows.rows.map((r) => ({
    jadwalId: Number(r.jadwal_id),
    order: r.order != null ? Number(r.order) : null,
    date: (r.date as string) ?? null,
    statusLabel: (r.status_label as string) ?? null,
    guruId: r.guru_id != null ? Number(r.guru_id) : null,
  }));

  // Authorize: main guru, or teaches at least one meeting here.
  const mainGuruId = hal.guru_id != null ? Number(hal.guru_id) : null;
  const authorized =
    (mainGuruId != null && guruIds.includes(mainGuruId)) ||
    meetings.some((m) => m.guruId != null && guruIds.includes(m.guruId));
  if (!authorized) return null;

  const genderRows = await db.execute(sql`
    select min(gender) as gender from students_sync
    where program_id = ${programId} and halaqah_id = ${halaqahId}
  `);
  let gender = genderRows.rows[0]?.gender != null ? Number(genderRows.rows[0].gender) : null;
  if (gender == null) {
    const nm = ((hal.name as string) ?? "").toUpperCase();
    if (nm.includes("AKHWAT")) gender = 2;
    else if (nm.includes("IKHWAN")) gender = 1;
  }

  return {
    programId,
    programSlug: String(hal.program_slug),
    halaqahId,
    name: (hal.name as string) ?? null,
    level: (hal.level as string) ?? null,
    pengajar: (hal.pengajar as string) ?? null,
    gender,
    meetings,
  };
}

export type GuruOption = { id: number; name: string; phone: string | null };

/** Search gurus in a program for the badal picker (name substring, capped). */
export async function searchGuruInProgram(
  programId: string,
  query: string,
  excludeGuruId?: number | null,
): Promise<GuruOption[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const db = getDb();
  const like = `%${q.toLowerCase()}%`;
  const rows = await db.execute(sql`
    select tilawah_guru_id, name, phone
    from guru_sync
    where program_id = ${programId}
      and name is not null
      and lower(name) like ${like}
      ${excludeGuruId != null ? sql`and tilawah_guru_id <> ${excludeGuruId}` : sql``}
    order by name asc
    limit 20
  `);
  return rows.rows.map((r) => ({
    id: Number(r.tilawah_guru_id),
    name: (r.name as string) ?? "(tanpa nama)",
    phone: (r.phone as string) ?? null,
  }));
}

/** Look up a single guru's display name within a program (for badal snapshot). */
export async function getGuruName(programId: string, guruId: number): Promise<string | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    select name from guru_sync
    where program_id = ${programId} and tilawah_guru_id = ${guruId} limit 1
  `);
  return (rows.rows[0]?.name as string) ?? null;
}

/** Coordinator WA number by halaqah gender. Env overridable; defaults filled. */
export function coordinatorPhoneFor(gender: number | null): string {
  const ikhwan = process.env.COORD_IKHWAN_PHONE || "6281084081353";
  const akhwat = process.env.COORD_AKHWAT_PHONE || "6281697886921";
  return gender === 2 ? akhwat : ikhwan;
}
