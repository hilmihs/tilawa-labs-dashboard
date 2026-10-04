import { loginToBerkah, type BerkahSession } from "./auth";
import type { BerkahEnvelope, BerkahPagination } from "./types";

/**
 * Authenticated GET against the the partner system admin API, JSON-parsed. On a 401/419
 * (expired Laravel session/CSRF) it re-logs-in ONCE and retries — so a long sync
 * survives a mid-run session expiry, and the manually-pasted-cookie path
 * (BERKAH_SESSION_COOKIE) degrades gracefully to a real login if it goes stale.
 *
 * The session is passed by reference in a holder so a refresh inside one call is
 * visible to later calls in the same sync.
 */
export type SessionHolder = { session: BerkahSession };

export async function berkahGet<T = Record<string, unknown>>(
  baseUrl: string,
  holder: SessionHolder,
  path: string,
): Promise<BerkahEnvelope<T>> {
  const doFetch = (s: BerkahSession) =>
    fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": s.xsrfToken,
        Cookie: s.cookieHeader,
      },
    });

  let res = await doFetch(holder.session);
  if (res.status === 401 || res.status === 419) {
    holder.session = await loginToBerkah(baseUrl);
    res = await doFetch(holder.session);
  }
  if (!res.ok) {
    throw new Error(`GET ${path} failed: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Authenticated GET returning the raw response TEXT (for the /api/users/export
 * CSV endpoint, which streams a CSV attachment rather than the JSON envelope).
 * Same 401/419 re-login-and-retry as berkahGet.
 */
export async function berkahGetText(
  baseUrl: string,
  holder: SessionHolder,
  path: string,
): Promise<string> {
  const doFetch = (s: BerkahSession) =>
    fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "text/csv, application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": s.xsrfToken,
        Cookie: s.cookieHeader,
      },
    });

  let res = await doFetch(holder.session);
  if (res.status === 401 || res.status === 419) {
    holder.session = await loginToBerkah(baseUrl);
    res = await doFetch(holder.session);
  }
  if (!res.ok) {
    throw new Error(`GET ${path} failed: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }
  return res.text();
}

/** Authenticated POST with a JSON body, JSON-parsed. 401/419 re-login-and-retry. */
export async function berkahPostJson<T = Record<string, unknown>>(
  baseUrl: string,
  holder: SessionHolder,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const doFetch = (s: BerkahSession) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN": s.xsrfToken,
        Cookie: s.cookieHeader,
      },
      body: JSON.stringify(body),
    });

  let res = await doFetch(holder.session);
  if (res.status === 401 || res.status === 419) {
    holder.session = await loginToBerkah(baseUrl);
    res = await doFetch(holder.session);
  }
  if (!res.ok) {
    throw new Error(`POST ${path} failed: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/** Authenticated GET of an arbitrary (possibly absolute) URL, returning text. */
export async function berkahFetchUrlText(
  baseUrl: string,
  holder: SessionHolder,
  url: string,
): Promise<string> {
  const full = url.startsWith("http") ? url : `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  const res = await fetch(full, {
    headers: {
      Accept: "text/csv, application/octet-stream, */*",
      "X-XSRF-TOKEN": holder.session.xsrfToken,
      Cookie: holder.session.cookieHeader,
    },
  });
  if (!res.ok) {
    throw new Error(`GET ${full} failed: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  }
  return res.text();
}

type PaginatedData = {
  pagination?: BerkahPagination;
  [itemsKey: string]: unknown;
};

/**
 * Paginated GET. `itemsKey` names the array field inside `data` — it varies per
 * endpoint: users → "users", history → "target_histories", targets → "targets",
 * business-units → "business". The page-size query key also varies (users uses
 * `pagesize`, others `per_page`), so it is passed explicitly.
 */
export async function berkahGetAllPages<T = Record<string, unknown>>(
  baseUrl: string,
  holder: SessionHolder,
  pathWithoutPage: string,
  itemsKey: string,
  { perPage = 100, pageSizeParam = "per_page" }: { perPage?: number; pageSizeParam?: string } = {},
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  while (true) {
    const sep = pathWithoutPage.includes("?") ? "&" : "?";
    const body = await berkahGet<PaginatedData>(
      baseUrl,
      holder,
      `${pathWithoutPage}${sep}page=${page}&${pageSizeParam}=${perPage}`,
    );
    const pageItems = (body.data[itemsKey] as T[] | undefined) ?? [];
    items.push(...pageItems);

    const pagination = body.data.pagination;
    if (!pagination || page >= pagination.last_page || pageItems.length === 0) break;
    page += 1;
  }
  return items;
}
