import { verifyApprovalToken } from "@/lib/auth/approval-token";
import { getRequest } from "@/lib/guru-requests/queries";
import { ApprovalView } from "./ApprovalView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Persetujuan Perubahan Pertemuan" };

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-5 text-lg font-semibold">Persetujuan Perubahan Pertemuan</h1>
      {children}
    </main>
  );
}

export default async function ApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = await verifyApprovalToken(token);

  if (!claims) {
    return (
      <Shell>
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Link tidak valid atau sudah kedaluwarsa.
        </div>
      </Shell>
    );
  }

  const req = await getRequest(claims.rid);
  if (!req) {
    return (
      <Shell>
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Pengajuan tidak ditemukan.
        </div>
      </Shell>
    );
  }

  const summary =
    req.requestType === "badal"
      ? `Ganti guru → ${req.newGuruName ?? `guru #${req.newGuruId}`}`
      : `Pindah ke ${fmtDate(req.newScheduleDate)} · ${(req.newStartAt ?? "").slice(11, 16)}–${(req.newEndAt ?? "").slice(11, 16)}`;

  return (
    <Shell>
      <ApprovalView
        token={token}
        status={req.status}
        requestType={req.requestType}
        guruName={req.requestedByName}
        halaqahId={req.tilawahHalaqahId}
        jadwalId={req.tilawahJadwalId}
        summary={summary}
        reason={req.reasonText}
      />
    </Shell>
  );
}
