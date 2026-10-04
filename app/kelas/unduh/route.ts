import { getCurrentUser } from "@/lib/auth/current-user";
import { getDirektoriKelas } from "@/lib/lintas/direktori";
import { bacaSaringKelas, saringKelas } from "@/lib/lintas/saringan";
import { LABEL_STATUS } from "@/lib/kelas/status";
import { jakartaDate } from "@/lib/time/jakarta";

export const dynamic = "force-dynamic";

const sel = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV kelas aktif lintas program, saringan sama dengan /kelas. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = saringKelas(await getDirektoriKelas(user), bacaSaringKelas(sp));
  const head = ["No", "Kelas", "Program", "Batch", "Status", "Pertemuan terakhir", "Pengajar", "Jenis", "Peserta", "Rata² hadir %", "Jadwal", "Tipe"];
  const lines = rows.map((r, i) =>
    [i + 1, r.nama, r.program, r.batch ?? "", LABEL_STATUS[r.status], r.akhir ?? "", r.pengajar ?? "", r.jenis === "L" ? "Ikhwan" : r.jenis === "P" ? "Akhwat" : "", r.peserta, r.hadir ?? "", r.jadwal ?? "", r.tipe ?? ""]
      .map(sel)
      .join(","),
  );
  return new Response("﻿" + [head.join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Kelas-${sp.status === "selesai" || sp.status === "semua" ? sp.status : "berjalan"}_${jakartaDate()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
