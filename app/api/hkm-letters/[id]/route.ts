import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { hkmLetters, programs } from "@/lib/db/schema";
import { resolveProgramAccess } from "@/lib/programs/resolve";
import { getFile } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves a generated HKM letter by id. Scoped to the program the letter belongs
 * to — being logged in is not enough, since these PDFs carry peserta names.
 * A caller without access gets 404, not 403: a 403 would confirm the letter
 * exists.
 *
 * Middleware also gates this path (api/hkm-letters is deliberately NOT in its
 * matcher exclusions); this is the second layer.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .select({
      pdfPath: hkmLetters.pdfPath,
      letterType: hkmLetters.letterType,
      level: hkmLetters.level,
      letterDate: hkmLetters.letterDate,
      slug: programs.slug,
    })
    .from(hkmLetters)
    .innerJoin(programs, eq(programs.id, hkmLetters.programId))
    .where(eq(hkmLetters.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await resolveProgramAccess(user, row.slug))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ASCII-only, derived from the letter's own metadata — never a peserta name,
  // which would leak PII into a header and into the reader's download folder.
  const kind =
    row.letterType === "peringatan" ? `Surat-Peringatan-${row.level ?? 1}` : "Surat-Penerimaan";
  const filename = `${kind}_${row.letterDate}.pdf`;

  try {
    const bytes = await getFile(`hkm-letters/${row.pdfPath}`);
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
