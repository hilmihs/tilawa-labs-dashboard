import { sql } from "drizzle-orm";
// Relative imports (not "@/lib/…") so the pure half of this module stays
// loadable under vitest, which has no path aliases configured.
import { getDb } from "../db/client";
import { GURU_PHONE_OVERRIDES } from "../insights/guru-phone-overrides";
import { guruIdGroup } from "./duplicates";
import { normalizePhone } from "../wa";

/**
 * Phone resolution for a teacher AS A PERSON, keyed by tilawah_guru_id.
 *
 * The monthly recap attributes each meeting to the teacher who actually taught
 * it (badal included), but lib/reports/queries.ts reads the number off
 * halaqah_sync.guru_phone — the halaqah's MAIN pengajar. A database audit of
 * hits-regular found 10 of 90 teachers carrying someone else's number that way,
 * two of them swapped with each other, so a blast built on halaqah_sync would
 * message the wrong person. guru_sync is the identity-keyed source (one row per
 * program + tilawah_guru_id, with the guru's own phone), so resolve from there.
 *
 * guru_sync alone is not enough, though: it is populated per program, and for
 * hits-safar / hits-safar-jan tilawah returns no guru rows at all — 13 halaqah
 * whose teachers would come back phoneless even though halaqah_sync has their
 * number. So the ladder has a third rung, used ONLY when the person is that
 * halaqah's own main teacher (halaqah_sync.guru_id = the guru we are resolving).
 * That condition is what keeps the badal bug dead: a substitute never inherits
 * the main teacher's number, because the row is only consulted for its owner.
 *
 * Nothing here invents a number: an unknown or implausible phone stays null and
 * the caller reports the teacher as skipped instead of texting a stranger.
 */

/**
 * Pure precedence rule: a manual override for this name beats whatever tilawah
 * synced (overrides exist precisely because the synced number is missing or
 * wrong), and the winner must survive normalizePhone() to count as a number.
 */
export function pickPhone(nama: string | null, synced: string | null): string | null {
  const key = nama?.trim();
  const override = key ? GURU_PHONE_OVERRIDES[key] : undefined;
  const normalized = normalizePhone(override ?? synced);
  return normalized && isPlausibleMobile(normalized) ? normalized : null;
}

/**
 * Every Indonesian mobile number is 62 followed by 8. normalizePhone() only
 * checks length, which lets tilawah's sequential placeholders through — ids
 * 2816-2819 were created with 1000000121…124, and 621000000124 is a perfectly
 * well-formed 12-digit number that belongs to nobody. A blast that "succeeds"
 * into the void is worse than a teacher reported as unreachable.
 */
function isPlausibleMobile(normalized: string): boolean {
  return /^628\d{7,11}$/.test(normalized);
}

/**
 * Resolve phones for many teachers in one round trip — the blast walks the whole
 * roster, so a per-teacher query would be an N+1 against guru_sync.
 *
 * A guru teaching in several programs has one guru_sync row per program; the
 * freshest sync wins, and rows whose phone can't be normalized are skipped in
 * favour of an older row that can. Every requested guruId is present in the
 * returned map — null means "no usable number", which the caller must surface
 * rather than paper over.
 */
