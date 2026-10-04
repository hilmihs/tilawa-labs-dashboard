/**
 * Seed an empty HKM master (`hkm_participants`) from the paired presensi roster.
 *
 * HKM is one program with two feeds: presensi (tilawah, `config.presensiSlug`)
 * and setoran (the partner system/berkah). The setoran dashboard only follows master rows,
 * and the master used to be a hand-imported CSV — so a deployment whose master
 * was never imported syncs every the partner system account and reading, then shows
 * "0 peserta". The presensi roster is the source of truth for who is in HKM
 * (see scripts/hkm-unlinked-tilawah.ts), so an empty master is filled from it.
 *
 * Deliberately only when the master is EMPTY. A populated master carries
 * app-owned state (status, cuti notes, hand-fixed emails) and its names drift
 * from the presensi spelling; merging into it by name would mint duplicates.
 * Those rows are reconciled on /hkm/sambungan instead.
 *
 * Linking to a the partner system account needs an email, which the presensi roster lacks.
 * Two exact keys only — phone, then a name that is unique on both sides.
 * Anything fuzzier is left unlinked and surfaces on Sambungan as "tanpa akun".
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { halaqahSync, hkmParticipants, programs, studentsSync } from "@/lib/db/schema";
import { getProgramConfig } from "@/lib/programs/config";
import { normalizeEmail } from "@/lib/insights/hkm";
import { normalizePhone } from "@/lib/wa";

export type SeedRosterRow = {
  name: string;
  phone: string | null;
  gender: number | null;
  halaqah: string | null;
  pengajar: string | null;
};

export type SeedUser = { email: string | null; phone: string | null; name: string | null };

export type SeedPlanRow = {
  namaPeserta: string;
  namaHalaqah: string | null;
  namaPengajar: string | null;
  gender: string | null;
  emailMaster: string | null;
  matchMethod: "phone" | "name" | null;
};

/** Uppercase, drop parentheticals/punctuation — same key as the reconciliation script. */
export function seedNameKey(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pure: which master rows to insert for this roster, and which the partner system email each links to. */
export function planMasterSeed(roster: SeedRosterRow[], users: SeedUser[]): SeedPlanRow[] {
  const byPhone = new Map<string, string | null>(); // null = ambiguous
  const byName = new Map<string, string | null>();
  for (const u of users) {
    const email = normalizeEmail(u.email);
    if (!email) continue;
    const p = normalizePhone(u.phone);
    if (p) byPhone.set(p, byPhone.has(p) && byPhone.get(p) !== email ? null : email);
    const n = u.name ? seedNameKey(u.name) : "";
    if (n) byName.set(n, byName.has(n) && byName.get(n) !== email ? null : email);
  }
  const rosterNameCount = new Map<string, number>();
  for (const r of roster) {
    const n = seedNameKey(r.name);
    rosterNameCount.set(n, (rosterNameCount.get(n) ?? 0) + 1);
  }

  const used = new Set<string>(); // unique(program_id, email_master)
  return roster.map((r) => {
    const phone = normalizePhone(r.phone);
    const n = seedNameKey(r.name);
    let email: string | null = null;
    let matchMethod: SeedPlanRow["matchMethod"] = null;
    const viaPhone = phone ? byPhone.get(phone) : undefined;
    if (viaPhone && !used.has(viaPhone)) {
      email = viaPhone;
      matchMethod = "phone";
    } else {
      const viaName = n && rosterNameCount.get(n) === 1 ? byName.get(n) : undefined;
      if (viaName && !used.has(viaName)) {
        email = viaName;
        matchMethod = "name";
      }
    }
    if (email) used.add(email);
    return {
      namaPeserta: r.name.trim(),
      namaHalaqah: r.halaqah,
      namaPengajar: r.pengajar,
      gender: r.gender === 1 ? "Ikhwan" : r.gender === 2 ? "Akhwat" : null,
      emailMaster: email,
      matchMethod,
    };
  });
}

/**
 * Fill the master of `programId` from its presensi roster when the master is
 * empty. Returns how many rows were inserted (0 when there was nothing to do).
 */
export async function seedHkmMasterIfEmpty(
  program: typeof programs.$inferSelect,
  users: SeedUser[],
): Promise<number> {
  const db = getDb();
  const { presensiSlug } = getProgramConfig(program);
  if (!presensiSlug) return 0;

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(hkmParticipants)
    .where(eq(hkmParticipants.programId, program.id));
  if (n > 0) return 0;

  const [presensi] = await db.select().from(programs).where(eq(programs.slug, presensiSlug));
  if (!presensi) return 0;

  const roster = await db
    .select({
      name: studentsSync.name,
      phone: studentsSync.phone,
      gender: studentsSync.gender,
      halaqah: sql<string | null>`coalesce(${halaqahSync.namaTampil}, ${halaqahSync.name})`,
      pengajar: sql<string | null>`coalesce(${studentsSync.pengajar}, ${halaqahSync.pengajar})`,
      statusCode: studentsSync.enrollmentStatusCode,
    })
    .from(studentsSync)
    .leftJoin(
      halaqahSync,
      and(
        eq(halaqahSync.programId, studentsSync.programId),
        eq(halaqahSync.tilawahHalaqahId, studentsSync.halaqahId),
      ),
    )
    .where(eq(studentsSync.programId, presensi.id));

  // Aktif enrollments only (code 1, or no code at all — same rule as the peserta table).
  const aktif: SeedRosterRow[] = roster
    .filter((r) => r.name && (r.statusCode == null || r.statusCode === 1))
    .map((r) => ({
      name: r.name as string,
      phone: r.phone,
      gender: r.gender != null ? Number(r.gender) : null,
      halaqah: r.halaqah,
      pengajar: r.pengajar,
    }));
  if (aktif.length === 0) return 0;

  const plan = planMasterSeed(aktif, users);
  await db.insert(hkmParticipants).values(
    plan.map((p) => ({
      programId: program.id,
      namaPeserta: p.namaPeserta,
      namaHalaqah: p.namaHalaqah,
      namaPengajar: p.namaPengajar,
      gender: p.gender,
      emailMaster: p.emailMaster,
      matchMethod: p.matchMethod ? `presensi_${p.matchMethod}` : null,
      confidence: p.emailMaster ? "1" : null,
      source: "presensi",
    })),
  );
  return plan.length;
}
