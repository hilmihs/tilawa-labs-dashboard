import { Amiri, IBM_Plex_Sans_Arabic } from "next/font/google";

/**
 * Halaman petugas memakai palet tetap (hijau tua, krem, emas) di terang maupun
 * gelap — desain "Absensi Guru" 2a/1d/1e/1f. Teks isi Plex Arabic, nama & judul Amiri.
 */
const plex = IBM_Plex_Sans_Arabic({ variable: "--font-k", subsets: ["arabic"], weight: ["400", "500", "600", "700"] });
const amiri = Amiri({ variable: "--font-k-judul", subsets: ["arabic"], weight: ["400", "700"] });

export default function LayoutPetugas({ children }: { children: React.ReactNode }) {
  return (
    <div
      lang="ar"
      dir="rtl"
      className={`${plex.variable} ${amiri.variable} min-h-dvh bg-[#F7F2E8] text-[#1C2A23] [font-family:var(--font-k),sans-serif]`}
    >
      {children}
    </div>
  );
}
