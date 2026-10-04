import { redirect } from "next/navigation";

/** Tautan lama: kiosk sekarang satu untuk semua di /scan (kerja, kegiatan, mengajar). */
export default async function ScanLamaPage({ searchParams }: { searchParams: Promise<{ kiosk?: string }> }) {
  const { kiosk } = await searchParams;
  redirect(kiosk === "1" ? "/scan?kiosk=1" : "/scan");
}
