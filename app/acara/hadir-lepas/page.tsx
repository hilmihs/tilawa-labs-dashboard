import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import { sebaranJam } from "@/lib/hadir/lepas";
import { listAcaraTanggal, listHadirLepas, listTanggalLepas } from "@/lib/hadir/queries-lepas";
import { jamWibDari } from "@/lib/hadir/view-model";
import { PageHead, tglPendek } from "../[slug]/_ui";
import { KartuTanggal } from "./KartuTanggal";

export const metadata = { title: "Scan belum bertaut" };
export const dynamic = "force-dynamic";

export default async function HadirLepasPage({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const user = await requireStaff();
  const { pesan } = await searchParams;
  const tanggalList = await listTanggalLepas();
  const kartu = await Promise.all(
    tanggalList.map(async (t) => {
      const [baris, acaraPilihan] = await Promise.all([listHadirLepas(t.tanggal), listAcaraTanggal(t.tanggal)]);
      const sebaran = sebaranJam(baris);
      return {
        tanggal: t.tanggal,
        baris: baris.map((b) => ({ id: b.id, nama: b.nama, gender: b.gender, kodeQr: b.kodeQr, programTeks: b.programTeks, jam: jamWibDari(b.waktu) })),
        sebaran,
        acaraPilihan: acaraPilihan.map((a) => ({ id: a.id, nama: a.nama })),
        // Batas bawah = jam bucket pertama; batas atas = bucket terakhir + ":59",
        // supaya "sampai 17:00" tidak diam-diam membuang scan 17.30.
        jamAwal: sebaran[0]?.jam ?? "00:00",
        jamAkhir: sebaran.length > 0 ? `${sebaran[sebaran.length - 1].jam.slice(0, 2)}:59` : "23:59",
      };
    }),
  );
  return (
    <AppShell email={user.email} title="Scan belum bertaut" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[1000px] px-6 py-6">
        <PageHead title="Scan belum bertaut">
          Hasil pemindai tanpa kegiatan. Menautkan memindahkan scan ke kehadiran kegiatan itu — rekap baru ikut berubah setelah itu. Hanya kegiatan bertanggal sama yang bisa dipilih.
        </PageHead>
        {pesan && (
          <p className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-12 dark:border-green-800 dark:bg-green-950/30">{pesan}</p>
        )}
        {kartu.length === 0 ? (
          <p className="text-12 text-muted-foreground">Tidak ada scan yang menunggu. Semua sudah bertaut.</p>
        ) : (
          <div className="grid gap-4">
            {kartu.map((k) => (
              <KartuTanggal
                key={k.tanggal}
                tanggal={k.tanggal}
                label={tglPendek(k.tanggal)}
                baris={k.baris}
                sebaran={k.sebaran}
                acaraPilihan={k.acaraPilihan}
                jamAwal={k.jamAwal}
                jamAkhir={k.jamAkhir}
              />
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
