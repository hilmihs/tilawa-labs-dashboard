import type { Metadata } from "next";
import { listProgramWeek, readBoard, todayJakarta } from "@/lib/arahan/queries";
import { geserPekan, isSenin, seninPekanIni } from "@/lib/arahan/program";
import { Isi } from "./Isi";
import "./isi.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Isi Arahan",
  description: "Tambah dan perbarui arahan yang tampil di Task Board.",
  robots: { index: false, follow: false },
};

export default async function IsiPage({
  searchParams,
}: {
  searchParams: Promise<{ pekan?: string; tab?: string }>;
}) {
  const { pekan, tab } = await searchParams;
  const { directives, now } = await readBoard();
  const pekanIni = seninPekanIni(now);
  const weekStart = pekan && isSenin(pekan) ? pekan : pekanIni;
  // Pekan sebelumnya ikut dibaca untuk placeholder: fokus pekan lalu adalah
  // titik awal paling wajar saat mengisi pekan baru.
  const [programWeek, pekanLalu] = await Promise.all([
    listProgramWeek(weekStart),
    listProgramWeek(geserPekan(weekStart, -1)),
  ]);
  return (
    <Isi
      directives={directives}
      today={todayJakarta(now)}
      serverNow={now}
      initialTab={tab === "program" || pekan ? "program" : "tambah"}
      programWeek={programWeek}
      pekanLalu={pekanLalu}
      pekanIni={pekanIni}
    />
  );
}
