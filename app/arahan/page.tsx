import { readBoard, readProgramBoard } from "@/lib/arahan/queries";
import { KioskNav } from "@/components/shell/KioskNav";
import { Board } from "./Board";

// Papan dinding: selalu baca DB per permintaan, jangan pernah prerender. Papan
// yang menampilkan arahan bulan lalu lebih buruk daripada papan yang kosong.
export const dynamic = "force-dynamic";

/**
 * Dua mode:
 *   /arahan               — Task Board saja. Mode utama.
 *   /arahan?mode=rotasi   — Task Board → Fokus Program Pekanan → Board Screen
 *                           (data kemarin), bergilir.
 */
export default async function ArahanPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const rotasi = (await searchParams).mode === "rotasi";
  // Instant server ikut dibaca di lapisan query lalu dikirim sebagai prop, supaya
  // render pertama di klien memakai angka usia yang sama persis — kalau tidak,
  // hydration mismatch tepat di pergantian tengah malam Jakarta.
  const { directives, now } = await readBoard();
  // Fokus program hanya dibaca kalau memang akan diputar.
  const program = rotasi ? await readProgramBoard(now) : null;
  // KioskNav dipasang di page, bukan di layout: layout yang sama membungkus
  // /arahan/isi, dan pil melayang di pojok kiri atas akan menabrak judul form
  // di layar HP. Form itu punya tautannya sendiri, di dalam alur bacanya.
  return (
    <>
      <KioskNav current={rotasi ? "/arahan?mode=rotasi" : "/arahan"} />
      <Board directives={directives} program={program} rotasi={rotasi} serverNow={now} />
    </>
  );
}
