import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

// /confirm/<token> is the public teacher gap-confirmation magic link — it
// authenticates via the signed token in the URL, not a coordinator session.
// /guru is the teacher portal (own guru_session cookie) and /persetujuan is the
// coordinator approval magic link — both public, gated by their own tokens.
// The teacher-facing socialisation deck used to be exempt here. It is gone on
// the demo branch: it was reachable without a session and one of its slide
// screenshots carries teacher names that were never anonymised. Nothing in
// public/ is public now except the brand assets excluded at the matcher.
// /tv is the Majelis wall board: aggregate counts + curated kabar only, no PII,
// meant to sit open on a TV with nobody logged in. The curation screens live at
// /berita (behind auth) and must never move under /tv.
// /countdown is the ibadah countdown screen. Public to the middleware, but not
// actually open: the page itself demands a shared password (page_passwords row,
// slug 'countdown') and renders nothing but the unlock form until the
// page_unlock_countdown cookie checks out. The gate lives in the page rather
// than here because it needs a DB lookup, which middleware can't do.
// /arahan is the Papan Amanah wall board and /arahan/isi is its input form. Both
// are fully open — no session, no shared password — because the form is meant to
// be reachable from anyone's phone in the meeting room. That is only acceptable
// because `directives` holds role and team labels ("Tim Program"), never PII, and
// because the form offers no permanent delete. Keep both properties or this route
// has to move behind a gate.
// /rekap/<token> is the monthly recap confirmation link, sent to teachers over
// WhatsApp. Same trust model as /confirm: the signed token in the URL IS the
// credential, and the recipients have no dashboard account — bouncing them to
// /login makes the whole blast a dead end.
const PUBLIC_PATHS = [
  "/login",
  "/confirm",
  "/rekap",
  "/guru",
  "/persetujuan",
  "/tv",
  // /publik: laporan program untuk donatur/mitra/jamaah. Model kepercayaan sama
  // dengan /tv — hanya agregat dan nama kelas, tanpa nama peserta (lib/publik/snapshot.ts).
  "/publik",
  "/countdown",
  "/arahan",
  // /acara/d/<token> adalah papan divisi kepanitiaan — tanpa akun, dijaga
  // token divisi (lib/auth/divisi-token.ts). Model kepercayaan sama dengan /rekap.
  "/acara/d",
  // /h/<kode> adalah kartu QR kehadiran per orang (49 bit acak di URL = kredensial),
  // /daftar/<slug> formulir daftar mandiri sebelum kajian. Keduanya dibagikan ke
  // pengajar yang tidak punya akun. Rancangan: docs/superpowers/specs/2026-09-11-presensi-qr-design.md
  "/h",
  "/daftar",
  // /api/daftar/* dipanggil server situs daftar eksternal (Vercel), bukan
  // browser — tanpa cookie sesi. Setiap rute menuntut Bearer DAFTAR_SITE_TOKEN
  // sendiri dan gagal tertutup bila token tidak diset (lib/hadir/situs.ts).
  // Rancangan: docs/superpowers/specs/2026-09-23-situs-daftar-design.md
  "/api/daftar",
  // /k/<token> — absen Operating Office para masyaikh. Token 32 byte acak di
  // URL = kredensial, dicabut dengan "buat ulang tautan". Rancangan:
  // docs/superpowers/specs/2026-09-23-operating-office-kehadiran-design.md
  "/k",
];

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // Exact match or a real sub-path — a bare startsWith would also open
  // /tvxyz, /guru-rahasia and friends.
  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}.`));

  if (!session && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (session && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/"; // root routes to the user's program (or /overview for supers)
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static assets)
     * - favicon.ico, icon.png, apple-icon.png, brand/ (logo assets — the login
     *   page and the public boards show them to logged-out visitors; without
     *   the exclusion they 307 to /login and render as broken images)
     * - api/cron, api/insights (protected by their own CRON_SECRET check, not user auth)
     * - api/admin (protected by its own OPS_SECRET/session check in assertOpsAuth)
     * - api/agent (protected by its own AGENT_TOKEN check in api/agent/_auth.ts).
     *   Without this exclusion a bearer caller gets a 307 to /login — which a
     *   client following redirects sees as HTTP 200 with login HTML, i.e. a
     *   success that carries no data. Silent, and worse than a 401.
     * - api/reports (self-gates as its very first action: requireProgramAccess
     *   for humans, AGENT_TOKEN for machines). ANY new route added under
     *   /api/reports/* must carry its own guard — the middleware no longer does.
     *
     * NOT excluded on purpose: api/warning-letters. The SP PDFs carry student
     * AND parent names; they keep the middleware as an outer layer and are not
     * granted to the agent at all.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|api/cron|api/insights|api/admin|api/agent|api/reports).*)",
  ],
};
