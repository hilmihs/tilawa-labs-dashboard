/**
 * Server-side login for the the partner system admin panel (cms.example.com).
 *
 * This is the SAME Laravel-SPA cookie/CSRF handshake as the tilawah CMS
 * (lib/integrations/tilawah-auth.ts) — cms.example.com's login is
 * an Inertia.js "visit" backed by a real XHR `POST /login`, cookie-based, with
 * the XSRF-TOKEN-cookie + X-Requested-With pattern. HKM CMS needs its
 * OWN active the partner system account: set BERKAH_LOGIN_EMAIL / BERKAH_LOGIN_PASSWORD. (If
 * those are unset we fall back to the TILAWAH_LOGIN_* creds, but note the two
 * systems can have different account activation states.)
 *
 *   1. GET /login → initial XSRF-TOKEN + session cookie.
 *   2. POST /login { email, password } with the decoded XSRF-TOKEN as the
 *      X-XSRF-TOKEN header → fresh authenticated session cookie.
 *
 * Bootstrap / escape hatch: if BERKAH_SESSION_COOKIE is set, we skip login and
 * use it verbatim (plus optional BERKAH_XSRF_TOKEN) — handy for local dev or if
 * the login endpoint ever adds a CAPTCHA/2FA. Callers should wrap requests to
 * re-login on a 401/419 (expired Laravel CSRF); see client.ts.
 */

export type BerkahSession = {
  cookieHeader: string;
  xsrfToken: string;
};

function parseSetCookies(res: Response): Map<string, string> {
  const cookies = new Map<string, string>();
  const raw =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get("set-cookie")?.split(/,(?=[^;]+?=)/) ?? []);

  for (const entry of raw) {
    const [pair] = entry.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return cookies;
}

function toCookieHeader(cookies: Map<string, string>): string {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

// The the partner system admin host is a public domain, not a secret. Default it so HKM sync
// works out of the box (incl. on the VPS, where deploy/.env need not carry it);
// still overridable via BERKAH_BASE_URL for a staging/alternate backend.
const DEFAULT_BERKAH_BASE_URL = "https://cms.example.com";

export function berkahBaseUrl(): string {
  const baseUrl = process.env.BERKAH_BASE_URL || DEFAULT_BERKAH_BASE_URL;
  return baseUrl.replace(/\/$/, "");
}

export async function loginToBerkah(baseUrl = berkahBaseUrl()): Promise<BerkahSession> {
  // Escape hatch: use a manually-pasted browser session verbatim.
  const pastedCookie = process.env.BERKAH_SESSION_COOKIE;
  if (pastedCookie) {
    const xsrf =
      process.env.BERKAH_XSRF_TOKEN ??
      pastedCookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ??
      "";
    return { cookieHeader: pastedCookie, xsrfToken: decodeURIComponent(xsrf) };
  }

  const email = process.env.BERKAH_LOGIN_EMAIL ?? process.env.TILAWAH_LOGIN_EMAIL;
  const password = process.env.BERKAH_LOGIN_PASSWORD ?? process.env.TILAWAH_LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "BERKAH_LOGIN_EMAIL / BERKAH_LOGIN_PASSWORD not set (nor TILAWAH_LOGIN_* fallback) — or set BERKAH_SESSION_COOKIE",
    );
  }

  const initial = await fetch(`${baseUrl}/login`, { redirect: "manual" });
  const initialCookies = parseSetCookies(initial);
  const initialXsrf = initialCookies.get("XSRF-TOKEN");
  if (!initialXsrf) {
    throw new Error("GET /login did not return an XSRF-TOKEN cookie — login page shape may have changed");
  }

  const loginRes = await fetch(`${baseUrl}/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-XSRF-TOKEN": decodeURIComponent(initialXsrf),
      Cookie: toCookieHeader(initialCookies),
    },
    body: JSON.stringify({ email, password }),
  });

  if (loginRes.status >= 400) {
    const body = await loginRes.text();
    throw new Error(`Berkah login failed: HTTP ${loginRes.status} — ${body.slice(0, 300)}`);
  }

  const finalCookies = parseSetCookies(loginRes);
  const merged = new Map([...initialCookies, ...finalCookies]);
  const sessionXsrf = merged.get("XSRF-TOKEN");
  if (!sessionXsrf) {
    throw new Error("POST /login succeeded but did not return a fresh XSRF-TOKEN cookie");
  }

  return {
    cookieHeader: toCookieHeader(merged),
    xsrfToken: decodeURIComponent(sessionXsrf),
  };
}