export async function getTeacherPhoneMap(
  gurus: readonly { guruId: number; nama: string }[],
): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  if (gurus.length === 0) return out;

  // Same person can appear more than once in the input (one entry per halaqah);
  // collapse to one lookup per identity, keeping the first name we were given.
  const names = new Map<number, string>();
  for (const g of gurus) if (!names.has(g.guruId)) names.set(g.guruId, g.nama);

  const db = getDb();
  // Two sources, ranked: guru_sync (identity-keyed, preferred) then the halaqah's
  // own number but only for the halaqah's main teacher. `prio` makes the
  // preference explicit in the result set rather than in two round trips.
  // The name-keyed rows are NOT restricted to the requested ids: the whole point
  // is to find the twin account the caller does not know about.
  // Restricted to tilawah-sourced programs on purpose. Mabni numbers its own
  // teachers from 16 upward, so 13 of its ids collide with real tilawah ids
  // (mabni 22 = Sidqi Hilman Fahrezi, tilawah 22 = Inas Wafa Lestari). Today
  // every mabni row has a null phone so nothing leaks through the filters below,
  // but that is luck: the moment mabni exposes phone numbers, an unscoped lookup
  // would text one teacher another's recap.
  const res = await db.execute(sql`
    select tilawah_guru_id, name, phone, prio, synced_at from (
      select g.tilawah_guru_id, g.name, g.phone, 0 as prio, g.synced_at
      from guru_sync g
      join programs p on p.id = g.program_id and p.data_source_type = 'tilawah_api'
      where g.phone is not null and btrim(g.phone) <> ''
      union all
      select h.guru_id as tilawah_guru_id, h.pengajar as name, h.guru_phone as phone, 1 as prio, h.synced_at
      from halaqah_sync h
      join programs p on p.id = h.program_id and p.data_source_type = 'tilawah_api'
      where h.guru_id is not null
        and h.guru_phone is not null and btrim(h.guru_phone) <> ''
    ) candidates
    order by tilawah_guru_id, prio, synced_at desc
  `);

  const synced = new Map<number, string[]>();
  for (const row of res.rows) {
    const guruId = Number(row.tilawah_guru_id);
    const phone = row.phone as string | null;
    if (!Number.isFinite(guruId) || !phone) continue;
    const bucket = synced.get(guruId);
    if (bucket) bucket.push(phone);
    else synced.set(guruId, [phone]);
  }

  // Duplicate accounts are common in tilawah: the same teacher exists twice and
  // only ONE of the two carries the phone (Azka Wafa Wulandari teaches as id 1816 but
  // her number sits on id 1797). The CMS enforces a unique phone, so the number
  // cannot be copied onto the teaching account — matching on the exact name is
  // the only way to reach her. Exact, trimmed, case-insensitive only: a looser
  // match would eventually text the wrong person with someone else's recap.
  const byName = new Map<string, string>();
  for (const row of res.rows) {
    // guru_sync rows only (prio 0). A halaqah row pairs the halaqah's CURRENT
    // number with its possibly STALE pengajar name — exactly the mismatch that
    // sent recaps to the wrong person before, and reintroducing it through the
    // back door of a name lookup would be worse than leaving a teacher phoneless.
    if (Number(row.prio) !== 0) continue;
    const nama = typeof row.name === "string" ? row.name.trim().toLowerCase() : "";
    const phone = row.phone as string | null;
    if (!nama || !phone || byName.has(nama)) continue;
    byName.set(nama, phone);
  }

  for (const [guruId, nama] of names) {
    const candidates = synced.get(guruId) ?? [];
    let resolved: string | null = null;
    for (const candidate of candidates) {
      resolved = pickPhone(nama, candidate);
      if (resolved) break;
    }
    if (!resolved) {
      // Known duplicate account (names may differ: "Aisyah Shofia Safitri" 2817 vs
      // "Amina Anisa Hidayat" 2128), so the name lookup below would miss it.
      for (const twinId of guruIdGroup(guruId)) {
        if (twinId === guruId) continue;
        for (const candidate of synced.get(twinId) ?? []) {
          resolved = pickPhone(nama, candidate);
          if (resolved) break;
        }
        if (resolved) break;
      }
    }
    if (!resolved) {
      const twin = byName.get(nama.trim().toLowerCase());
      if (twin) resolved = pickPhone(nama, twin);
    }
    // No guru_sync row at all (or none usable) still goes through pickPhone, so
    // a manual override can cover a teacher tilawah never gave us a number for.
    out.set(guruId, resolved ?? pickPhone(nama, null));
  }

  return out;
}
