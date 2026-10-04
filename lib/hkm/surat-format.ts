/**
 * Pure formatting helpers for the HKM letters. Kept apart from
 * `surat-queries.ts` so the client bundle can import them without dragging in
 * the DB client.
 *
 * Everything here produces a *suggestion*. Upstream data drifts (a halaqah
 * labelled "Selasa & Jum'at" whose jadwal only ever has Tuesdays), names come
 * back in ALL CAPS, and the honorific in front of a teacher's name is stored
 * nowhere — so the UI lets the operator override every field.
 */
import { terbilang } from "@/lib/pdf/date-id";

export type Gender = "ikhwan" | "akhwat" | null;

/** "HANAFI RIVALDI" -> "Hanafi Rivaldi". Leaves the operator to fix the rest. */
export function titleCaseName(s: string): string {
  return s
    .toLocaleLowerCase("id-ID")
    .replace(/\p{L}+/gu, (w) => w.charAt(0).toLocaleUpperCase("id-ID") + w.slice(1))
    .trim();
}

/** "HKM 12 IKHWAN" -> { halaqah: "HKM 12", kelas: "HKM 12 - Ikhwan", gender }. */
export function splitHalaqahName(name: string | null): {
  halaqah: string | null;
  kelas: string | null;
  gender: Gender;
} {
  if (!name) return { halaqah: null, kelas: null, gender: null };
  const m = /^(.*?)\s*(IKHWAN|AKHWAT)\s*$/i.exec(name.trim());
  if (!m) return { halaqah: name.trim(), kelas: name.trim(), gender: null };
  const halaqah = m[1].trim();
  const gender: Gender = m[2].toLowerCase() === "ikhwan" ? "ikhwan" : "akhwat";
  return { halaqah, kelas: `${halaqah} - ${gender === "ikhwan" ? "Ikhwan" : "Akhwat"}`, gender };
}

export function honorific(gender: Gender): "Ustadz" | "Ustadzah" {
  return gender === "akhwat" ? "Ustadzah" : "Ustadz";
}

/** "Yusuf Qonita Firdaus" + akhwat -> "Ustadzah Tasmiah" (the reference's form). */
export function suggestPengajar(pengajarRaw: string | null, gender: Gender): string | null {
  if (!pengajarRaw?.trim()) return null;
  const first = titleCaseName(pengajarRaw.trim()).split(/\s+/)[0];
  return `${honorific(gender)} ${first}`;
}

/** "07:00 - 08:30" -> "07.00 - 08.30" (the reference writes times with dots). */
export function formatPukul(session: string | null): string | null {
  if (!session?.trim()) return null;
  return session.trim().replace(/(\d{1,2}):(\d{2})/g, "$1.$2");
}

/** Attendance counts -> the bullet lines of a surat peringatan. */
export function suggestPelanggaran(alfa: number, telat: number): string[] {
  const out: string[] = [];
  if (alfa > 0) out.push(`${terbilang(alfa)} kali (${alfa}×) alpa.`);
  if (telat > 0) out.push(`${terbilang(telat)} kali (${telat}×) terlambat.`);
  return out;
}
