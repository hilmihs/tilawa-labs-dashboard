import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import { listKlasifikasi, listOrangDirektori } from "@/lib/hadir/queries-golongan";
import { QISM } from "@/lib/hadir/qism";
import { PageHead } from "../[slug]/_ui";
import { BorongForm } from "./BorongForm";
import { TabelOrang } from "./TabelOrang";

export const metadata = { title: "Direktori orang" };
export const dynamic = "force-dynamic";

const input = "rounded border border-neutral-300 px-2 py-1.5 text-12 dark:border-neutral-700 dark:bg-neutral-900";

export default async function OrangPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const f = { q: sp.q, golonganId: sp.golongan, qism: sp.qism, gender: sp.gender, perluReview: sp.review === "1" };
  const [rows, golongan] = await Promise.all([listOrangDirektori(f), listKlasifikasi({ hanyaAktif: true })]);
  return (
    <AppShell email={user.email} title="Direktori orang" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[1200px] px-6 py-6">
        <PageHead title="Direktori orang">Cari, golongkan, dan lengkapi atribut. Nomor WA hanya ditampilkan 4 digit akhir.</PageHead>

        <form className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-12">Cari nama / WA<input name="q" defaultValue={sp.q ?? ""} className={`${input} block`} /></label>
          <label className="text-12">
            Golongan
            <select name="golongan" defaultValue={sp.golongan ?? ""} className={`${input} block`}>
              <option value="">Semua</option>
              {golongan.map((g) => <option key={g.id} value={g.id}>{g.nama} ({g.anggota})</option>)}
            </select>
          </label>
          <label className="text-12">
            Qism
            <select name="qism" defaultValue={sp.qism ?? ""} className={`${input} block`}>
              <option value="">Semua</option>
              {QISM.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </label>
          <label className="text-12">
            I/A
            <select name="gender" defaultValue={sp.gender ?? ""} className={`${input} block`}>
              <option value="">Semua</option><option value="L">Ikhwan</option><option value="P">Akhwat</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-12">
            <input type="checkbox" name="review" value="1" defaultChecked={sp.review === "1"} /> Perlu review
          </label>
          <button type="submit" className="rounded bg-neutral-900 px-3 py-1.5 text-12 text-white dark:bg-neutral-100 dark:text-neutral-900">Saring</button>
        </form>

        <BorongForm
          golongan={golongan.map((g) => ({ id: g.id, nama: g.nama }))}
          saringan={{ q: sp.q ?? "", golongan: sp.golongan ?? "", qism: sp.qism ?? "", gender: sp.gender ?? "" }}
          jumlahTampil={rows.length}
        />

        <p className="mb-2 text-12 text-muted-foreground">{rows.length} orang tampil (maks 200).</p>
        <TabelOrang rows={rows} golongan={golongan.map((g) => ({ id: g.id, nama: g.nama }))} />
      </main>
    </AppShell>
  );
}
