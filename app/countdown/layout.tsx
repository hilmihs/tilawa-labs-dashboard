import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { KioskNav } from "@/components/shell/KioskNav";
import "./countdown.css";

/**
 * Plus Jakarta Sans, satu keluarga untuk seluruh papan — sesuai design.
 * Bobot 400–800 karena papan ini melompat dari teks 36 px ke angka 440 px, dan
 * angka sebesar itu butuh bobot 700 yang benar-benar digambar, bukan hasil
 * penebalan sintetis browser.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-countdown",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Countdown",
  description: "Hitung mundur momen ibadah & perjalanan.",
  robots: { index: false, follow: false },
};

export default function CountdownLayout({ children }: { children: React.ReactNode }) {
  // Di layout, bukan di page: gerbang password pun perlu jalan keluar — kalau
  // tidak, orang yang salah membuka /countdown dari HP-nya hanya punya tombol
  // Back browser, dan di TV kiosk tombol itu tidak ada.
  return (
    <div className={`${jakarta.variable} countdown-root`}>
      <KioskNav />
      {children}
    </div>
  );
}
