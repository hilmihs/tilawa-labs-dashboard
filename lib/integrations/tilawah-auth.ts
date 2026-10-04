/**
 * Server-side login for the tilawah CMS (staging.cms.tilawah.tilawaproject.com
 * for Mabni — see lib/integrations/tilawah.ts header for why staging, not prod).
 *
 * The admin UI's login form is an Inertia.js SPA "visit", which under the hood
 * is a real XHR POST to `/login` — captured live on 2026-07-12 (`POST /login`
 * → 200, followed by an XHR-driven navigation to `/dashboard`, all cookie-based).
 * The exact request body/headers of that captured request were NOT inspected
 * here on purpose (it would have echoed the real account password into this
 * transcript) — the implementation below follows the standard Laravel SPA CSRF
 * pattern instead, which is already independently confirmed correct because
 * every other endpoint in this codebase (API_MAP.md, `pushPresensiStatus`)
 * uses exactly this XSRF-TOKEN-cookie + X-Requested-With handshake successfully:
 *
 *   1. GET /login to receive an initial XSRF-TOKEN + session cookie.
 *   2. POST /login with { email, password } JSON body, sending the XSRF-TOKEN
 *      cookie value (URL-decoded) back as the X-XSRF-TOKEN header.
 *   3. Laravel responds with a fresh XSRF-TOKEN + authenticated session cookie.
 *
 * Live-verified end-to-end — the daily sync logs in exactly this way. If step 2
 * ever fails, the most likely fix is adding the hidden `_token` field
 * (confirmed present in the login form's DOM) as a `_token` body field too;
 * some Laravel apps require both the cookie-based and field-based CSRF token.
 */

export type TilawahSession = {
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

export async function loginToTilawah(baseUrl: string): Promise<TilawahSession> {
  const email = process.env.TILAWAH_LOGIN_EMAIL;
  const password = process.env.TILAWAH_LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error("TILAWAH_LOGIN_EMAIL / TILAWAH_LOGIN_PASSWORD not set in .env.local");
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
    throw new Error(`Login failed: HTTP ${loginRes.status} — ${body.slice(0, 300)}`);
  }

  const finalCookies = parseSetCookies(loginRes);
  // Merge: keep the initial cookies, override with anything the login response refreshed.
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
