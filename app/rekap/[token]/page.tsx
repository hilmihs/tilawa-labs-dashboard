import { verifyRecapToken } from "@/lib/auth/recap-token";
import { getTeacherRecap } from "@/lib/confirmations/recap";
import { isPresensiLocked, lockLabel, periodLabel } from "@/lib/confirmations/period";
import { RecapView } from "./RecapView";

/**
 * Magic-link landing page for the monthly teaching recap (WA blast → here).
 * The token is the only credential: it names the teacher and the period, and
 * nothing else on this page is trusted from the client. Data loading and the
 * lock decision happen here, on the server, so the client component receives
 * plain values — it never reads env or the clock, which would disagree with the
 * server the moment a phone's timezone or date is off.
 */

export const metadata = { title: "Konfirmasi Rekap Mengajar" };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Konfirmasi Rekap Mengajar</h1>
      </div>
      {children}
    </main>
  );
}

export default async function RekapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = await verifyRecapToken(token);

  if (!claims) {
    return (
      <Shell>
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Link tidak valid atau sudah kedaluwarsa. Mohon hubungi koordinator.
        </div>
      </Shell>
    );
  }

  // The period comes from the token, not from RECAP_PERIOD: a link sent for
  // July must keep showing July even after the env is rolled to the next month.
  const recap = await getTeacherRecap(claims.gid, claims.start, claims.end);

  if (!recap || recap.halaqah.length === 0) {
    return (
      <Shell>
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Ustadz/ah <b>{claims.nama}</b> · {periodLabel(claims.start, claims.end)}
        </p>
        <div className="rounded-lg border border-neutral-200 bg-card px-4 py-3 text-sm text-neutral-500 dark:border-neutral-800">
          Tidak ada pertemuan pada periode ini.
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <RecapView
        token={token}
        recap={recap}
        locked={isPresensiLocked()}
        periodText={periodLabel(recap.start, recap.end)}
        lockText={lockLabel()}
      />
    </Shell>
  );
}
