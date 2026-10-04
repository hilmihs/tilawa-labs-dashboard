import { headers } from "next/headers";

/**
 * URL dasar absolut untuk isi QR dan tautan yang dibagikan. Urutan:
 * APP_BASE_URL (env, sama dengan tautan magic /confirm) → header proxy
 * (x-forwarded-*) → Host. Env didahulukan karena nginx di prod tidak dijamin
 * meneruskan Host publik ke Node — QR berisi 127.0.0.1:3009 tidak berguna.
 */
function dariEnv(): string | null {
  const v = (process.env.APP_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/]+$/.test(v) && !/localhost|127\.0\.0\.1/.test(v) ? v : null;
}

export async function baseUrl(): Promise<string> {
  const env = dariEnv();
  if (env) return env;
  const h = await headers();
  return dariHeader((k) => h.get(k));
}

/** Versi untuk route handler (punya Request, tidak perlu next/headers). */
export function baseUrlDariRequest(req: Request): string {
  const env = dariEnv();
  if (env) return env;
  const u = new URL(req.url);
  return dariHeader((k) => req.headers.get(k), u.protocol.replace(":", ""), u.host);
}

function dariHeader(get: (k: string) => string | null, protoDefault = "https", hostDefault = "localhost:3000"): string {
  const proto = get("x-forwarded-proto") ?? protoDefault;
  const host = get("x-forwarded-host") ?? get("host") ?? hostDefault;
  return `${proto}://${host}`;
}
