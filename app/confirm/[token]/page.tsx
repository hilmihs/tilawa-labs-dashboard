import { verifyGapToken } from "@/lib/auth/gap-token";
import { getHalaqahConfirmView } from "@/lib/confirmations/queries";
import { ConfirmForm } from "./ConfirmForm";

export const metadata = { title: "Konfirmasi Kehadiran Mengajar" };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Konfirmasi Kehadiran Mengajar</h1>
      </div>
      {children}
    </main>
  );
}

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = await verifyGapToken(token);

  if (!claims) {
    return (
      <Shell>
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Link tidak valid atau sudah kedaluwarsa. Minta koordinator mengirim ulang.
        </div>
      </Shell>
    );
  }

  const view = await getHalaqahConfirmView(claims.pid, claims.hid);

  return (
    <Shell>
      <p className="mb-1 text-sm text-neutral-600 dark:text-neutral-400">
        {claims.pengajar ? <>Ustadz/ah <b>{claims.pengajar}</b> · </> : null}
        Halaqah <b>{view.halaqahName ?? "-"}</b>
      </p>
      <p className="mb-5 text-sm text-neutral-500">
        Mohon konfirmasi pertemuan berikut yang presensinya belum terisi.
      </p>

      {view.meetings.length === 0 ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          Tidak ada pertemuan yang perlu dikonfirmasi. Jazaakumullahu khairan. 🎉
        </div>
      ) : (
        <ConfirmForm token={token} meetings={view.meetings} />
      )}
    </Shell>
  );
}
