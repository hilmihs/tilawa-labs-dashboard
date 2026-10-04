import { getCurrentUser } from "@/lib/auth/current-user";
import { getDirektoriPeserta } from "@/lib/lintas/direktori";
import { bacaSaringPeserta, saringPeserta } from "@/lib/lintas/saringan";
import { LABEL_STATUS } from "@/lib/kelas/status";

const NAMA_TAB: Record<string, string> = { selesai: "selesai", semua: "semua" };
import { jakartaDate } from "@/lib/time/jakarta";
import { phoneLokal } from "@/lib/wa";

export const dynamic = "force-dynamic";

const sel = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV peserta (tab berjalan/selesai/semua) lintas program, saringan sama dengan /peserta (tanpa halaman). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = saringPeserta(await getDirektoriPeserta(user), bacaSaringPeserta(sp));
  const head = ["No", "Nama", "Gender", "Program", "Batch", "Halaqah", "Status kelas", "Pertemuan terakhir", "Pengajar", "Hadir %", "No HP"];
  const lines: string[] = [];
  let no = 0;
  for (const r of rows) {
    no += 1;
    // Satu baris per kelas: orang yang ikut dua kelas muncul dua baris dengan nomor yang sama.
    for (const k of r.kelas) {
      const hp = phoneLokal(r.hp);
      lines.push(
        [no, r.nama, r.gender === "L" ? "Ikhwan" : r.gender === "P" ? "Akhwat" : "", k.program, k.batch ?? "", k.halaqah, LABEL_STATUS[k.status], k.akhir ?? "", k.pengajar ?? "", k.hadir ?? "", hp ? `'${hp}` : ""]
          .map(sel)
          .join(","),
      );
    }
  }
  return new Response("﻿" + [head.join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Peserta-${NAMA_TAB[sp.status as string] ?? "berjalan"}_${jakartaDate()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
