import { type TilawahSession } from "./tilawah-auth";

/** Standard response envelope for every tilawah API endpoint (see API_MAP.md). */
export type TilawahEnvelope<T> = {
  status: string;
  code: number;
  message: string;
  data: T;
  spent: number;
};

/** Authenticated GET against the tilawah CMS API, JSON-parsed. */
export async function tilawahGet<T = Record<string, unknown>>(
  baseUrl: string,
  session: TilawahSession,
  path: string,
): Promise<TilawahEnvelope<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-XSRF-TOKEN": session.xsrfToken,
      Cookie: session.cookieHeader,
    },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

type PaginatedData = {
  pagination?: { last_page: number };
  [itemsKey: string]: unknown;
};

/**
 * Paginated GET. `itemsKey` names the array field inside `data` — list endpoints
 * on this API don't agree on a single key name (confirmed live 2026-07-12):
 * programs -> "programs", batches -> "batches", halaqah list -> "halaqohs"
 * (sic, typo in the API itself), absensi-murid report -> "items".
 */
export async function tilawahGetAllPages<T = Record<string, unknown>>(
  baseUrl: string,
  session: TilawahSession,
  pathWithoutPage: string,
  itemsKey: string,
  perPage = 100,
): Promise<T[]> {
  const items: T[] = [];
  let size = perPage;
  let page = 1;
  // Rows of the current page already held from an earlier, larger page.
  let skip = 0;
  while (true) {
    const sep = pathWithoutPage.includes("?") ? "&" : "?";
    let body: TilawahEnvelope<PaginatedData>;
    try {
      body = await tilawahGet<PaginatedData>(
        baseUrl,
        session,
        `${pathWithoutPage}${sep}page=${page}&per_page=${size}`,
      );
    } catch (err) {
      const smaller = SHRINK.find((n) => n < size);
      if (!isUpstreamTimeout(err) || smaller == null) throw err;
      // Re-address the same position with a smaller page: the rows already
      // collected fix the offset, and the part of the new page they cover is
      // skipped, so nothing is fetched twice or left out.
      size = smaller;
      page = Math.floor(items.length / size) + 1;
      skip = items.length % size;
      continue;
    }
    const pageItems = (body.data[itemsKey] as T[] | undefined) ?? [];
    items.push(...pageItems.slice(skip));
    skip = 0;

    const pagination = body.data.pagination;
    if (!pagination || page >= pagination.last_page || pageItems.length === 0) break;
    page += 1;
  }
  return items;
}

/**
 * Page sizes to fall back to. Tilawah guards its list endpoints with its own
 * ~15 s timeout and answers HTTP 500 "API Timeout atau Error" when a page takes
 * longer. The cost is per row (≈0.4–0.6 s per halaqah on 17 Sep 2026), so a
 * 100-row page of the big HITS batches failed every sync while 10 rows took 6 s.
 */
const SHRINK = [50, 25, 10, 5];

/** Tilawah's own timeout reply, as thrown by `tilawahGet`. Other failures are not retried. */
function isUpstreamTimeout(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /HTTP 5\d\d/.test(msg) && /timeout/i.test(msg);
}
