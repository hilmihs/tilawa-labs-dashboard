import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { absenRentang, listPetugas } from "@/lib/kantor/queries";
import { bangunKantorXlsx } from "@/lib/reports/kantor-xlsx";
import { jakartaDate } from "@/lib/time/jakarta";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "super_coordinator") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const hariIni = jakartaDate();
  const dari = ISO.test(url.searchParams.get("dari") ?? "") ? url.searchParams.get("dari")! : `${hariIni.slice(0, 7)}-01`;
  const sampai = ISO.test(url.searchParams.get("sampai") ?? "") ? url.searchParams.get("sampai")! : hariIni;
  const [absen, petugas] = await Promise.all([absenRentang(dari, sampai), listPetugas()]);
  const buf = await bangunKantorXlsx(absen, petugas).xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="operating-office-${dari}_${sampai}.xlsx"`,
    },
  });
}
