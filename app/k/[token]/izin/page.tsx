import { getPetugasByToken } from "@/lib/kantor/queries";
import { AR } from "@/lib/kantor/teks-ar";
import { tokenSah } from "@/lib/kantor/token";
import { addDaysISO, jakartaDate } from "@/lib/time/jakarta";
import { FormIzin } from "./FormIzin";

export const dynamic = "force-dynamic";
export const metadata = { title: "إخبار بالغياب", robots: { index: false, follow: false } };

export default async function HalamanIzin({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const petugas = tokenSah(token) ? await getPetugasByToken(token) : null;
  if (!petugas) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">{AR.tautanTidakSah}</p>
      </main>
    );
  }
  const hariIni = jakartaDate();
  return <FormIzin token={token} hariIni={hariIni} besok={addDaysISO(hariIni, 1)} />;
}
