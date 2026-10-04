import type { Metadata } from "next";
import "./publik.css";

export const metadata: Metadata = {
  title: { default: "Publik", template: "%s · Education Board" },
  description: "Laporan program Education Board — jumlah peserta, pengajar dan kelas.",
  // Agregat tanpa nama peserta, tetapi belum disetujui pengurus untuk diindeks.
  robots: { index: false, follow: false },
};

export default function PublikLayout({ children }: { children: React.ReactNode }) {
  return <div className="publik">{children}</div>;
}
