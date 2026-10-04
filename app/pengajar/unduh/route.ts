import { getCurrentUser } from "@/lib/auth/current-user";
import { getDirektoriPengajar } from "@/lib/pengajar/direktori";
import { bacaSaringan, labelBulan, peranTambahan, teksPenugasan, terapkanSaringan } from "@/lib/pengajar/direktori-view";
import { jakartaDate } from "@/lib/time/jakarta";
import { phoneLokal } from "@/lib/wa";

export const dynamic = "force-dynamic";

const sel = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV direktori pengajar dengan saringan yang sama seperti /pengajar. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { rows: semua } = await getDirektoriPengajar(user);
  const rows = terapkanSaringan(semua, bacaSaringan(sp));

  const head = ["No", "Nama", "Gender", "Jumlah halaqah", "Mengajar di", "Halaqah", "Terdaftar tanpa halaqah", "Badal", "Peran & kelompok", "Qism", "Mustawa", "Kajian dihadiri", "Matrix Maahir", "No HP"];
  const lines = rows.map((r, i) =>
    [
      i + 1,
      r.nama,
      r.gender === "L" ? "Ikhwan" : r.gender === "P" ? "Akhwat" : "",
      r.mengajar && r.beban === 0 ? "Syaikh Maahir" : r.beban,
      r.penugasan.map(teksPenugasan).join("; "),
      r.penugasan
        .flatMap((p) => p.halaqah.map((h) => `${h.nama}${h.pendamping ? " (pendamping)" : ""}`))
        .join("; "),
      r.terdaftar.map((t) => `${t.program}${t.batch ? ` · ${t.batch}` : ""}`).join("; "),
      r.badal,
      peranTambahan(r).join("; "),
      r.qism ?? "",
      r.mustawa ?? "",
      r.orangId ? r.kajianHadir : "",
      r.matrix?.skor != null ? `${r.matrix.skor}${r.matrix.ranking != null ? ` (#${r.matrix.ranking}${r.matrix.dari ? `/${r.matrix.dari}` : ""})` : ""} ${labelBulan(r.matrix.bulan)}` : "",
      phoneLokal(r.hp) ? `'${phoneLokal(r.hp)}` : (r.hp ?? ""),
    ]
      .map(sel)
      .join(","),
  );
  // BOM supaya Excel membaca UTF-8; nomor HP diawali ' agar nol di depan tidak hilang.
  const body = "﻿" + [head.join(","), ...lines].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Pengajar_${jakartaDate()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
