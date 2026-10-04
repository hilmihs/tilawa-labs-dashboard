import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ekstrakKode } from "@/lib/hadir/kode";
import { getOrangByKode, listSemuaOrangAktif } from "@/lib/hadir/queries";
import { insertHadirLepasBatch, kunciLepasAda } from "@/lib/hadir/queries-lepas";
import { rencanakanBatchLepas, tanggalScan, type EventLepas } from "@/lib/hadir/lepas";
import type { StatusScan } from "@/lib/hadir/view-model";

export const dynamic = "force-dynamic";

type EventMasuk = { klienId: string; orangId?: string | null; kode?: string | null; waktu: string; metode?: string; perangkatId?: string | null };

/**
 * Batch dari antrean pemindai global. Idempoten: klien_id ganda dan orang yang
 * sudah tercatat di hari itu dijawab "sudah", tidak menulis. Tidak ada jendela
 * scan — tanpa kegiatan tidak ada jam buka/tutup.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  let body: { events?: EventMasuk[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json tidak valid" }, { status: 400 });
  }
  const masuk = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
  const hasil: Record<string, { status: StatusScan; orangId: string | null; nama?: string }> = {};
  const events: EventLepas[] = [];
  const namaByOrang = new Map<string, string>();
  for (const e of masuk) {
    if (typeof e?.klienId !== "string" || typeof e.waktu !== "string" || Number.isNaN(Date.parse(e.waktu))) continue;
    let orangId = typeof e.orangId === "string" ? e.orangId : null;
    if (!orangId) {
      const kode = ekstrakKode(e.kode ?? null);
      const o = kode ? await getOrangByKode(kode) : null;
      if (!o || o.status !== "aktif") { hasil[e.klienId] = { status: "tak_dikenal", orangId: null }; continue; }
      orangId = o.id;
      namaByOrang.set(o.id, o.nama);
    }
    const metode = e.metode === "cari_nama" ? "cari_nama" : e.metode === "manual" ? "manual" : "qr";
    events.push({ klienId: e.klienId, orangId, waktu: e.waktu, metode, perangkatId: typeof e.perangkatId === "string" ? e.perangkatId.slice(0, 64) : null });
  }

  const tanggalTersentuh = [...new Set(events.map((e) => tanggalScan(e.waktu)))];
  const [sudahAda, dikenal] = await Promise.all([kunciLepasAda(tanggalTersentuh), listSemuaOrangAktif()]);
  const { tulis, status } = rencanakanBatchLepas(events, sudahAda, dikenal);
  try {
    await insertHadirLepasBatch(tulis, user.sub);
  } catch (e) {
    console.error("scan lepas gagal", e);
    return NextResponse.json({ error: "gagal menyimpan" }, { status: 500 });
  }
  for (const [klienId, s] of status) {
    const ev = events.find((x) => x.klienId === klienId);
    hasil[klienId] = { status: s, orangId: ev?.orangId ?? null, nama: ev ? namaByOrang.get(ev.orangId) : undefined };
  }
  return NextResponse.json({ hasil }, { headers: { "cache-control": "no-store" } });
}
