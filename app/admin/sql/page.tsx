import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SqlConsole } from "./SqlConsole";

export const metadata = { title: "Konsol SQL" };
export const dynamic = "force-dynamic";

export default async function AdminSqlPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Super-only surface; coordinators get bounced to their overview.
  if (user.role !== "super_coordinator") redirect("/overview");

  const disabled = process.env.ADMIN_SQL_ENABLED === "false";

  return (
    <AppShell email={user.email} title="Konsol SQL" railItems={divisionRail({ isSuper: true, includeOverview: true })}>
      {/* Halaman tabel: hasil query bisa belasan kolom. */}
      <main className="mx-auto w-full max-w-[1600px] px-6 py-8 space-y-6">
        <div>
          <h1 className="text-20 font-bold tracking-[-0.01em]">Konsol SQL</h1>
          <p className="text-sm text-ink-muted mt-1">
            Query read-only ke database (khusus super coordinator). Satu statement,
            transaksi read-only + timeout 8 detik. Semua query tercatat di audit.
          </p>
        </div>

        {disabled ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Konsol SQL dinonaktifkan lewat <code>ADMIN_SQL_ENABLED=false</code>.
          </div>
        ) : (
          <SqlConsole />
        )}
      </main>
    </AppShell>
  );
}
