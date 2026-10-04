/**
 * Scan tanpa kegiatan. Fungsi murni, tanpa DB — diuji di lepas.test.ts.
 *
 * Bedanya dengan view-model.ts (`rencanakanBatch`): kuncinya HARI + orang, bukan
 * kegiatan + orang, dan tidak ada penolakan jendela scan — tanpa kegiatan tidak
 * ada jam buka/tutup yang bisa dilanggar.
 */
import { jakartaDate } from "@/lib/time/jakarta";
import { jamWibDari, type MetodeHadir, type StatusScan } from "./view-model";

export type EventLepas = {
  klienId: string;
  orangId: string;
  waktu: string; // ISO, jam perangkat pemindai
  metode: MetodeHadir;
  perangkatId?: string | null;
};

export type BarisLepasBaru = EventLepas & { tanggal: string };

/**
 * Hari WIB milik satu scan, dihitung dari waktu scan itu sendiri. Bukan dari
 * `new Date()`: antrean offline yang baru terkirim lewat tengah malam harus
 * tetap jatuh di hari kajiannya.
 */
export function tanggalScan(waktuISO: string): string {
  return jakartaDate(new Date(waktuISO));
}

/** Kunci idempotensi satu baris lepas. */
export function kunciLepas(tanggal: string, orangId: string): string {
  return `${tanggal}|${orangId}`;
}

/**
 * Rencana tulis untuk satu batch dari antrean pemindai global. Buang klien_id
 * ganda (kiriman ulang), satu orang satu kali per HARI (yang paling awal
 * menang), tolak orang yang tidak dikenal, dan tandai "sudah" bila DB sudah
 * punya barisnya untuk hari itu. Hasil `tulis` masih melewati
 * ON CONFLICT DO NOTHING di DB — dua pemindai offline bisa memegang orang yang
 * sama.
 */
export function rencanakanBatchLepas(
  events: readonly EventLepas[],
  sudahAda: ReadonlySet<string>,
  orangDikenal: ReadonlySet<string>,
): { tulis: BarisLepasBaru[]; status: Map<string, StatusScan> } {
  const status = new Map<string, StatusScan>();
  const tulis: BarisLepasBaru[] = [];
  const lihatKlien = new Set<string>();
  const lihatHariOrang = new Set<string>();
  const urut = [...events].sort((a, b) => a.waktu.localeCompare(b.waktu));
  for (const e of urut) {
    if (lihatKlien.has(e.klienId)) continue;
    lihatKlien.add(e.klienId);
    if (!orangDikenal.has(e.orangId)) { status.set(e.klienId, "tak_dikenal"); continue; }
    const tanggal = tanggalScan(e.waktu);
    const k = kunciLepas(tanggal, e.orangId);
    if (sudahAda.has(k) || lihatHariOrang.has(k)) { status.set(e.klienId, "sudah"); continue; }
    lihatHariOrang.add(k);
    tulis.push({ ...e, tanggal });
    status.set(e.klienId, "baru");
  }
  return { tulis, status };
}

/**
 * Jumlah scan per jam WIB, hanya jam yang berisi, urut naik. Inilah yang
 * membuat "pagi 40 orang, sore 22" terlihat tanpa membaca 62 baris — dan yang
 * dipakai mengisi rentang jam saat menautkan.
 */
export function sebaranJam(rows: readonly { waktu: string }[]): { jam: string; jumlah: number }[] {
  const per = new Map<string, number>();
  for (const r of rows) {
    const jam = `${jamWibDari(r.waktu).slice(0, 2)}:00`;
    per.set(jam, (per.get(jam) ?? 0) + 1);
  }
  return [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([jam, jumlah]) => ({ jam, jumlah }));
}

/**
 * Baris di dalam rentang jam WIB, INKLUSIF di dua ujung, dibandingkan pada
 * presisi menit ("HH:MM" — bentuk yang dikirim <input type="time">).
 * `null` di salah satu ujung = tanpa batas di ujung itu.
 */
export function pilihRentang<T extends { waktu: string }>(
  rows: readonly T[],
  dariJam: string | null,
  sampaiJam: string | null,
): T[] {
  return rows.filter((r) => {
    const j = jamWibDari(r.waktu);
    if (dariJam && j < dariJam) return false;
    if (sampaiJam && j > sampaiJam) return false;
    return true;
  });
}
