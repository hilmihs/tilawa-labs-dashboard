import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import { getDb } from "@/lib/db/client";
import { kpiPanitia } from "@/lib/penilaian/queries";
import { ImporNilai } from "./ImporNilai";

export const metadata = { title: "Impor penilaian" };
export const dynamic = "force-dynamic";

/** Impor penilaian dari xlsx / Google Form untuk satu acara (design p4). */
export default async function ImporPenilaianPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireStaff();
  const { slug } = await params;
  const a = (await getDb().execute(sql`select slug, nama from acara where slug = ${slug} limit 1`)).rows[0] as
    | { slug: string; nama: string }
    | undefined;
  if (!a) notFound();
  const kpi = await kpiPanitia();
  return (
    <AppShell email={user.email} title="Impor penilaian" railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-6 sm:px-6">
        <header>
          <nav className="text-xs text-neutral-500">
            <Link href="/penilaian" className="hover:text-primary hover:underline">Penilaian</Link> ·{" "}
            <Link href={`/penilaian/${a.slug}`} className="hover:text-primary hover:underline">{a.nama}</Link>
          </nav>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Impor penilaian · {a.nama}</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Untuk evaluasi panitia yang sudah terkumpul di Google Form atau spreadsheet. Nama dicocokkan ke panitia acara
            ini, lalu ke Daftar Individu; nama ganda tidak ditebak.
          </p>
        </header>
        <ImporNilai slug={a.slug} kpi={kpi} />
      </main>
    </AppShell>
  );
}
