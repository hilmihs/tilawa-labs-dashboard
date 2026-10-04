/**
 * Bentuk baru nama halaqah Mabni (permintaan pemilik 22 Sep 2026).
 *
 * Yang lama: "(M1) Ikhwan - Selasa & Jumat - Ghina & Ismi & Tasmiah" — memuat
 * hari DAN nama pengajar, padahal keduanya sudah punya kolom sendiri di tabel
 * halaqah (Jadwal dan Pengajar). Yang baru: "M1 - usbui 1 (ikh)".
 *
 * Gender tetap disebut meski ada kolom Jenis — diminta eksplisit ("ikhwan
 * akhwatnya perlu di-mention").
 *
 * Nomornya DETERMINISTIK: diurutkan hari lalu nama lama, jadi dua kali jalan
 * menghasilkan nomor yang sama dan daftar yang sudah disetujui tidak berubah
 * diam-diam di antara pratinjau dan penulisan.
 */
export type KelasUntukNama = {
  id: number;
  nama: string;
  gender: string | null;
  jenis_pertemuan: string | null;
  hari: number[] | null;
  jenjang: { nama: string } | null;
};

export type HasilNamaKelas = {
  id: number;
  namaLama: string;
  namaBaru: string | null;
  /** null bila namaBaru terbentuk; berisi sebab bila tidak. */
  alasan: string | null;
  berubah: boolean;
};

const GENDER_PENDEK: Record<string, string> = { ikhwan: "ikh", akhwat: "akh" };

/**
 * Ejaan jenis pertemuan seperti yang ditulis pemilik: berhuruf besar dan
 * ber-apostrof. Nilai mentah dari mabni ("usbui"/"yaumi") tidak dipakai apa
 * adanya di nama halaqah.
 */
const JENIS_TAMPIL: Record<string, string> = { usbui: "Usbu'i", yaumi: "Yaumi" };

function kunciUrut(k: KelasUntukNama): string {
  const hari = (k.hari ?? []).join("-").padStart(8, "0");
  return `${hari}|${k.nama}`;
}

export function namaKelasBaru(kelas: readonly KelasUntukNama[]): HasilNamaKelas[] {
  // Kelompokkan dulu, lalu nomori di dalam kelompok yang sudah terurut.
  const kelompok = new Map<string, KelasUntukNama[]>();
  const gagal = new Map<number, string>();
  for (const k of kelas) {
    const level = k.jenjang?.nama?.trim();
    const jenis = k.jenis_pertemuan?.trim().toLowerCase();
    const gender = k.gender?.trim().toLowerCase();
    if (!level) { gagal.set(k.id, "jenjang kosong"); continue; }
    if (!jenis || !JENIS_TAMPIL[jenis]) { gagal.set(k.id, "jenis pertemuan kosong"); continue; }
    if (!gender || !GENDER_PENDEK[gender]) { gagal.set(k.id, "gender kosong"); continue; }
    const key = `${level}|${jenis}|${gender}`;
    kelompok.set(key, [...(kelompok.get(key) ?? []), k]);
  }

  const baru = new Map<number, string>();
  for (const [key, anggota] of kelompok) {
    const [level, jenis, gender] = key.split("|");
    [...anggota]
      .sort((a, b) => kunciUrut(a).localeCompare(kunciUrut(b)))
      .forEach((k, i) => {
        baru.set(k.id, `${level} - ${JENIS_TAMPIL[jenis]} ${i + 1} (${GENDER_PENDEK[gender]})`);
      });
  }

  return kelas.map((k) => {
    const namaBaru = baru.get(k.id) ?? null;
    return {
      id: k.id,
      namaLama: k.nama,
      namaBaru,
      alasan: namaBaru ? null : (gagal.get(k.id) ?? "tidak diketahui"),
      berubah: namaBaru != null && namaBaru !== k.nama,
    };
  });
}
