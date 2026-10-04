import ExcelJS from "exceljs";
import type { Absen, Petugas } from "@/lib/kantor/queries";
import { jamWib } from "@/lib/time/jakarta";

/** Satu baris per syaikh per hari; titik dalam bentuk tautan Google Maps. */
export function bangunKantorXlsx(absen: Absen[], petugas: Petugas[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kehadiran");
  ws.columns = [
    { header: "Tanggal", key: "tanggal", width: 12 },
    { header: "Syaikh", key: "nama", width: 32 },
    { header: "Jadwal masuk", key: "jadwal", width: 12 },
    { header: "Masuk", key: "masuk", width: 8 },
    { header: "Keluar", key: "keluar", width: 8 },
    { header: "Durasi (menit)", key: "durasi", width: 14 },
    { header: "Jarak masuk (m)", key: "jm", width: 15 },
    { header: "Jarak keluar (m)", key: "jk", width: 15 },
    { header: "Titik masuk", key: "tm", width: 45 },
    { header: "Titik keluar", key: "tk", width: 45 },
    { header: "Dicatat", key: "oleh", width: 28 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const nama = new Map(petugas.map((p) => [p.id, p.namaLatin]));
  const jadwal = new Map(petugas.map((p) => [p.id, p.jamMasuk]));
  const kunci = [...new Set(absen.map((a) => `${a.tanggal}|${a.petugasId}`))];
  const maps = (a?: Absen) => (a ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : "-");
  for (const k of kunci) {
    const [tanggal, pid] = k.split("|");
    const m = absen.find((a) => a.tanggal === tanggal && a.petugasId === pid && a.jenis === "masuk");
    const kl = absen.find((a) => a.tanggal === tanggal && a.petugasId === pid && a.jenis === "keluar");
    ws.addRow({
      tanggal,
      nama: nama.get(pid) ?? pid,
      jadwal: jadwal.get(pid) ?? "-",
      masuk: m ? jamWib(m.waktu) : "-",
      keluar: kl ? jamWib(kl.waktu) : "-",
      durasi: m && kl ? Math.round((kl.waktu.getTime() - m.waktu.getTime()) / 60_000) : "-",
      jm: m ? Math.round(m.jarakM) : "-",
      jk: kl ? Math.round(kl.jarakM) : "-",
      tm: maps(m),
      tk: maps(kl),
      oleh: m?.dicatatOleh || kl?.dicatatOleh ? `manual (${m?.dicatatOleh ?? kl?.dicatatOleh})` : "GPS",
    });
  }
  return wb;
}
