/**
 * Daily facts for Kelas Maahir, so it sits on the /tv wall like every other
 * program instead of reading "Tidak ada kelas" forever.
 *
 * Maahir has no jadwal_sync/attendance_sync rows — it is an API integration
 * whose presensi arrives as cached `rekap/kehadiran` responses (one per 28→27
 * report month). That payload already holds everything the SQL builds for the
 * other programs: per class, the sessions with a `filled` flag, and per peserta
 * a code per pertemuan. This module turns it into the same `DailyFact` shape.
 *
 * Code mapping, aligned with the tilawah statuses the wall uses elsewhere:
 *   hadir = H + T (terlambat still attended)
 *   eff   = H + T + A — izin and sakit are excused, as everywhere in this repo
 *   recorded = peserta with any code
 *
 * Staleness: sessions only exist in the payload up to the pull. A date after the
 * pull therefore has no sessions — which must NOT render as "Tidak ada kelas".
 * `maahirStale` lets the snapshot flag the row instead.
 */
import type { MaahirKehadiranPayload } from "@/lib/maahir/types";
import type { DailyFact } from "@/lib/tv/queries";

const HADIR = new Set(["H", "T"]);
const EFF = new Set(["H", "T", "A"]);
const TERCATAT = new Set(["H", "I", "S", "A", "T"]);

/**
 * One fact per date in [from, to] that has at least one Maahir session.
 * `payloads` may hold two report months (a week can straddle the 28th); a date
 * is only ever taken from sessions dated that day, so overlap cannot double.
 */
export function maahirDailyFacts(
  statsProgramId: string,
  payloads: MaahirKehadiranPayload[],
  from: string,
  to: string,
): DailyFact[] {
  const byDate = new Map<string, DailyFact>();
  const seen = new Set<string>(); // guards the same pertemuan/sesi appearing in both months

  for (const payload of payloads) {
    for (const kelas of payload) {
      for (const p of kelas.pertemuan) {
        if (p.tanggal < from || p.tanggal > to) continue;
        const key = `pertemuan|${kelas.kelasId}|${p.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let hadir = 0;
        let eff = 0;
        let recorded = 0;
        for (const a of kelas.anggota) {
          const kode = a.perPertemuan[p.id];
          if (!kode) continue;
          if (HADIR.has(kode)) hadir += 1;
          if (EFF.has(kode)) eff += 1;
          if (TERCATAT.has(kode)) recorded += 1;
        }
        const f = fact(byDate, statsProgramId, p.tanggal);
        f.hadir += hadir;
        f.eff += eff;
        f.recorded += recorded;
        if (recorded > 0) f.meetingsHeld += 1;
      }

      // The schedule side: per (tanggal, program), the larger of the planned
      // sessions and the pertemuan actually recorded. Sessions follow the class's
      // jadwalHari, so an extra or moved meeting shows up only as a pertemuan —
      // counting sessions alone let hadir exceed terjadwal (4 Sep: 7 recorded
      // meetings against 5 planned sessions).
      const sesi = new Map<string, number>();
      const temu = new Map<string, number>();
      const tambah = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
      for (const x of kelas.sessions) if (x.tanggal >= from && x.tanggal <= to) tambah(sesi, `${x.tanggal}|${x.program}`);
      for (const x of kelas.pertemuan) if (x.tanggal >= from && x.tanggal <= to) tambah(temu, `${x.tanggal}|${x.program}`);
      for (const k of new Set([...sesi.keys(), ...temu.keys()])) {
        const key = `jadwal|${kelas.kelasId}|${k}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const n = Math.max(sesi.get(k) ?? 0, temu.get(k) ?? 0);
        const f = fact(byDate, statsProgramId, k.slice(0, 10));
        f.meetingsScheduled += n;
        f.terjadwal += kelas.anggota.length * n;
      }
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Past sessions (from..to inclusive) whose presensi is still empty. */
export function maahirAnomali(payloads: MaahirKehadiranPayload[], from: string, to: string): number {
  const seen = new Set<string>();
  let n = 0;
  for (const payload of payloads) {
    for (const kelas of payload) {
      for (const s of kelas.sessions) {
        if (s.tanggal < from || s.tanggal > to || s.filled) continue;
        const key = `${kelas.kelasId}|${s.tanggal}|${s.program}`;
        if (seen.has(key)) continue;
        seen.add(key);
        n += 1;
      }
    }
  }
  return n;
}

/**
 * The board date is past what the cached pull can know about. `fetchedWib` is
 * the WIB date of the newest pull; the pull covers the day it ran, so only a
 * later date is unknown.
 */
export function maahirStale(boardDate: string, fetchedWib: string | null): boolean {
  return fetchedWib == null || boardDate > fetchedWib;
}

function fact(byDate: Map<string, DailyFact>, statsProgramId: string, date: string): DailyFact {
  let f = byDate.get(date);
  if (!f) {
    f = { statsProgramId, date, terjadwal: 0, meetingsScheduled: 0, meetingsHeld: 0, hadir: 0, eff: 0, recorded: 0 };
    byDate.set(date, f);
  }
  return f;
}
