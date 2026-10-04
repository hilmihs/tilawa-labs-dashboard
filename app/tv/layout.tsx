import type { Metadata } from "next";
import { Archivo, Newsreader, Amiri } from "next/font/google";
import { KioskNav } from "@/components/shell/KioskNav";
import "./tv.css";

/**
 * Three families, three voices — down from four.
 *
 * Archivo is a grotesque with true tabular lining figures and wide apertures,
 * so it carries every number and every micro-label on the board. Newsreader is
 * the editorial voice: it was drawn for news on screens and has a real display
 * cut and a true italic, which is what the visi, the kabar headlines and the
 * hadith translation need to sound like a majelis rather than a SaaS dashboard.
 * Amiri renders the Arabic.
 *
 * IBM Plex Sans Condensed is gone on purpose: condensed type exists to cram
 * rows in, and this board stopped cramming.
 */
const ui = Archivo({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const serif = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});
const arabic = Amiri({ variable: "--font-arabic", subsets: ["arabic"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Layar Education Board",
  description: "Pemantauan kehadiran harian lintas program & kabar pekanan.",
  robots: { index: false, follow: false },
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  // KioskNav, not AppShell: this board is meant to run with nobody logged in, so
  // the rail's account block and sync button have nothing to say here. It sits
  // in the layout rather than the page so any future /tv/* inherits the way out.
  return (
    <div className={`${ui.variable} ${serif.variable} ${arabic.variable}`}>
      <KioskNav />
      {children}
    </div>
  );
}
