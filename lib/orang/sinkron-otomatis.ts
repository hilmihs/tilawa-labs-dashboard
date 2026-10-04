import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sinkronOrangTautan } from "./sinkron";
import { sinkronPeserta } from "./sinkron-peserta";
import { tautkanPanitia } from "./tautan-panitia";

/** Kunci advisory untuk sinkron orang; angka bebas, asal tetap. */
const KUNCI = 4_207_281;

/**
 * Sinkron `orang` ↔ akun pengajar, dijalankan di akhir setiap sync tilawah /
 * mabni / Maahir (permintaan pemilik 28 Sep 2026: "seluruh user yang bisa
 * disinkronkan"). Idempoten dan murah (beberapa query atas ratusan baris), jadi
 * tidak dijadwal terpisah — dashboard.edu bahkan tidak punya cron, sync-nya
 * dipicu tombol.
 *
 * Satu transaksi dengan kunci advisory: dua sync yang selesai bersamaan tidak
 * sama-sama membuat `orang` baru untuk pengajar yang sama. Galat apa pun hanya
 * dicatat — sinkron orang tidak boleh menjatuhkan sync yang memanggilnya.
 */
export async function sinkronOrangSetelahSync(asal: string): Promise<void> {
  try {
    const h = await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${KUNCI})`);
      return sinkronOrangTautan({ tulis: true, db: tx });
    });
    if (h.konflik.length) {
      console.warn(`[orang ${asal}] konflik dengan putusan pisah — tidak ada yang ditulis`, JSON.stringify(h.konflik).slice(0, 500));
      return;
    }
    if (h.pernyataan > 0) {
      const s = h.stat!;
      console.log(
        `[orang ${asal}] ${s.orangBaru} orang baru, ${s.orangUbah} dirapikan, ${s.orangGanda} digabung, ${s.tautanBaru} tautan baru` +
          (h.lewati.length ? `, ${h.lewati.length} dilewati (gender tak diketahui)` : ""),
      );
    }
  } catch (err) {
    console.warn(`[orang ${asal}] sinkron gagal: ${(err as Error).message.slice(0, 300)}`);
  }
  // Peserta kelas tatap muka → orang (kartu & tap "belajar"). Sesudah pengajar,
  // supaya akun tilawah yang juga mengajar memakai orang pengajarnya. Transaksi
  // sendiri: gagal di sini tidak membatalkan sinkron pengajar di atas.
  try {
    const p = await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${KUNCI})`);
      return sinkronPeserta({ tulis: true, db: tx });
    });
    if (p.pernyataan > 0) {
      const s = p.stat;
      console.log(
        `[orang ${asal}] peserta: ${s.tilawah.orangBaru + s.maahir.orangBaru} orang baru, ` +
          `${s.tilawah.tautanBaru + s.maahir.tautanBaru} tautan baru, ${s.diaktifkan} diaktifkan, ${s.dinonaktifkan} dinonaktifkan` +
          (p.lewati.length ? `, ${p.lewati.length} dilewati (gender tak diketahui)` : ""),
      );
    }
  } catch (err) {
    console.warn(`[orang ${asal}] sinkron peserta gagal: ${(err as Error).message.slice(0, 300)}`);
  }
  // Panitia acara → orang, supaya kepanitiaan & penilaian masuk CV.
  try {
    const p = await tautkanPanitia();
    if (p.tertaut || p.dibuat) console.log(`[orang ${asal}] panitia: ${p.tertaut} tertaut, ${p.dibuat} orang baru, ${p.tertinggal} menunggu manusia`);
  } catch (err) {
    console.warn(`[orang ${asal}] tautan panitia gagal: ${(err as Error).message.slice(0, 300)}`);
  }
}
