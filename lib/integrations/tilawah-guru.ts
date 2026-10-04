/**
 * The teacher who actually runs a tilawah halaqah.
 *
 * A halaqah can carry more than one guru pivot. On 18 Sep 2026
 * scripts/perbaiki-nama-pengajar-17sep.ts sent `halaqahs` built from
 * halaqah_sync without filtering the data source, so Mabni halaqah ids 16 and
 * 22 were read as tilawah ids and the PUT ADDED guru pivots to HITS 003 Ikhwan
 * Juni (Aulia #18 next to Nadia Nur Cahyani #27) and HITS 042 Akhwat Juni (Lalu #22
 * next to Laila Abdul Anggraini #45). Taking the first pivot then showed — and sent
 * wa.me reminders to — the wrong teacher.
 *
 * Rule: ignore deactivated pivots; the guru who holds the most pertemuan
 * (jadwals[].guru_id) wins, badal sessions being a minority; without pertemuan
 * data, prefer the pivot whose account gender matches an AKHWAT/IKHWAN class
 * name (1 = L, 2 = P); otherwise the first pivot, as before.
 */
export type GuruPivotUser = {
  id: number;
  gender?: number | null;
  pivot?: { type?: string | null; status?: number | null } | null;
};

export function guruUtama<U extends GuruPivotUser>(
  users: readonly U[] | null | undefined,
  jadwals: readonly { guru_id?: number | null }[] | null | undefined,
  halaqahName?: string | null,
): U | null {
  const all = (users ?? []).filter((u) => u.pivot?.type === "guru");
  const aktif = all.filter((u) => u.pivot?.status !== 0);
  const gurus = aktif.length > 0 ? aktif : all;
  if (gurus.length <= 1) return gurus[0] ?? null;

  const held = new Map<number, number>();
  for (const j of jadwals ?? []) if (j.guru_id != null) held.set(j.guru_id, (held.get(j.guru_id) ?? 0) + 1);
  const ranked = [...gurus].sort((a, b) => (held.get(b.id) ?? 0) - (held.get(a.id) ?? 0));
  if ((held.get(ranked[0].id) ?? 0) > 0) return ranked[0];

  const kategori = /\bAKHWAT\b/i.test(halaqahName ?? "") ? 2 : /\bIKHWAN\b/i.test(halaqahName ?? "") ? 1 : null;
  return (kategori != null ? gurus.find((g) => g.gender === kategori) : undefined) ?? gurus[0];
}
