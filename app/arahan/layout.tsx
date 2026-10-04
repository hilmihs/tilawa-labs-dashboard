import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./arahan.css";

/**
 * Plus Jakarta Sans, satu keluarga untuk papan dan formnya — sesuai design.
 * Bobot 400–800 karena papan melompat dari teks 32 px ke angka usia 104 px, dan
 * angka sebesar itu butuh bobot 700 yang benar-benar digambar, bukan hasil
 * penebalan sintetis browser.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-arahan",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Task Board",
  description: "Board Directives — Education Board.",
  robots: { index: false, follow: false },
};

export default function ArahanLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} arahan-root`}>{children}</div>;
}
