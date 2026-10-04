/**
 * Pesan WA kabar tidak hadir (ikhbar) dari syaikh ke mas'ul. Murni: diuji unit.
 * Ikhbar = memberi tahu, bukan memohon — tidak ada kalimat meminta izin atau menunggu jawaban.
 */
import type { AlasanIzin } from "./izin";
import { masehiHariAr } from "./tanggal-ar";
import { AR_IZIN } from "./teks-ar";

export function pesanIkhbar(v: {
  namaArab: string;
  dari: string;
  sampai: string;
  alasan: string;
  catatan: string | null;
}): string {
  const kapan =
    v.dari === v.sampai
      ? `يوم ${masehiHariAr(v.dari)}`
      : `من ${masehiHariAr(v.dari)} إلى ${masehiHariAr(v.sampai)}`;
  const sebab = AR_IZIN.alasan[v.alasan as AlasanIzin] ?? v.alasan;
  // Tanda tangan tanpa gelar: syaikh tidak menggelari dirinya sendiri.
  const nama = v.namaArab.replace(/^\s*(ال)?شيخ\s+/, "").trim();
  return [
    "السلام عليكم ورحمة الله وبركاته",
    `أُحيطكم علمًا بأني لن أحضر إلى المكتب ${kapan}.`,
    `السبب: ${sebab}`,
    ...(v.catatan ? [`ملاحظة: ${v.catatan}`] : []),
    "",
    nama,
  ].join("\n");
}

/** wa.me hanya menerima angka, tanpa "+". */
export function tautanWa(nomor: string, pesan: string): string {
  return `https://wa.me/${nomor.replace(/\D/g, "")}?text=${encodeURIComponent(pesan)}`;
}
