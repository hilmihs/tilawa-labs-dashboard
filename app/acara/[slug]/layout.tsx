import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { divisionRail } from "@/components/shell/sections";
import { requireStaff } from "@/lib/acara/access";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { SubNav } from "./SubNav";

export const dynamic = "force-dynamic";

export default async function AcaraLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const user = await requireStaff();
  const { slug } = await params;
  const acara = await getAcaraBySlug(slug);
  if (!acara) notFound();
  return (
    <AppShell email={user.email} title={acara.nama} railItems={divisionRail({ isSuper: user.role === "super_coordinator", includeOverview: true })}>
      <main className="mx-auto w-full max-w-[1400px] px-6 py-6">
        <SubNav slug={slug} />
        {children}
      </main>
    </AppShell>
  );
}
