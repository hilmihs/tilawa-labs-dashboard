import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFile } from "@/lib/storage";

// Middleware already blocks unauthenticated requests to non-/login paths, but
// double-check here since this route serves real students' names/PII in the PDF.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path } = await params;
  // Reject any segment that could escape the storage root.
  if (path.some((segment) => segment.includes("..") || segment.includes("/"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const bytes = await getFile(`warning-letters/${path.join("/")}`);
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: { "Content-Type": "application/pdf" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
