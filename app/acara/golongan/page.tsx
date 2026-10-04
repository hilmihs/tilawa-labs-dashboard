import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import { listKlasifikasi } from "@/lib/hadir/queries-golongan";
import { PageHead } from "../[slug]/_ui";
import { BarisGolongan, FormBuatGolongan } from "./FormGolongan";

export const metadata = { title: "Golongan" };
export const dynamic = "force-dynamic";

export default async function GolonganPage() {
  const user = await requireStaff();
  const rows = await listKlasifikasi();
  return (
    <AppShell email={user.email} title="Golongan" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[1100px] px-6 py-6">
        <PageHead title="Golongan orang">
          Satu orang boleh masuk beberapa golongan. Golongan dipakai untuk menetapkan target peserta wajib per acara dan untuk rekap klasifikasi. Nonaktif bukan hapus — golongan yang pernah jadi target acara harus tetap ada.
        </PageHead>
        <FormBuatGolongan />
        <section className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 text-14 font-semibold">{rows.length} golongan</h2>
          {rows.map((g) => (
            <BarisGolongan
              key={g.id}
              g={{ id: g.id, slug: g.slug, nama: g.nama, keterangan: g.keterangan, urutan: g.urutan, aktif: g.aktif, anggota: g.anggota }}
            />
          ))}
        </section>
      </main>
    </AppShell>
  );
}
