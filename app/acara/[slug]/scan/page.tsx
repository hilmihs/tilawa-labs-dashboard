import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { baseUrl } from "@/lib/hadir/base-url";
import { tambahOrangHadir } from "../hadir/actions";
import { Scanner } from "./Scanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan kehadiran" };

/**
 * Pemindai QR untuk HP panitia dan tablet kiosk (?kiosk=1). Sesi staff biasa —
 * middleware sudah menjaga rute ini. Roster & antrean scan disimpan di
 * localStorage supaya tetap jalan saat sinyal hilang.
 */
export default async function ScanPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ kiosk?: string }> }) {
  const { slug } = await params;
  const { kiosk } = await searchParams;
  const acara = await getAcaraBySlug(slug);
  if (!acara) notFound();
  const base = await baseUrl();
  const urlDaftar = `${base}/daftar/${slug}`;
  const qrDaftar = acara.terimaPendaftaran ? await QRCode.toString(urlDaftar, { type: "svg", margin: 1, width: 240 }) : null;
  return (
    <Scanner
      sumber={{
        kunciLokal: slug,
        urlRoster: `/api/hadir/${slug}/roster`,
        urlScan: `/api/hadir/${slug}/scan`,
        urlPanel: `/acara/${slug}/hadir`,
        urlKembali: `/acara/${slug}/scan${kiosk === "1" ? "?kiosk=1" : ""}`,
      }}
      namaAcara={acara.pemateri ? `${acara.nama} — ${acara.pemateri}` : acara.nama}
      kiosk={kiosk === "1"}
      qrDaftarSvg={qrDaftar}
      urlDaftar={urlDaftar}
      aksiTambah={tambahOrangHadir.bind(null, slug)}
    />
  );
}
