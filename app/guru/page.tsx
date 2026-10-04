import { redirect } from "next/navigation";
import { getGuruSession } from "@/lib/guru-portal/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal Guru — Masuk" };

export default async function GuruLoginPage() {
  const session = await getGuruSession();
  if (session) redirect("/guru/halaqah");

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <div className="mb-6">
        <h1 className="text-20 font-semibold tracking-[-0.01em]">Portal Guru</h1>
        <p className="mt-1 text-14 text-ink-muted">
          Masuk untuk mengatur jadwal &amp; badal pertemuan halaqah Anda.
        </p>
      </div>
      <LoginForm />
      <p className="mt-6 text-12 text-ink-faint">
        Perubahan yang Ustadz/ah ajukan akan dikonfirmasi koordinator sebelum diterapkan.
      </p>
    </main>
  );
}
