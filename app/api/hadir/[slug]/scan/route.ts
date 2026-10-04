import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAcaraBySlug } from "@/lib/acara/queries";
import { ekstrakKode } from "@/lib/hadir/kode";
import { getOrangByKode, insertHadirBatch, listOrangIdAcara, listSemuaOrangAktif } from "@/lib/hadir/queries";
import { rencanakanBatch, type ScanEvent, type StatusScan } from "@/lib/hadir/view-model";

export const dynamic = "force-dynamic";

type EventMasuk = { klienId: string; orangId?: string | null; kode?: string | null; waktu: string; metode?: string; perangkatId?: string | null };

/**
 * Terima batch dari antrean pemindai. Idempoten: klien_id ganda dan orang yang
 * sudah hadir dijawab "sudah", tidak menulis. Jam server menegakkan jendela.
 * Event tanpa orangId (kode tak ada di roster lokal) diselesaikan lewat kode.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { slug } = await ctx.params;
  const acara = await getAcaraBySlug(slug);
  if (!acara) return NextResponse.json({ error: "acara tidak ditemukan" }, { status: 404 });

  let body: { events?: EventMasuk[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json tidak valid" }, { status: 400 });
  }
  const masuk = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
  const hasil: Record<string, { status: StatusScan; orangId: string | null; nama?: string }> = {};
  const events: ScanEvent[] = [];
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

  const [{ hadir }, dikenal] = await Promise.all([listOrangIdAcara(acara.id), listSemuaOrangAktif()]);
  const rencana = rencanakanBatch(events, hadir, dikenal, {
    bukaISO: acara.scanBukaAt?.toISOString() ?? null,
    tutupISO: acara.scanTutupAt?.toISOString() ?? null,
  });
  const ditulis = await insertHadirBatch(acara.id, rencana.tulis, user.sub);
  for (const e of events) {
    let status = rencana.status.get(e.klienId) ?? "tak_dikenal";
    // Dua pemindai offline bisa memegang orang yang sama: ON CONFLICT menolak yang datang belakangan.
    if (status === "baru" && !ditulis.has(e.orangId)) status = "sudah";
    hasil[e.klienId] = { status, orangId: e.orangId, nama: namaByOrang.get(e.orangId) };
  }
  return NextResponse.json({ hasil, serverAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
