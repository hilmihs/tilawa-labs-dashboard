import { catatAksesToken, resolveDivisiToken } from "@/lib/acara/access";
import {
  getDivisiById,
  listBarangDivisi,
  listDivisiAcara,
  listJobdeskDivisi,
  listPanitiaDivisi,
  listTugasDivisi,
} from "@/lib/acara/queries";
import { LABEL_SUMBER, type BarangSumber } from "@/lib/acara/types";
import {
  bolehUbahStatusTugas,
  formatJumlah,
  hMinus,
  hakAksesDivisi,
  susunPapanTugas,
  totalHarga,
} from "@/lib/acara/view-model";
import { todayJakarta } from "@/lib/time/jakarta";
import { PapanDivisi, type PapanData } from "./PapanDivisi";

/**
 * Papan divisi — halaman yang dibuka 60 panitia dari HP, tanpa akun. Token
 * adalah satu-satunya kredensial. Semua pemuatan dan keputusan hak akses
 * terjadi di sini (server); komponen klien menerima nilai polos.
 *
 * ?lihat=<id divisi> menampilkan papan divisi lain acara yang sama, BACA SAJA,
 * tanpa nomor WA. Itu jawaban atas evaluasi the institute 2 "tidak ada komunikasi antar
 * PIC": semua divisi melihat papan yang sama, bukan sistem terpisah-pisah.
 */

export const metadata = { title: "Papan Divisi" };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-xl px-4 py-5">{children}</main>;
}

export default async function PapanDivisiPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lihat?: string }>;
}) {
  const { token } = await params;
  const { lihat } = await searchParams;
  const akses = await resolveDivisiToken(token);

  if (!akses) {
    return (
      <Shell>
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Tautan tidak valid atau sudah kedaluwarsa. Hubungi koordinator untuk tautan baru.
        </div>
      </Shell>
    );
  }

  // Divisi yang ditampilkan: sendiri (tulis) atau divisi lain acara ini (baca).
  // ?lihat menuju kolom uuid — teks bukan-uuid dan array (?lihat=a&lihat=b)
  // bikin pg melempar galat "invalid input syntax for type uuid", bukan null.
  // Saring dulu di sini: lihat yang HADIR tapi bukan uuid valid jatuh ke cabang
  // "tidak bisa dilihat" yang sudah ada, bukan diam-diam balik ke papan sendiri.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const lihatId = typeof lihat === "string" && UUID_RE.test(lihat) ? lihat : null;
  const lihatTidakValid = lihat !== undefined && lihatId === null;
  const divisiTarget = lihatTidakValid
    ? null
    : lihatId && lihatId !== akses.divisi.id
      ? await getDivisiById(lihatId)
      : akses.divisi;
  const hak = divisiTarget ? hakAksesDivisi(akses.payload, akses.divisi, divisiTarget) : null;
  if (!divisiTarget || !hak) {
    return (
      <Shell>
        <p className="text-sm text-neutral-600">Divisi ini tidak bisa dilihat dari tautan Anda.</p>
      </Shell>
    );
  }
  const divisi = divisiTarget;

  const today = todayJakarta();
  const [panitia, tugas, jobdesk, barang, semuaDivisi] = await Promise.all([
    listPanitiaDivisi(akses.acara.id, divisi.id),
    listTugasDivisi(akses.acara.id, divisi.id),
    listJobdeskDivisi(divisi.id),
    listBarangDivisi(akses.acara.id, divisi.id),
    listDivisiAcara(akses.acara.id),
  ]);
  await catatAksesToken(akses, "buka", hak === "baca" ? { tabel: "acara_divisi", id: divisi.id } : null);

  const pic = panitia.find((p) => p.peran === "pic");
  const data: PapanData = {
    token,
    bolehTulis: hak === "tulis",
    acara: { nama: akses.acara.nama, tanggal: akses.acara.tanggal, hMinus: hMinus(akses.acara.tanggal, today) },
    divisi: { id: divisi.id, nama: divisi.nama, sisi: divisi.sisi },
    divisiLain: semuaDivisi
      .filter((d) => d.id !== akses.divisi.id)
      .map((d) => ({ id: d.id, nama: d.nama, sisi: d.sisi })),
    divisiSaya: { id: akses.divisi.id, nama: akses.divisi.nama },
    pic: pic ? `${pic.gelar ? pic.gelar + " " : ""}${pic.nama}` : null,
    // Nomor WA tidak pernah dikirim ke klien dari halaman ini — bahkan untuk
    // divisi sendiri. Kalau nanti dibutuhkan, itu keputusan terpisah.
    anggota: panitia.filter((p) => p.peran !== "pic").map((p) => p.nama),
    tugas: susunPapanTugas(tugas, today).map((t) => ({
      id: t.id, judul: t.judul, tenggat: t.tenggat, status: t.status,
      prioritas: t.prioritas, terlambat: t.terlambat, beres: t.beres,
      terkunci: !bolehUbahStatusTugas(t.status),
    })),
    jobdesk: jobdesk.map((j) => ({
      id: j.id, isi: j.isi, sudahJadiTugas: tugas.some((t) => t.dariJobdeskId === j.id),
    })),
    barang: barang.map((b) => ({
      id: b.id, nama: b.nama, jumlah: formatJumlah(b.jumlah), satuan: b.satuan,
      total: totalHarga(b.jumlah, b.hargaSatuan),
      sumberLabel: b.sumber ? LABEL_SUMBER[b.sumber as BarangSumber] ?? b.sumber : null,
      statusApproval: b.statusApproval, alasanTolak: b.alasanTolak,
    })),
  };

  return (
    <Shell>
      <PapanDivisi data={data} />
    </Shell>
  );
}
