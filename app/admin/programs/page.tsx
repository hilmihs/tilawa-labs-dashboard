import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireSuperUser } from "@/lib/auth/require";
import { listProgramDiscoveries, listProgramSync } from "@/lib/admin/service";
import { ProgramsAdmin } from "./ProgramsAdmin";

export const metadata = { title: "Program & Sync" };
export const dynamic = "force-dynamic";
// A per-program sync pulls from an external API — give it room.
export const maxDuration = 300;

export default async function AdminProgramsPage() {
  const user = await requireSuperUser();
  const [rows, discoveries] = await Promise.all([listProgramSync(), listProgramDiscoveries()]);

  return (
    <AppShell email={user.email} title="Program & Sync" railItems={divisionRail({ isSuper: true, includeOverview: true })}>
      {/* Halaman daftar + aksi, bukan tabel lebar: tetap sempit supaya barisnya
          terbaca sebagai satu ritme dari atas ke bawah. */}
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-20 font-bold tracking-[-0.01em]">Program &amp; Sync</h1>
          <p className="text-sm text-ink-muted mt-1">
            Jeda, lanjutkan, dan tarik data program tanpa SSH.
          </p>
        </div>
        <ProgramsAdmin rows={rows} discoveries={discoveries} />
      </main>
    </AppShell>
  );
}
