import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireSuperUser } from "@/lib/auth/require";
import { listPrograms, listStaff } from "@/lib/admin/service";
import { listDivisionGrants } from "@/lib/news/service";
import { UsersAdmin } from "./UsersAdmin";

export const metadata = { title: "Pengguna & Akses" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await requireSuperUser();
  const [staff, programs, divisionGrants] = await Promise.all([
    listStaff(),
    listPrograms(),
    listDivisionGrants(),
  ]);

  return (
    <AppShell email={user.email} title="Pengguna & Akses" railItems={divisionRail({ isSuper: true, includeOverview: true })}>
      {/* Halaman form/daftar, bukan tabel lebar. */}
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-20 font-bold tracking-[-0.01em]">Pengguna &amp; Akses</h1>
          <p className="text-sm text-ink-muted mt-1">
            Buat akun, ganti role, dan atur akses program.{" "}
            <span
              title="Semua aksi tercatat di audit. Perubahan akses program baru berlaku saat user login berikutnya."
              className="cursor-help underline decoration-dotted underline-offset-2"
            >
              Kapan berlakunya?
            </span>
          </p>
        </div>
        <UsersAdmin staff={staff} programs={programs} divisionGrants={divisionGrants} />
      </main>
    </AppShell>
  );
}
